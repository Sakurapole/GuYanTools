import type { GridItem, CategoryItem } from '../types/grid';
import type {
  CreateHomeWidgetPayload,
  HomeLayoutDto,
  HomeWidgetDto,
  ImportHomeLayoutPayload,
} from '@/contracts/home_layout';

const LEGACY_MIGRATION_MARKER = 'home-layout-legacy-migrated';

type LegacySavedGridItem = Partial<Pick<
  GridItem,
  'id' | 'col' | 'row' | 'colSpan' | 'rowSpan' | 'preferredCol' | 'preferredRow' | 'priority' | 'hidden'
>> & { id: string };

const LEGACY_DEFAULT_CATEGORIES: CategoryItem[] = [
  {
    id: 'category-tools',
    label: '常用工具',
    icon: 'category-tools',
    sortOrder: 1,
    gridItems: [
      {
        id: 'grid-item-1',
        label: '工具1',
        icon: 'tool',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 1,
        row: 1,
        colSpan: 1,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #5c9ded, #84c9ff)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
      {
        id: 'grid-item-2',
        label: '工具2',
        icon: 'settings',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 3,
        row: 1,
        colSpan: 1,
        rowSpan: 2,
        color: 'linear-gradient(135deg, #ff9a75, #ffc38f)',
        isDragging: false,
        preferredCol: 3,
        preferredRow: 1,
        priority: 2,
        hidden: false,
      },
      {
        id: 'grid-item-3',
        label: '工具3',
        icon: 'tool',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 5,
        row: 1,
        colSpan: 2,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #6bdcba, #a5f2d4)',
        isDragging: false,
        preferredCol: 5,
        preferredRow: 1,
        priority: 3,
        hidden: false,
      },
    ],
  },
  {
    id: 'category-media',
    label: '媒体处理',
    icon: 'category-media',
    sortOrder: 2,
    gridItems: [
      {
        id: 'grid-item-4',
        label: '视频',
        icon: 'video',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 1,
        row: 1,
        colSpan: 2,
        rowSpan: 2,
        color: 'linear-gradient(135deg, #b97fff, #d7a6ff)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
      {
        id: 'grid-item-5',
        label: '音频',
        icon: 'audio',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 4,
        row: 1,
        colSpan: 1,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #ff6b9d, #ffa0c5)',
        isDragging: false,
        preferredCol: 4,
        preferredRow: 1,
        priority: 2,
        hidden: false,
      },
    ],
  },
  {
    id: 'category-text',
    label: '文本处理',
    icon: 'category-text',
    sortOrder: 3,
    gridItems: [
      {
        id: 'grid-item-6',
        label: '编辑器',
        icon: 'edit',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 1,
        row: 1,
        colSpan: 3,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #ffd93d, #ffed4e)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
      {
        id: 'grid-item-7',
        label: '转换',
        icon: 'convert',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 1,
        row: 3,
        colSpan: 1,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #6bcf7f, #a5f2b4)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 3,
        priority: 2,
        hidden: false,
      },
    ],
  },
  {
    id: 'category-dev',
    label: '开发工具',
    icon: 'category-dev',
    sortOrder: 4,
    gridItems: [
      {
        id: 'grid-item-8',
        label: 'API',
        icon: 'api',
        action: undefined,
        sourceType: 'shortcut',
        widgetType: 'shortcut',
        col: 1,
        row: 1,
        colSpan: 2,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #667eea, #764ba2)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
    ],
  },
];

function getHomeLayoutApi() {
  if (!window.homeLayoutApi) {
    throw new Error('homeLayoutApi is not available in renderer process');
  }

  return window.homeLayoutApi;
}

function getLayoutStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cloneLegacyDefaults(): CategoryItem[] {
  return LEGACY_DEFAULT_CATEGORIES.map(category => ({
    ...category,
    gridItems: category.gridItems.map(item => ({ ...item })),
  }));
}

function toGridItem(widget: HomeWidgetDto): GridItem {
  return {
    id: widget.id,
    label: widget.label,
    icon: widget.icon,
    action: widget.action,
    sourceType: widget.sourceType ?? 'shortcut',
    widgetType: widget.widgetType ?? 'shortcut',
    sizePreset: widget.sizePreset,
    widgetConfig: widget.widgetConfig,
    col: widget.col,
    row: widget.row,
    colSpan: widget.colSpan,
    rowSpan: widget.rowSpan,
    color: widget.color,
    backgroundImage: widget.backgroundImage,
    backgroundVideo: widget.backgroundVideo,
    backgroundStyle: widget.backgroundStyle,
    isDragging: false,
    preferredCol: widget.preferredCol,
    preferredRow: widget.preferredRow,
    priority: widget.priority,
    hidden: widget.hidden,
  };
}

function toCategoryItems(layout: HomeLayoutDto): CategoryItem[] {
  return layout.categories.map(category => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
    sortOrder: category.sortOrder,
    backgroundColor: category.backgroundColor,
    backgroundImage: category.backgroundImage,
    backgroundVideo: category.backgroundVideo,
    backgroundStyle: category.backgroundStyle,
    gridItems: category.widgets.map(toGridItem),
  }));
}

function toWidgetUpdatePayload(item: GridItem, categoryId: string) {
  return {
    categoryId,
    label: item.label,
    icon: item.icon,
    action: item.action ? { ...item.action } : undefined,
    sourceType: item.sourceType,
    widgetType: item.widgetType,
    sizePreset: item.sizePreset,
    widgetConfig: item.widgetConfig ? { ...item.widgetConfig } : undefined,
    col: item.col,
    row: item.row,
    colSpan: item.colSpan,
    rowSpan: item.rowSpan,
    preferredCol: item.preferredCol,
    preferredRow: item.preferredRow,
    priority: item.priority,
    color: item.color,
    backgroundImage: item.backgroundImage ?? '',
    backgroundVideo: item.backgroundVideo ?? '',
    backgroundStyle: item.backgroundStyle ? { ...item.backgroundStyle } : undefined,
    hidden: item.hidden,
  };
}

function parseSavedGridItems(raw: string | null): Map<string, LegacySavedGridItem> {
  if (!raw) {
    return new Map();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Map();
    }

    const map = new Map<string, LegacySavedGridItem>();
    for (const entry of parsed) {
      if (entry && typeof entry.id === 'string') {
        map.set(entry.id, entry);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function sanitizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function mergeLegacyWidget(item: GridItem, saved?: LegacySavedGridItem): GridItem {
  if (!saved) {
    return { ...item };
  }

  return {
    ...item,
    col: sanitizePositiveInteger(saved.col, item.col),
    row: sanitizePositiveInteger(saved.row, item.row),
    colSpan: sanitizePositiveInteger(saved.colSpan, item.colSpan),
    rowSpan: sanitizePositiveInteger(saved.rowSpan, item.rowSpan),
    preferredCol: sanitizePositiveInteger(saved.preferredCol, item.preferredCol),
    preferredRow: sanitizePositiveInteger(saved.preferredRow, item.preferredRow),
    priority: sanitizePositiveInteger(saved.priority, item.priority),
    hidden: typeof saved.hidden === 'boolean' ? saved.hidden : item.hidden,
  };
}

function loadLegacyCategoryList(storage: Storage) {
  const raw = storage.getItem('category-list');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((entry): entry is { id: string; label: string; icon: string } => {
      return Boolean(entry && typeof entry.id === 'string' && typeof entry.label === 'string' && typeof entry.icon === 'string');
    });
  } catch {
    return null;
  }
}

function buildLegacyImportPayload(storageKey: string): ImportHomeLayoutPayload | null {
  const storage = getLayoutStorage();
  if (!storage) {
    return null;
  }

  const defaults = cloneLegacyDefaults();
  const defaultCategoryMap = new Map(defaults.map(category => [category.id, category]));
  const savedCategoryList = loadLegacyCategoryList(storage);
  const legacyLayoutKeys = Array.from({ length: storage.length })
    .map((_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key && key.startsWith(`${storageKey}-`)));

  if (!savedCategoryList?.length && legacyLayoutKeys.length === 0) {
    return null;
  }

  const sourceCategories = savedCategoryList?.length
    ? savedCategoryList.map((category, index) => ({
      id: category.id,
      label: category.label,
      icon: category.icon,
      sortOrder: defaultCategoryMap.get(category.id)?.sortOrder ?? (index + 1),
    }))
    : defaults.map(category => ({
      id: category.id,
      label: category.label,
      icon: category.icon,
      sortOrder: category.sortOrder,
    }));

  return {
    categories: sourceCategories.map(category => {
      const baseCategory = defaultCategoryMap.get(category.id);
      const savedMap = parseSavedGridItems(storage.getItem(`${storageKey}-${category.id}`));
      const widgets = (baseCategory?.gridItems ?? [])
        .map(item => mergeLegacyWidget(item, savedMap.get(item.id)))
        .map(item => ({
          id: item.id,
          label: item.label,
          icon: item.icon,
          action: item.action,
          sourceType: item.sourceType,
          widgetType: item.widgetType,
          sizePreset: item.sizePreset,
          widgetConfig: item.widgetConfig,
          col: item.col,
          row: item.row,
          colSpan: item.colSpan,
          rowSpan: item.rowSpan,
          preferredCol: item.preferredCol,
          preferredRow: item.preferredRow,
          priority: item.priority,
          color: item.color,
          backgroundImage: item.backgroundImage,
          hidden: item.hidden,
        }));

      return {
        id: category.id,
        label: category.label,
        icon: category.icon,
        sortOrder: category.sortOrder,
        widgets,
      };
    }),
  };
}

function clearLegacyStorage(storageKey: string) {
  const storage = getLayoutStorage();
  if (!storage) {
    return;
  }

  const keys = Array.from({ length: storage.length })
    .map((_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key));

  for (const key of keys) {
    if (key === 'category-list' || key.startsWith(`${storageKey}-`)) {
      storage.removeItem(key);
    }
  }
}

function hasLegacyMigrationMarker(storage: Storage | null): boolean {
  return storage?.getItem(LEGACY_MIGRATION_MARKER) === '1';
}

function markLegacyMigrationDone(storage: Storage | null) {
  storage?.setItem(LEGACY_MIGRATION_MARKER, '1');
}

export function useGridPersistence(storageKey: string) {
  async function loadHomeLayout(): Promise<CategoryItem[]> {
    const layout = await getHomeLayoutApi().getHomeLayout();
    return toCategoryItems(layout);
  }

  async function persistLayout(categoryId: string, gridItems: GridItem[]) {
    const sortedItems = [...gridItems].sort((a, b) => a.priority - b.priority);
    for (const item of sortedItems) {
      await getHomeLayoutApi().updateWidget(item.id, toWidgetUpdatePayload(item, categoryId));
    }
  }

  async function createCategory(category: Pick<CategoryItem, 'id' | 'label' | 'icon' | 'sortOrder'>) {
    return getHomeLayoutApi().createCategory({
      id: category.id,
      label: category.label,
      icon: category.icon,
      sortOrder: category.sortOrder,
    });
  }

  async function deleteWidget(widgetId: string) {
    await getHomeLayoutApi().deleteWidget(widgetId);
  }

  async function updateWidget(item: GridItem, categoryId: string) {
    await getHomeLayoutApi().updateWidget(item.id, toWidgetUpdatePayload(item, categoryId));
  }

  async function createWidget(input: CreateHomeWidgetPayload) {
    return getHomeLayoutApi().createWidget(input);
  }

  async function updateCategoryBackground(
    categoryId: string,
    background: {
      backgroundColor?: string;
      backgroundImage?: string;
      backgroundVideo?: string;
      backgroundStyle?: import('@/contracts/background').BackgroundStyleConfig;
    },
  ) {
    await getHomeLayoutApi().updateCategory(categoryId, {
      ...background,
      backgroundStyle: background.backgroundStyle ? { ...background.backgroundStyle } : undefined,
    });
  }

  async function migrateLegacyLayoutIfNeeded(): Promise<boolean> {
    const storage = getLayoutStorage();
    if (!storage || hasLegacyMigrationMarker(storage)) {
      return false;
    }

    const payload = buildLegacyImportPayload(storageKey);
    if (!payload) {
      return false;
    }

    await getHomeLayoutApi().importLegacyLayout(payload);
    clearLegacyStorage(storageKey);
    markLegacyMigrationDone(storage);
    return true;
  }

  return {
    loadHomeLayout,
    persistLayout,
    createCategory,
    deleteWidget,
    updateWidget,
    createWidget,
    updateCategoryBackground,
    migrateLegacyLayoutIfNeeded,
  };
}

