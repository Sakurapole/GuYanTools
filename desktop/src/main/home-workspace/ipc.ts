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
      return {
        header: parseBackground(parsed.header),
        sidebar: parseBackground(parsed.sidebar),
      } satisfies HomeWorkspaceBgState;
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

      await db.updateHomeWorkspaceBackground(
        workspaceKey,
        serializeBackground(nextHeader),
        serializeBackground(nextSidebar),
      );

      return { header: nextHeader, sidebar: nextSidebar } satisfies HomeWorkspaceBgState;
    },
  );
}
