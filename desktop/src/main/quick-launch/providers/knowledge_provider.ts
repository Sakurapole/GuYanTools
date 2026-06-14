import { dbManager } from '@/core/database';
import type { KnowledgeSearchResult } from '@/contracts/knowledge';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

const KNOWLEDGE_SEARCH_TIMEOUT_MS = 350;

let lastSuccessfulKnowledgeResults: QuickLaunchResult[] = [];

export const knowledgeProvider: QuickLaunchProvider = {
  id: 'knowledge',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    if (!context.query.trim() || !dbManager.isInitialized()) {
      return [];
    }

    let results: KnowledgeSearchResult[] = [];
    try {
      results = await withKnowledgeSearchTimeout(
        dbManager.getDatabase().searchKnowledge({
          query: context.query,
          limit: context.limit,
        }) as Promise<KnowledgeSearchResult[]>,
      );
    } catch (error) {
      if (isDatabaseBusyError(error) || isKnowledgeSearchTimeoutError(error)) {
        console.debug('[quick-launch] Knowledge provider skipped while database is locked or slow:', error);
        return lastSuccessfulKnowledgeResults
          .filter((item) => matchesCachedKnowledgeResult(item, context.query))
          .slice(0, context.limit);
      }
      throw error;
    }

    const mappedResults = results
      .map((item) => ({
        id: `knowledge:${item.sourceType}:${item.sourceId}`,
        providerId: 'knowledge',
        title: item.title,
        subtitle: compactSnippet(item.snippet || item.sourceType),
        detail: item.updatedAt,
        keywords: [item.sourceType, item.nodeId ?? '', item.assetId ?? ''],
        score: 70 + Math.round(item.score * 10),
        action: {
          type: 'open-knowledge-result',
          sourceId: item.sourceId,
          nodeId: item.nodeId,
        },
      } satisfies QuickLaunchResult))
      .slice(0, context.limit);
    lastSuccessfulKnowledgeResults = mappedResults;
    return mappedResults;
  },
};

function withKnowledgeSearchTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('knowledge search timeout')), KNOWLEDGE_SEARCH_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isKnowledgeSearchTimeoutError(error: unknown) {
  return error instanceof Error && error.message.includes('knowledge search timeout');
}

function isDatabaseBusyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('database is locked')
    || message.includes('DatabaseBusy')
    || message.includes('code: DatabaseBusy')
    || message.includes('extended_code: 5');
}

function matchesCachedKnowledgeResult(result: QuickLaunchResult, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return [
    result.title,
    result.subtitle,
    result.detail,
    ...result.keywords,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}
