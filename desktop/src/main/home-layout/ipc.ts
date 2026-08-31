import { app, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dbManager } from '../../core/database';
import type {
  CreateHomeCategoryPayload,
  CreateHomeWidgetPayload,
  ImportHomeLayoutPayload,
  UpdateHomeCategoryPayload,
  UpdateHomeWidgetPayload,
  HomeLayoutMediaPayload,
} from '@/contracts/home_layout';
import { getActiveHomeWorkspaceKey } from '../home-profile/ipc';

let registered = false;

function serializeJson(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) return undefined;
  return JSON.stringify(value);
}

function deserializeJson<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function deserializeWidgets(widgets: any[]): any[] {
  return widgets.map(w => ({
    ...w,
    action: deserializeJson(w.action),
    backgroundStyle: deserializeJson(w.backgroundStyle),
    widgetConfig: deserializeJson(w.widgetConfig),
  }));
}

function deserializeCategory(category: any): any {
  return {
    ...category,
    backgroundStyle: deserializeJson(category.backgroundStyle),
    widgets: deserializeWidgets(category.widgets ?? []),
  };
}

function deserializeLayout(layout: any): any {
  return {
    ...layout,
    categories: (layout.categories ?? []).map(deserializeCategory),
  };
}

const MEDIA_HOST = 'home-layout-assets';
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

async function saveHomeLayoutMedia(input: HomeLayoutMediaPayload) {
  const bytes = Buffer.from(input.data);
  if (!bytes.length) throw new Error('首页媒体文件不能为空');
  if (!input.mimeType.startsWith('image/') && !input.mimeType.startsWith('video/')) {
    throw new Error('首页背景仅支持图片或视频');
  }
  if (bytes.length > 64 * 1024 * 1024) throw new Error('首页媒体不能超过 64 MB');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const extension = EXTENSIONS[input.mimeType] || path.extname(input.fileName || '').toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
  const root = path.join(app.getPath('userData'), 'home-layout-assets');
  await fs.mkdir(root, { recursive: true });
  const fileName = `${hash}${extension}`;
  await fs.writeFile(path.join(root, fileName), bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  return { url: `app://${MEDIA_HOST}/${encodeURIComponent(fileName)}`, sizeBytes: bytes.length };
}

async function normalizeMediaValue(value?: string) {
  if (!value || !value.startsWith('data:')) return value;
  return (await saveHomeLayoutMedia({
    data: Uint8Array.from(Buffer.from(value.slice(value.indexOf(',') + 1), 'base64')),
    mimeType: value.slice(5, value.indexOf(';')) || 'application/octet-stream',
    fileName: 'legacy-background',
  })).url;
}

async function normalizeBackgroundStyle(style: unknown) {
  if (!style || typeof style !== 'object') return style;
  const clone = structuredClone(style) as Record<string, unknown>;
  const visit = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === 'image' || key === 'video') && typeof child === 'string') {
        (value as Record<string, unknown>)[key] = await normalizeMediaValue(child);
      } else {
        await visit(child);
      }
    }
  };
  await visit(clone);
  return clone;
}

async function prepareBackground(input: { backgroundImage?: string; backgroundVideo?: string; backgroundStyle?: unknown }) {
  return {
    backgroundImage: await normalizeMediaValue(input.backgroundImage),
    backgroundVideo: await normalizeMediaValue(input.backgroundVideo),
    backgroundStyle: await normalizeBackgroundStyle(input.backgroundStyle),
  };
}

async function materializeCategoryMedia(rawCategory: any) {
  const category = deserializeCategory(rawCategory);
  const categoryBackground = await prepareBackground(category);
  const categoryChanged = categoryBackground.backgroundImage !== category.backgroundImage
    || categoryBackground.backgroundVideo !== category.backgroundVideo
    || JSON.stringify(categoryBackground.backgroundStyle) !== JSON.stringify(category.backgroundStyle);
  if (categoryChanged) {
    await dbManager.getDatabase().updateHomeCategory(category.id, {
      backgroundImage: categoryBackground.backgroundImage,
      backgroundVideo: categoryBackground.backgroundVideo,
      backgroundStyle: serializeJson(categoryBackground.backgroundStyle),
    });
    category.backgroundImage = categoryBackground.backgroundImage;
    category.backgroundVideo = categoryBackground.backgroundVideo;
    category.backgroundStyle = categoryBackground.backgroundStyle;
  }

  for (const widget of category.widgets ?? []) {
    const widgetBackground = await prepareBackground(widget);
    const widgetChanged = widgetBackground.backgroundImage !== widget.backgroundImage
      || widgetBackground.backgroundVideo !== widget.backgroundVideo
      || JSON.stringify(widgetBackground.backgroundStyle) !== JSON.stringify(widget.backgroundStyle);
    if (!widgetChanged) continue;
    await dbManager.getDatabase().updateHomeWidget(widget.id, {
      backgroundImage: widgetBackground.backgroundImage,
      backgroundVideo: widgetBackground.backgroundVideo,
      backgroundStyle: serializeJson(widgetBackground.backgroundStyle),
    });
    widget.backgroundImage = widgetBackground.backgroundImage;
    widget.backgroundVideo = widgetBackground.backgroundVideo;
    widget.backgroundStyle = widgetBackground.backgroundStyle;
  }
  return category;
}

