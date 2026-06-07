import { randomUUID } from 'node:crypto';
import { embedMany } from 'ai';
import { dbManager, JsDatabase } from '@/core/database';
import { appConfigManager } from '@/main/app-config/manager';
import type {
  AiAgentFeatureConfig,
  KnowledgeEmbeddingStats,
  RebuildKnowledgeEmbeddingsPayload,
  RebuildKnowledgeEmbeddingsResult,
} from '@/contracts/ai';
import type { KnowledgeSearchPayload, KnowledgeSearchResult, KnowledgeSearchSourceType } from '@/contracts/knowledge';
import { findAiProvider, resolveEmbeddingModel } from './provider_registry';

type AiEmbeddingDatabase = JsDatabase & {
  listKnowledgeAiChunks: (input?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  upsertKnowledgeEmbedding: (input: Record<string, unknown>) => Promise<void>;
  deleteKnowledgeEmbeddings: (provider: string, model: string) => Promise<number>;
  getKnowledgeEmbeddingStats: (provider: string, model: string) => Promise<Record<string, unknown>>;
  listKnowledgeEmbeddingCandidates: (input: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
};

type KnowledgeAiChunk = {
  id: string;
  contentText: string;
};

type KnowledgeEmbeddingCandidate = {
  chunkId: string;
  sourceType: string;
  sourceId: string;
  nodeId?: string;
  assetId?: string;
  title: string;
  contentText: string;
  metadataJson?: string;
  updatedAt: string;
  vector: number[];
};

class AiEmbeddingService {
  async getKnowledgeEmbeddingStats(input: RebuildKnowledgeEmbeddingsPayload = {}): Promise<KnowledgeEmbeddingStats> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const target = this.resolveEmbeddingTarget(config, input);
    return mapStats(await this.db().getKnowledgeEmbeddingStats(target.providerId, target.modelId));
  }

  async rebuildKnowledgeEmbeddings(
    input: RebuildKnowledgeEmbeddingsPayload = {},
  ): Promise<RebuildKnowledgeEmbeddingsResult> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const target = this.resolveEmbeddingTarget(config, input);
    const batchSize = clampInteger(input.batchSize ?? 32, 1, 128);
    const deletedEmbeddings = input.reset === false
      ? 0
      : await this.db().deleteKnowledgeEmbeddings(target.providerId, target.modelId);
    const chunks = (await this.db().listKnowledgeAiChunks({
      missingEmbeddingProvider: target.providerId,
      missingEmbeddingModel: target.modelId,
    })).map(mapChunk);

    let embeddedChunks = 0;
    let failedChunks = 0;
    const model = resolveEmbeddingModel(config, target.providerId, target.modelId);

    for (let index = 0; index < chunks.length; index += batchSize) {
      const batch = chunks.slice(index, index + batchSize);
      try {
        const result = await embedMany({
          model,
          values: batch.map((chunk) => chunk.contentText),
          maxParallelCalls: 2,
          maxRetries: 1,
        });

        await Promise.all(result.embeddings.map((embedding, embeddingIndex) =>
          this.db().upsertKnowledgeEmbedding({
            id: randomUUID(),
            chunkId: batch[embeddingIndex].id,
            provider: target.providerId,
            model: target.modelId,
            dimension: embedding.length,
            vectorBlob: vectorToBuffer(embedding),
          })));
        embeddedChunks += result.embeddings.length;
      } catch {
        failedChunks += batch.length;
      }
    }

    const stats = mapStats(await this.db().getKnowledgeEmbeddingStats(target.providerId, target.modelId));
    return {
      ...stats,
      totalChunks: chunks.length,
      embeddedChunks,
      failedChunks,
      deletedEmbeddings,
    };
  }

  async searchKnowledge(
    config: AiAgentFeatureConfig,
    input: KnowledgeSearchPayload,
  ): Promise<KnowledgeSearchResult[]> {
    try {
      const target = this.resolveEmbeddingTarget(config, {});
      const result = await embedMany({
        model: resolveEmbeddingModel(config, target.providerId, target.modelId),
        values: [input.query],
        maxParallelCalls: 1,
        maxRetries: 1,
      });
      const queryVector = result.embeddings[0];
      if (!queryVector?.length) {
        return [];
      }

      const candidates = (await this.db().listKnowledgeEmbeddingCandidates({
        provider: target.providerId,
        model: target.modelId,
        libraryId: input.libraryId,
        spaceId: input.spaceId,
        sourceType: input.sourceType,
        limit: Math.max(100, Math.min(5000, (input.limit ?? 8) * 80)),
      }))
        .map(mapCandidate)
        .filter((candidate) => candidate.vector.length === queryVector.length);

      return candidates
        .map((candidate) => ({
          candidate,
          score: cosineSimilarity(queryVector, candidate.vector),
        }))
        .filter((item) => Number.isFinite(item.score) && item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, input.limit ?? 8)
        .map(({ candidate, score }) => mapSearchResult(candidate, score));
    } catch {
      return [];
    }
  }

  private resolveEmbeddingTarget(config: AiAgentFeatureConfig, input: RebuildKnowledgeEmbeddingsPayload) {
    const providerId = input.providerId
      || config.research.embeddingProviderId
      || config.providers.find((provider) =>
        provider.enabled && provider.models.some((model) => model.capabilities.embedding))?.id
      || config.defaultProviderId
      || config.providers.find((provider) => provider.enabled)?.id;
    const provider = providerId ? findAiProvider(config, providerId) : undefined;
    const modelId = input.modelId
      || config.research.embeddingModelId
      || provider?.models.find((model) => model.capabilities.embedding)?.id
      || provider?.models[0]?.id;

    if (!provider || !modelId) {
      throw new Error('请先配置支持 embedding 的 AI Provider 和模型');
    }

    const model = provider.models.find((item) => item.id === modelId);
    if (!model) {
      throw new Error('AI embedding 模型配置不存在');
    }

    return { providerId: provider.id, modelId: model.id };
  }

  private db(): AiEmbeddingDatabase {
    return dbManager.getDatabase() as AiEmbeddingDatabase;
  }
}

