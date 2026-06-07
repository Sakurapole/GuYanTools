import { randomUUID } from 'node:crypto';
import { tool } from 'ai';
import { z } from 'zod';
import type { AiAgentFeatureConfig, AiCitation, AiGroundingOptions, AiSearchMode } from '@/contracts/ai';
import type { KnowledgeSearchPayload, KnowledgeSearchResult } from '@/contracts/knowledge';

export type KnowledgeSearchExecutor = (input: KnowledgeSearchPayload) => Promise<KnowledgeSearchResult[]>;

export interface GroundingResult {
  context: string;
  citations: AiCitation[];
  metadata: {
    webSearchEnabled: boolean;
    knowledgeSearchEnabled: boolean;
    citationCount: number;
  };
}

export async function resolveGroundingContext(input: {
  query: string;
  config: AiAgentFeatureConfig;
  grounding?: AiGroundingOptions;
  searchKnowledge: KnowledgeSearchExecutor;
}): Promise<GroundingResult> {
  const webSearchEnabled = shouldSearch(input.grounding?.webSearchMode, input.config.research.enabled)
    && Boolean(input.config.research.webSearchEndpoint);
  const knowledgeSearchEnabled = shouldSearch(input.grounding?.knowledgeSearchMode, input.config.research.enabled);
  const citations: AiCitation[] = [];

  if (knowledgeSearchEnabled) {
    const knowledgeResults = await input.searchKnowledge({
      query: input.query,
      libraryId: input.grounding?.libraryId || input.config.research.defaultKnowledgeLibraryId,
      spaceId: input.grounding?.spaceId || input.config.research.defaultKnowledgeSpaceId,
      limit: Math.min(12, input.config.research.maxSources),
    });
    citations.push(...knowledgeResults.map(mapKnowledgeCitation));
  }

  if (webSearchEnabled) {
    const webResults = await searchWeb(input.config, input.query, Math.min(8, input.config.research.maxSources));
    citations.push(...webResults);
  }

  const uniqueCitations = dedupeCitations(citations).slice(0, input.config.research.maxSources);
  return {
    context: buildGroundingContext(uniqueCitations),
    citations: uniqueCitations,
    metadata: {
      webSearchEnabled,
      knowledgeSearchEnabled,
      citationCount: uniqueCitations.length,
    },
  };
}

export function createGroundingTools(input: {
  config: AiAgentFeatureConfig;
  searchKnowledge: KnowledgeSearchExecutor;
}) {
  return {
    knowledgeSearch: tool({
      description: 'Search local GuYanTools knowledge content and return cited snippets.',
      inputSchema: z.object({
        query: z.string().min(1),
        libraryId: z.string().optional(),
        spaceId: z.string().optional(),
        limit: z.number().min(1).max(20).default(8),
      }),
      execute: async (toolInput) => input.searchKnowledge({
        query: toolInput.query,
        libraryId: toolInput.libraryId || input.config.research.defaultKnowledgeLibraryId,
        spaceId: toolInput.spaceId || input.config.research.defaultKnowledgeSpaceId,
        limit: toolInput.limit,
      }),
    }),
    webSearch: tool({
      description: 'Search a configured web search endpoint and return cited snippets.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(10).default(5),
      }),
      execute: async (toolInput) => searchWeb(input.config, toolInput.query, toolInput.limit),
    }),
  };
}

function shouldSearch(mode: AiSearchMode | undefined, enabled: boolean) {
  if (mode === 'force') {
    return true;
  }
  if (mode === 'auto') {
    return enabled;
  }
  return false;
}

function mapKnowledgeCitation(result: KnowledgeSearchResult): AiCitation {
  const sourceType = result.sourceType === 'asset' ? 'knowledge-asset' : 'knowledge-page';
  return {
    id: randomUUID(),
    sourceType,
    title: result.title,
    sourceId: result.sourceId,
    snippet: result.snippet,
    metadata: {
      knowledgeSourceType: result.sourceType,
      nodeId: result.nodeId,
      assetId: result.assetId,
      score: result.score,
      updatedAt: result.updatedAt,
    },
  };
}

async function searchWeb(config: AiAgentFeatureConfig, query: string, limit: number): Promise<AiCitation[]> {
  const endpoint = config.research.webSearchEndpoint;
  if (!endpoint) {
    return [];
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.research.webSearchApiKey ? { authorization: `Bearer ${config.research.webSearchApiKey}` } : {}),
    },
    body: JSON.stringify({
      query,
      limit,
      allowedDomains: config.research.allowedDomains,
      blockedDomains: config.research.blockedDomains,
    }),
  });

  if (!response.ok) {
    throw new Error(`Web search failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as unknown;
  const results = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.results)
      ? json.results
      : [];

  return results
    .map(normalizeWebResult)
    .filter((citation): citation is AiCitation => Boolean(citation))
    .slice(0, limit);
}

function normalizeWebResult(value: unknown): AiCitation | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = stringField(value, 'title') || stringField(value, 'name');
  const url = stringField(value, 'url') || stringField(value, 'link');
  const snippet = stringField(value, 'snippet') || stringField(value, 'content') || stringField(value, 'description');
  if (!title && !url && !snippet) {
    return null;
  }

  return {
    id: randomUUID(),
    sourceType: 'web',
    title: title || url || '网页搜索结果',
    url,
    snippet,
    metadata: {
      publishedAt: stringField(value, 'publishedAt') || stringField(value, 'date'),
      source: stringField(value, 'source'),
    },
  };
}

function buildGroundingContext(citations: AiCitation[]) {
  if (!citations.length) {
    return '';
  }

  const sources = citations.map((citation, index) => {
    const sourceLabel = citation.url ? `${citation.title} (${citation.url})` : citation.title;
    return `[${index + 1}] ${sourceLabel}\n${citation.snippet ?? ''}`.trim();
  });

  return [
    '以下是本轮问答可使用的检索来源。回答中涉及这些来源时必须使用 [1]、[2] 这种编号引用；如果来源不足，请明确说明。',
    sources.join('\n\n'),
  ].join('\n\n');
}

function dedupeCitations(citations: AiCitation[]) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}
