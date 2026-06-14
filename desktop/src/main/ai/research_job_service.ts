import { randomUUID } from 'node:crypto';
import { generateText } from 'ai';
import { dbManager, type JsDatabase } from '@/core/database';
import { appConfigManager } from '@/main/app-config/manager';
import type {
  AiAgentFeatureConfig,
  AiCitation,
  AiResearchEvent,
  AiResearchJob,
  AiResearchJobStatus,
  AiResearchRunOptions,
  AiResearchSource,
  AiResearchSourceType,
  AiResearchStage,
  ListAiResearchJobsPayload,
  RetryAiResearchPayload,
  StartAiResearchPayload,
} from '@/contracts/ai';
import type { KnowledgeSearchPayload, KnowledgeSearchResult } from '@/contracts/knowledge';
import { aiEmbeddingService } from './embedding_service';
import { findAiModel, findAiProvider, resolveLanguageModel } from './provider_registry';
import { resolveGroundingContext } from './tools/grounding_service';

type AiResearchDatabase = JsDatabase & {
  createAiResearchJob: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getAiResearchJob: (id: string) => Promise<Record<string, unknown>>;
  listAiResearchJobs: (input?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  updateAiResearchJob: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  insertAiResearchSource: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listAiResearchSources: (jobId: string) => Promise<Record<string, unknown>[]>;
  searchKnowledge: (input: KnowledgeSearchPayload) => Promise<KnowledgeSearchResult[]>;
};

type AiResearchListener = (event: AiResearchEvent) => void;

const DEFAULT_MAX_RESEARCH_SOURCES = 10;

class AiResearchJobService {
  private readonly listeners = new Set<AiResearchListener>();
  private readonly controllers = new Map<string, AbortController>();

  onResearchEvent(listener: AiResearchListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listJobs(input?: ListAiResearchJobsPayload): Promise<AiResearchJob[]> {
    const rows = await this.db().listAiResearchJobs({
      status: input?.status,
      limit: input?.limit,
    });
    const jobs = rows.map(mapResearchJob);
    await Promise.all(jobs.map(async (job) => {
      job.sources = await this.listSources(job.id);
    }));
    return jobs;
  }

  async getJob(jobId: string): Promise<AiResearchJob> {
    const job = mapResearchJob(await this.db().getAiResearchJob(jobId));
    job.sources = await this.listSources(jobId);
    return job;
  }

  async listSources(jobId: string): Promise<AiResearchSource[]> {
    const rows = await this.db().listAiResearchSources(jobId);
    return rows.map(mapResearchSource);
  }

  async startResearch(input: StartAiResearchPayload): Promise<AiResearchJob> {
    const query = input.query.trim();
    if (!query) {
      throw new Error('请输入 Deep Research 主题');
    }

    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const providerId = input.options?.providerId || config.defaultProviderId || config.providers.find((item) => item.enabled)?.id;
    const provider = providerId ? findAiProvider(config, providerId) : undefined;
    const modelId = input.options?.modelId
      || config.defaultChatModelId
      || provider?.models.find((model) => !model.capabilities.embedding)?.id
      || provider?.models[0]?.id;
    if (!provider || !modelId || !findAiModel(config, provider.id, modelId)) {
      throw new Error('请先配置可用于 Deep Research 的 AI 模型');
    }

    const options: AiResearchRunOptions = {
      webSearchMode: input.options?.webSearchMode ?? 'force',
      knowledgeSearchMode: input.options?.knowledgeSearchMode ?? 'force',
      maxSources: input.options?.maxSources ?? DEFAULT_MAX_RESEARCH_SOURCES,
      libraryId: input.options?.libraryId || config.research.defaultKnowledgeLibraryId,
      spaceId: input.options?.spaceId || config.research.defaultKnowledgeSpaceId,
      providerId: provider.id,
      modelId,
    };
    const job = mapResearchJob(await this.db().createAiResearchJob({
      id: randomUUID(),
      title: input.title?.trim() || buildResearchTitle(query),
      query,
      status: 'queued',
      stage: 'plan',
      providerId: provider.id,
      modelId,
      progress: 0,
      optionsJson: JSON.stringify(options),
    }));
    this.emit({ type: 'research-job', job });
    void this.runPipeline(job.id, config, options).catch((): undefined => undefined);
    return job;
  }

  async retryResearch(input: RetryAiResearchPayload): Promise<AiResearchJob> {
    const job = await this.getJob(input.jobId);
    return this.startResearch({
      query: job.query,
      title: `${job.title} retry`,
      options: job.options,
    });
  }

  async cancelResearch(jobId: string): Promise<AiResearchJob> {
    this.controllers.get(jobId)?.abort();
    const job = await this.updateJob(jobId, {
      status: 'cancelled',
      stage: 'done',
      progress: 100,
      completedAt: new Date().toISOString(),
      errorMessage: '用户取消',
    });
    return job;
  }

  private async runPipeline(jobId: string, config: AiAgentFeatureConfig, options: AiResearchRunOptions) {
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    try {
      let job = await this.updateJob(jobId, { status: 'running', stage: 'plan', progress: 5 });
      const model = resolveLanguageModel(config, options.providerId || job.providerId || '', options.modelId || job.modelId || '');
      const plan = await this.generatePlan(model, job.query, controller.signal);
      this.throwIfCancelled(controller);

      job = await this.updateJob(jobId, {
        stage: 'search',
        progress: 20,
        optionsJson: JSON.stringify({ ...(job.options ?? options), plan }),
      });
      const queries = buildResearchQueries(job.query, plan);
      const citations = await this.searchSources(config, options, queries, controller.signal);
      if (!citations.length) {
        throw new Error('没有找到可用于 Deep Research 的 web 或知识库来源');
      }
      const sources = await this.persistSources(jobId, citations);
      this.throwIfCancelled(controller);

      await this.updateJob(jobId, { stage: 'read', progress: 45 });
      const summarizedSources = await this.summarizeSources(model, job.query, sources, controller.signal);
      this.throwIfCancelled(controller);

      await this.updateJob(jobId, { stage: 'synthesize', progress: 75 });
      const report = await this.synthesizeReport(model, job.query, plan, summarizedSources, controller.signal);
      this.throwIfCancelled(controller);

      await this.updateJob(jobId, { stage: 'citation_check', progress: 92 });
      const checkedReport = ensureReportCitations(report, summarizedSources);
      await this.updateJob(jobId, {
        status: 'succeeded',
        stage: 'done',
        progress: 100,
        reportMarkdown: checkedReport,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      const job = await this.updateJob(jobId, {
        status: aborted ? 'cancelled' : 'failed',
        stage: 'done',
        progress: aborted ? 100 : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
      this.emit({
        type: 'research-error',
        jobId,
        message: job.errorMessage || 'Deep Research 失败',
      });
    } finally {
      this.controllers.delete(jobId);
    }
  }

  private async generatePlan(model: Parameters<typeof generateText>[0]['model'], query: string, abortSignal: AbortSignal) {
    const result = await generateText({
      model,
      system: '你是一个研究规划器。只规划 web 和本地知识库检索，不提出执行外部动作。',
      prompt: `为下面主题制定 3-5 个检索子问题，每行一个，保持简洁。\n\n主题：${query}`,
      abortSignal,
      maxOutputTokens: 800,
      maxRetries: 1,
    });
    return result.text.trim();
  }

  private async searchSources(
    config: AiAgentFeatureConfig,
    options: AiResearchRunOptions,
    queries: string[],
    abortSignal: AbortSignal,
  ): Promise<AiCitation[]> {
    const citations: AiCitation[] = [];
    const maxSources = Math.max(3, Math.min(24, options.maxSources ?? DEFAULT_MAX_RESEARCH_SOURCES));
    for (const query of queries) {
      if (abortSignal.aborted) {
        throw new Error('Deep Research 已取消');
      }
      const grounding = await resolveGroundingContext({
        query,
        config: {
          ...config,
          research: {
            ...config.research,
            maxSources,
          },
        },
        grounding: {
          webSearchMode: options.webSearchMode ?? 'force',
          knowledgeSearchMode: options.knowledgeSearchMode ?? 'force',
          libraryId: options.libraryId,
          spaceId: options.spaceId,
        },
        searchKnowledge: (input) => this.searchKnowledge(config, input),
        abortSignal,
      });
      citations.push(...grounding.citations);
    }
    return dedupeResearchCitations(citations).slice(0, maxSources);
  }

  private async persistSources(jobId: string, citations: AiCitation[]) {
    const sources: AiResearchSource[] = [];
    for (const citation of citations) {
      const source = mapResearchSource(await this.db().insertAiResearchSource({
        id: randomUUID(),
        jobId,
        sourceType: normalizeResearchSourceType(citation.sourceType),
        title: citation.title,
        url: citation.url,
        sourceId: citation.sourceId,
        snippet: citation.snippet,
        metadataJson: citation.metadata ? JSON.stringify(citation.metadata) : undefined,
      }));
      sources.push(source);
      this.emit({ type: 'research-source', jobId, source });
    }
    return sources;
  }

  private async summarizeSources(
    model: Parameters<typeof generateText>[0]['model'],
    query: string,
    sources: AiResearchSource[],
    abortSignal: AbortSignal,
  ) {
    const summarized: AiResearchSource[] = [];
    for (const [index, source] of sources.entries()) {
      const result = await generateText({
        model,
        system: '你是资料阅读助手。只根据给定片段总结，不编造未出现的信息。',
        prompt: [
          `研究主题：${query}`,
          `来源编号：[${index + 1}]`,
          `标题：${source.title}`,
          source.url ? `URL：${source.url}` : '',
          `片段：${source.snippet || '无片段'}`,
          '',
          '请用 2-4 条中文要点概括该来源对研究主题的贡献。',
        ].filter(Boolean).join('\n'),
        abortSignal,
        maxOutputTokens: 700,
        maxRetries: 1,
      });
      summarized.push({ ...source, summary: result.text.trim() });
    }
    return summarized;
  }

  private async synthesizeReport(
    model: Parameters<typeof generateText>[0]['model'],
    query: string,
    plan: string,
    sources: AiResearchSource[],
    abortSignal: AbortSignal,
  ) {
    const sourceBlock = sources.map((source, index) => [
      `[${index + 1}] ${source.title}${source.url ? ` (${source.url})` : ''}`,
      source.summary || source.snippet || '',
    ].join('\n')).join('\n\n');
    const result = await generateText({
      model,
      system: '你是 Deep Research 报告撰写器。必须基于来源写作，所有关键结论必须使用 [1] 这种编号引用。',
      prompt: [
        `研究主题：${query}`,
        '',
        '研究计划：',
        plan,
        '',
        '来源摘要：',
        sourceBlock,
        '',
        '请输出中文 Markdown 报告，包含：摘要、关键发现、分歧/不确定性、来源说明、后续可验证问题。',
      ].join('\n'),
      abortSignal,
      maxOutputTokens: 2400,
      maxRetries: 1,
    });
    return result.text.trim();
  }

  private async searchKnowledge(config: AiAgentFeatureConfig, input: KnowledgeSearchPayload) {
    const [textResults, embeddingResults] = await Promise.all([
      this.db().searchKnowledge(input),
      aiEmbeddingService.searchKnowledge(config, input),
    ]);
    return dedupeKnowledgeResults([...textResults, ...embeddingResults])
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? config.research.maxSources);
  }

  private async updateJob(jobId: string, input: Partial<{
    title: string;
    status: AiResearchJobStatus;
    stage: AiResearchStage;
    progress: number;
    reportMarkdown: string;
    errorMessage: string;
    optionsJson: string;
    completedAt: string;
  }>) {
    const job = mapResearchJob(await this.db().updateAiResearchJob(jobId, input));
    job.sources = await this.listSources(jobId);
    this.emit({ type: 'research-job', job });
    return job;
  }

  private throwIfCancelled(controller: AbortController) {
    if (controller.signal.aborted) {
      throw new Error('Deep Research 已取消');
    }
  }

  private emit(event: AiResearchEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private db() {
    return dbManager.getDatabase() as AiResearchDatabase;
  }
}

function buildResearchTitle(query: string) {
  return query.length > 32 ? `${query.slice(0, 32)}...` : query;
}

function buildResearchQueries(query: string, plan: string) {
  const lines = plan
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
  return dedupeStrings([query, ...lines]).slice(0, 5);
}

function dedupeResearchCitations(citations: AiCitation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = citation.url || `${citation.sourceType}:${citation.sourceId || citation.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeKnowledgeResults(results: KnowledgeSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.nodeId || result.assetId || `${result.sourceType}:${result.sourceId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLowerCase();
    if (!value || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function ensureReportCitations(report: string, sources: AiResearchSource[]) {
  if (/\[\d+\]/.test(report) || !sources.length) {
    return report;
  }
  const sourceList = sources
    .map((source, index) => `[${index + 1}] ${source.title}${source.url ? ` - ${source.url}` : ''}`)
    .join('\n');
  return `${report}\n\n## 来源\n\n${sourceList}`;
}

function normalizeResearchSourceType(value: string): AiResearchSourceType {
  if (value === 'web' || value === 'knowledge-block' || value === 'knowledge-asset') {
    return value;
  }
  return 'knowledge-page';
}

function mapResearchJob(row: Record<string, unknown>): AiResearchJob {
  return {
    id: String(readField(row, 'id')),
    title: String(readField(row, 'title') ?? 'Deep Research'),
    query: String(readField(row, 'query') ?? ''),
    status: normalizeJobStatus(readField(row, 'status')),
    stage: normalizeStage(readField(row, 'stage')),
    providerId: optionalString(readField(row, 'providerId', 'provider_id')),
    modelId: optionalString(readField(row, 'modelId', 'model_id')),
    progress: Number(readField(row, 'progress') ?? 0),
    reportMarkdown: optionalString(readField(row, 'reportMarkdown', 'report_markdown')),
    errorMessage: optionalString(readField(row, 'errorMessage', 'error_message')),
    options: parseJson(readField(row, 'optionsJson', 'options_json')) as AiResearchRunOptions | undefined,
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
    completedAt: optionalString(readField(row, 'completedAt', 'completed_at')),
  };
}

function mapResearchSource(row: Record<string, unknown>): AiResearchSource {
  return {
    id: String(readField(row, 'id')),
    jobId: String(readField(row, 'jobId', 'job_id')),
    sourceType: normalizeResearchSourceType(String(readField(row, 'sourceType', 'source_type') ?? 'knowledge-page')),
    title: String(readField(row, 'title') ?? '来源'),
    url: optionalString(readField(row, 'url')),
    sourceId: optionalString(readField(row, 'sourceId', 'source_id')),
    snippet: optionalString(readField(row, 'snippet')),
    summary: optionalString(readField(row, 'summary')),
    metadata: parseJson(readField(row, 'metadataJson', 'metadata_json')),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
  };
}

function normalizeJobStatus(value: unknown): AiResearchJobStatus {
  if (value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'cancelled') {
    return value;
  }
  return 'queued';
}

function normalizeStage(value: unknown): AiResearchStage {
  if (value === 'search' || value === 'read' || value === 'synthesize' || value === 'citation_check' || value === 'done') {
    return value;
  }
  return 'plan';
}

function readField(row: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  return row[camelKey] ?? (snakeKey ? row[snakeKey] : undefined);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseJson(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export const aiResearchJobService = new AiResearchJobService();
