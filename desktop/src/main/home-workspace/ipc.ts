import { ipcMain } from 'electron';
import type { HomeWorkspaceBackground, HomeWorkspaceBgState } from '@/contracts/home_workspace';
import { dbManager } from '../../core/database';
import { getActiveHomeWorkspaceKey } from '../home-profile/ipc';

function parseBackground(raw: string | null | undefined): HomeWorkspaceBackground {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HomeWorkspaceBackground;
  } catch {
    return {};
  }
}

function serializeBackground(bg: HomeWorkspaceBackground): string {
  return JSON.stringify(bg);
}

const MAX_INLINE_MEDIA_BYTES = 4 * 1024 * 1024;

function isOversizedInlineMedia(value: unknown): value is string {
  if (typeof value !== 'string' || (!value.startsWith('data:image/') && !value.startsWith('data:video/'))) {
    return false;
  }

  const payload = value.split(',', 2)[1]?.replace(/\s/g, '') ?? '';
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  return estimatedBytes > MAX_INLINE_MEDIA_BYTES;
}

function hasOversizedInlineMedia(value: unknown): boolean {
  if (isOversizedInlineMedia(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(hasOversizedInlineMedia);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasOversizedInlineMedia);
  }
  return false;
}

function assertInlineMediaSize(background: HomeWorkspaceBackground | undefined) {
  if (hasOversizedInlineMedia(background)) {
    throw new Error('内嵌媒体不能超过 4 MiB，请选择较小的文件或使用外部文件 URL');
  }
}

function sanitizeInlineMedia(value: unknown): unknown {
  if (isOversizedInlineMedia(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeInlineMedia).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeInlineMedia(child);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }
  return value;
}

function sanitizeBackground(background: HomeWorkspaceBackground): HomeWorkspaceBackground {
  const sanitized = sanitizeInlineMedia(background);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized as HomeWorkspaceBackground;
}

export function registerHomeWorkspaceIpcHandlers() {
  /**
   * 获取首页工作区背景（顶栏 + 侧边栏）
   */
  ipcMain.handle('home-workspace:get-background', async () => {
    const db = dbManager.getDatabase();
    const workspaceKey = await getActiveHomeWorkspaceKey();
    const raw = await db.getHomeWorkspaceBackground(workspaceKey);

    if (!raw) {
      return { header: {}, sidebar: {} } satisfies HomeWorkspaceBgState;
    }

    try {
      const parsed = JSON.parse(raw) as { header?: string | null; sidebar?: string | null };
      const header = sanitizeBackground(parseBackground(parsed.header));
      const sidebar = sanitizeBackground(parseBackground(parsed.sidebar));
      return { header, sidebar } satisfies HomeWorkspaceBgState;
    } catch {
      return { header: {}, sidebar: {} } satisfies HomeWorkspaceBgState;
    }
  });

  /**
   * 更新首页工作区背景
   */
  ipcMain.handle(
    'home-workspace:update-background',
    async (_event, payload: { header?: HomeWorkspaceBackground; sidebar?: HomeWorkspaceBackground }) => {
      const db = dbManager.getDatabase();
      const workspaceKey = await getActiveHomeWorkspaceKey();

      // 先读取现有值再合并，避免只更新其中一方时另一方丢失
      const existing = await db.getHomeWorkspaceBackground(workspaceKey);
      let currentHeader: HomeWorkspaceBackground = {};
      let currentSidebar: HomeWorkspaceBackground = {};

      if (existing) {
        try {
          const parsed = JSON.parse(existing) as { header?: string | null; sidebar?: string | null };
          currentHeader = parseBackground(parsed.header);
          currentSidebar = parseBackground(parsed.sidebar);
        } catch {
          // ignore
        }
      }

      const nextHeader = payload.header !== undefined ? payload.header : currentHeader;
      const nextSidebar = payload.sidebar !== undefined ? payload.sidebar : currentSidebar;

      assertInlineMediaSize(nextHeader);
      assertInlineMediaSize(nextSidebar);

      await db.updateHomeWorkspaceBackground(
        workspaceKey,
        serializeBackground(nextHeader),
        serializeBackground(nextSidebar),
      );

      return { header: nextHeader, sidebar: nextSidebar } satisfies HomeWorkspaceBgState;
    },
  );
}
