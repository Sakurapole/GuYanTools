import { ipcMain } from 'electron';
import { dbManager } from '../../core/database';
import type {
  CreateHomeCategoryPayload,
  CreateHomeWidgetPayload,
  ImportHomeLayoutPayload,
  UpdateHomeCategoryPayload,
  UpdateHomeWidgetPayload,
} from '@/contracts/home_layout';

const DEFAULT_WORKSPACE_KEY = 'default';

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

function deserializeLayout(layout: any): any {
  return {
    ...layout,
    categories: layout.categories.map((cat: any) => ({
      ...cat,
      backgroundStyle: deserializeJson(cat.backgroundStyle),
      widgets: deserializeWidgets(cat.widgets),
    })),
  };
}

export function registerHomeLayoutIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('home-layout:get', async () => {
    const layout = await dbManager.getDatabase().getHomeLayout(DEFAULT_WORKSPACE_KEY);
    return deserializeLayout(layout);
  });

  ipcMain.handle('home-layout:create-category', async (_event, input: CreateHomeCategoryPayload) => {
    return dbManager.getDatabase().createHomeCategory({
      id: input.id,
      workspaceKey: DEFAULT_WORKSPACE_KEY,
      label: input.label,
      icon: input.icon,
      sortOrder: input.sortOrder,
      backgroundColor: input.backgroundColor,
      backgroundImage: input.backgroundImage,
      backgroundVideo: input.backgroundVideo,
      backgroundStyle: serializeJson(input.backgroundStyle),
    });
  });

  ipcMain.handle(
    'home-layout:update-category',
    async (_event, categoryId: string, input: UpdateHomeCategoryPayload) => {
      return dbManager.getDatabase().updateHomeCategory(categoryId, {
        label: input.label,
        icon: input.icon,
        sortOrder: input.sortOrder,
        backgroundColor: input.backgroundColor,
        backgroundImage: input.backgroundImage,
        backgroundVideo: input.backgroundVideo,
        backgroundStyle: serializeJson(input.backgroundStyle),
      });
    }
  );

  ipcMain.handle('home-layout:delete-category', async (_event, categoryId: string) => {
    await dbManager.getDatabase().deleteHomeCategory(categoryId);
  });

  ipcMain.handle('home-layout:create-widget', async (_event, input: CreateHomeWidgetPayload) => {
    return dbManager.getDatabase().createHomeWidget({
      id: input.id,
      workspaceKey: DEFAULT_WORKSPACE_KEY,
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
      backgroundImage: input.backgroundImage,
      backgroundVideo: input.backgroundVideo,
      backgroundStyle: serializeJson(input.backgroundStyle),
      hidden: input.hidden,
    });
  });

  ipcMain.handle(
    'home-layout:update-widget',
    async (_event, widgetId: string, input: UpdateHomeWidgetPayload) => {
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
        backgroundImage: input.backgroundImage,
        backgroundVideo: input.backgroundVideo,
        backgroundStyle: serializeJson(input.backgroundStyle),
        hidden: input.hidden,
      });
    }
  );

  ipcMain.handle('home-layout:delete-widget', async (_event, widgetId: string) => {
    await dbManager.getDatabase().deleteHomeWidget(widgetId);
  });

  ipcMain.handle('home-layout:import-layout', async (_event, input: ImportHomeLayoutPayload) => {
    const result = dbManager.getDatabase().importHomeLayout(DEFAULT_WORKSPACE_KEY, {
      categories: input.categories.map(category => ({
        id: category.id,
        label: category.label,
        icon: category.icon,
        sortOrder: category.sortOrder,
        backgroundColor: category.backgroundColor,
        backgroundImage: category.backgroundImage,
        backgroundVideo: category.backgroundVideo,
        backgroundStyle: serializeJson(category.backgroundStyle),
        widgets: category.widgets.map(widget => ({
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
          backgroundImage: widget.backgroundImage,
          backgroundVideo: widget.backgroundVideo,
          backgroundStyle: serializeJson(widget.backgroundStyle),
          hidden: widget.hidden,
        })),
      })),
    });
    return deserializeLayout(await result);
  });

  registered = true;
}
