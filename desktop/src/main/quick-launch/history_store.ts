import { dbManager } from '@/core/database';
import type { QuickLaunchResult } from '@/contracts/quick_launch';

const HISTORY_SETTING_KEY = 'quick-launch.history';
const MAX_HISTORY_ITEMS = 250;

interface QuickLaunchHistoryEntry {
  id: string;
  useCount: number;
  lastUsedAt: number;
}

function normalizeHistory(value: unknown): QuickLaunchHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is QuickLaunchHistoryEntry => (
      Boolean(item)
      && typeof item === 'object'
      && typeof (item as QuickLaunchHistoryEntry).id === 'string'
      && typeof (item as QuickLaunchHistoryEntry).useCount === 'number'
      && typeof (item as QuickLaunchHistoryEntry).lastUsedAt === 'number'
    ))
    .slice(0, MAX_HISTORY_ITEMS);
}

export class QuickLaunchHistoryStore {
  private cache: QuickLaunchHistoryEntry[] | null = null;

  async decorate(results: QuickLaunchResult[]) {
    const history = await this.load();
    const historyMap = new Map(history.map((entry) => [entry.id, entry]));
    return results.map((result) => {
      const entry = historyMap.get(result.id);
      if (!entry) {
        return result;
      }

      return {
        ...result,
        score: result.score + Math.min(80, entry.useCount * 8) + Math.min(40, this.recencyBoost(entry.lastUsedAt)),
        useCount: entry.useCount,
        lastUsedAt: entry.lastUsedAt,
      };
    });
  }

  async record(result: QuickLaunchResult) {
    const history = await this.load();
    const now = Date.now();
    const next = history.filter((entry) => entry.id !== result.id);
    const existing = history.find((entry) => entry.id === result.id);
    next.unshift({
      id: result.id,
      useCount: (existing?.useCount ?? 0) + 1,
      lastUsedAt: now,
    });
    this.cache = next.slice(0, MAX_HISTORY_ITEMS);
    await this.persist();
  }

  private async load() {
    if (this.cache) {
      return this.cache;
    }

    if (!dbManager.isInitialized()) {
      this.cache = [];
      return this.cache;
    }

    try {
      const raw = await dbManager.getDatabase().getSettingValue(HISTORY_SETTING_KEY);
      this.cache = normalizeHistory(JSON.parse(raw));
    } catch {
      this.cache = [];
    }

    return this.cache;
  }

  private async persist() {
    if (!dbManager.isInitialized() || !this.cache) {
      return;
    }

    await dbManager.getDatabase().upsertSetting(
      HISTORY_SETTING_KEY,
      JSON.stringify(this.cache),
      'Quick launch usage history',
    );
  }

  private recencyBoost(lastUsedAt: number) {
    const ageMs = Date.now() - lastUsedAt;
    if (ageMs < 24 * 60 * 60 * 1000) {
      return 40;
    }
    if (ageMs < 7 * 24 * 60 * 60 * 1000) {
      return 24;
    }
    if (ageMs < 30 * 24 * 60 * 60 * 1000) {
      return 12;
    }
    return 0;
  }
}

export const quickLaunchHistoryStore = new QuickLaunchHistoryStore();