function mapChunk(row: Record<string, unknown>): KnowledgeAiChunk {
  return {
    id: readString(row, 'id'),
    contentText: readString(row, 'contentText', 'content_text'),
  };
}

function mapStats(row: Record<string, unknown>): KnowledgeEmbeddingStats {
  return {
    chunkCount: readNumber(row, 'chunkCount', 'chunk_count'),
    embeddedCount: readNumber(row, 'embeddedCount', 'embedded_count'),
    provider: readString(row, 'provider'),
    model: readString(row, 'model'),
  };
}

function mapCandidate(row: Record<string, unknown>): KnowledgeEmbeddingCandidate {
  return {
    chunkId: readString(row, 'chunkId', 'chunk_id'),
    sourceType: readString(row, 'sourceType', 'source_type'),
    sourceId: readString(row, 'sourceId', 'source_id'),
    nodeId: readOptionalString(row, 'nodeId', 'node_id'),
    assetId: readOptionalString(row, 'assetId', 'asset_id'),
    title: readString(row, 'title') || '知识库片段',
    contentText: readString(row, 'contentText', 'content_text'),
    metadataJson: readOptionalString(row, 'metadataJson', 'metadata_json'),
    updatedAt: readString(row, 'updatedAt', 'updated_at'),
    vector: bytesToVector(readBytes(row.vectorBlob ?? row.vector_blob)),
  };
}

function mapSearchResult(candidate: KnowledgeEmbeddingCandidate, score: number): KnowledgeSearchResult {
  return {
    sourceType: normalizeSearchSourceType(candidate.sourceType),
    sourceId: candidate.sourceId,
    nodeId: candidate.nodeId,
    assetId: candidate.assetId,
    title: candidate.title,
    snippet: buildSnippet(candidate.contentText),
    score,
    updatedAt: candidate.updatedAt,
  };
}

function normalizeSearchSourceType(value: string): KnowledgeSearchSourceType {
  return value === 'asset' || value === 'quick_note' || value === 'document' || value === 'page' ? value : 'page';
}

function readString(row: Record<string, unknown>, key: string, fallbackKey?: string): string {
  const value = row[key] ?? (fallbackKey ? row[fallbackKey] : undefined);
  return typeof value === 'string' ? value : '';
}

function readOptionalString(row: Record<string, unknown>, key: string, fallbackKey?: string): string | undefined {
  const value = readString(row, key, fallbackKey);
  return value || undefined;
}

function readNumber(row: Record<string, unknown>, key: string, fallbackKey?: string): number {
  const value = row[key] ?? (fallbackKey ? row[fallbackKey] : undefined);
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function vectorToBuffer(vector: number[]) {
  const bytes = new Float32Array(vector);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readBytes(value: unknown): Uint8Array {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((item) => Number(item) || 0));
  }
  return new Uint8Array();
}

function bytesToVector(bytes: Uint8Array) {
  if (!bytes.length || bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    return [];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector: number[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += Float32Array.BYTES_PER_ELEMENT) {
    vector.push(view.getFloat32(offset, true));
  }
  return vector;
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (!leftNorm || !rightNorm) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function buildSnippet(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 280 ? `${compact.slice(0, 280)}...` : compact;
}

function clampInteger(value: number, min: number, max: number) {
  const integer = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, integer));
}

export const aiEmbeddingService = new AiEmbeddingService();