export function registerHomeLayoutIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('home-layout:get', async () => {
    const workspaceKey = await getActiveHomeWorkspaceKey();
    // 首页配置量很小，直接返回完整布局，确保组件和分类背景在首次进入时
    // 同步恢复，不依赖后续切换或空闲任务触发补载。
    const layout = await dbManager.getDatabase().getHomeLayout(workspaceKey);
    return deserializeLayout(layout);
  });

  ipcMain.handle('home-layout:get-category', async (_event, categoryId: string) => {
    const workspaceKey = await getActiveHomeWorkspaceKey();
    const category = await dbManager.getDatabase().getHomeCategoryLayout(workspaceKey, categoryId);
    return materializeCategoryMedia(category);
  });

  ipcMain.handle('home-layout:save-media', async (_event, input: HomeLayoutMediaPayload) => saveHomeLayoutMedia(input));

  ipcMain.handle('home-layout:create-category', async (_event, input: CreateHomeCategoryPayload) => {
    const workspaceKey = await getActiveHomeWorkspaceKey();
    const background = await prepareBackground(input);
    return dbManager.getDatabase().createHomeCategory({
      id: input.id,
      workspaceKey,
      label: input.label,
      icon: input.icon,
      sortOrder: input.sortOrder,
      backgroundColor: input.backgroundColor,
      ...background,
      backgroundStyle: serializeJson(background.backgroundStyle),
    });
  });

  ipcMain.handle(
    'home-layout:update-category',
    async (_event, categoryId: string, input: UpdateHomeCategoryPayload) => {
      const background = await prepareBackground(input);
      return dbManager.getDatabase().updateHomeCategory(categoryId, {
        label: input.label,
        icon: input.icon,
        sortOrder: input.sortOrder,
        backgroundColor: input.backgroundColor,
        ...background,
        backgroundStyle: serializeJson(background.backgroundStyle),
      });
    }
  );

  ipcMain.handle('home-layout:delete-category', async (_event, categoryId: string) => {
    await dbManager.getDatabase().deleteHomeCategory(categoryId);
  });

  ipcMain.handle('home-layout:create-widget', async (_event, input: CreateHomeWidgetPayload) => {
    const workspaceKey = await getActiveHomeWorkspaceKey();
    const background = await prepareBackground(input);
    return dbManager.getDatabase().createHomeWidget({
      id: input.id,
      workspaceKey,
      categoryId: input.categoryId,
      label: input.label,
      icon: input.icon,
      action: serializeJson(input.action),
      sourceType: input.sourceType,
      widgetType: input.widgetType,
      sizePreset: input.sizePreset,
      widgetConfig: serializeJson(input.widgetConfig),
      col: input.col,
      row: input.row,
      colSpan: input.colSpan,
      rowSpan: input.rowSpan,
      preferredCol: input.preferredCol,
      preferredRow: input.preferredRow,
      priority: input.priority,
      color: input.color,
      ...background,
      backgroundStyle: serializeJson(background.backgroundStyle),
      hidden: input.hidden,
    });
  });

  ipcMain.handle(
    'home-layout:update-widget',
    async (_event, widgetId: string, input: UpdateHomeWidgetPayload) => {
      const background = await prepareBackground(input);
      return dbManager.getDatabase().updateHomeWidget(widgetId, {
        categoryId: input.categoryId,
        label: input.label,
        icon: input.icon,
        action: serializeJson(input.action),
        sourceType: input.sourceType,
        widgetType: input.widgetType,
        sizePreset: input.sizePreset,
        widgetConfig: serializeJson(input.widgetConfig),
        col: input.col,
        row: input.row,
        colSpan: input.colSpan,
        rowSpan: input.rowSpan,
        preferredCol: input.preferredCol,
        preferredRow: input.preferredRow,
        priority: input.priority,
        color: input.color,
        ...background,
        backgroundStyle: serializeJson(background.backgroundStyle),
        hidden: input.hidden,
      });
    }
  );

  ipcMain.handle('home-layout:delete-widget', async (_event, widgetId: string) => {
    await dbManager.getDatabase().deleteHomeWidget(widgetId);
  });

  ipcMain.handle('home-layout:import-layout', async (_event, input: ImportHomeLayoutPayload) => {
    const workspaceKey = await getActiveHomeWorkspaceKey();
    const categories = await Promise.all(input.categories.map(async category => {
      const categoryBackground = await prepareBackground(category);
      return {
        id: category.id,
        label: category.label,
        icon: category.icon,
        sortOrder: category.sortOrder,
        backgroundColor: category.backgroundColor,
        ...categoryBackground,
        backgroundStyle: serializeJson(categoryBackground.backgroundStyle),
        widgets: await Promise.all(category.widgets.map(async widget => {
          const widgetBackground = await prepareBackground(widget);
          return {
          id: widget.id,
          label: widget.label,
          icon: widget.icon,
          action: serializeJson(widget.action),
          sourceType: widget.sourceType ?? 'shortcut',
          widgetType: widget.widgetType ?? 'shortcut',
          sizePreset: widget.sizePreset,
          widgetConfig: serializeJson(widget.widgetConfig),
          col: widget.col,
          row: widget.row,
          colSpan: widget.colSpan,
          rowSpan: widget.rowSpan,
          preferredCol: widget.preferredCol,
          preferredRow: widget.preferredRow,
          priority: widget.priority,
          color: widget.color,
          ...widgetBackground,
          backgroundStyle: serializeJson(widgetBackground.backgroundStyle),
          hidden: widget.hidden,
          };
        })),
      };
    }));
    const result = dbManager.getDatabase().importHomeLayout(workspaceKey, { categories });
    return deserializeLayout(await result);
  });

  registered = true;
}
