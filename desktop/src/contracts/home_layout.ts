import type { BackgroundStyleConfig } from './background';
import type {
  HomeWidgetSourceType,
  HomeWidgetType,
  WidgetAction,
  WidgetConfig,
  WidgetSizePreset,
} from './home_widget';

export interface HomeWidgetDto {
  id: string;
  workspaceId: number;
  categoryId: string;
  label: string;
  icon?: string;
  action?: WidgetAction;
  sourceType: HomeWidgetSourceType;
  widgetType: HomeWidgetType;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  preferredCol: number;
  preferredRow: number;
  priority: number;
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomeLayoutCategoryDto {
  id: string;
  workspaceId: number;
  label: string;
  icon: string;
  sortOrder: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  widgets: HomeWidgetDto[];
}

export interface HomeLayoutDto {
  workspaceKey: string;
  categories: HomeLayoutCategoryDto[];
}

export interface CreateHomeCategoryPayload {
  id: string;
  label: string;
  icon: string;
  sortOrder: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
}

export interface UpdateHomeCategoryPayload {
  label?: string;
  icon?: string;
  sortOrder?: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
}

export interface CreateHomeWidgetPayload {
  id: string;
  categoryId: string;
  label: string;
  icon?: string;
  action?: WidgetAction;
  sourceType: HomeWidgetSourceType;
  widgetType: HomeWidgetType;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  preferredCol: number;
  preferredRow: number;
  priority: number;
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  hidden: boolean;
}

export interface UpdateHomeWidgetPayload {
  categoryId?: string;
  label?: string;
  icon?: string;
  action?: WidgetAction;
  sourceType?: HomeWidgetSourceType;
  widgetType?: HomeWidgetType;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  col?: number;
  row?: number;
  colSpan?: number;
  rowSpan?: number;
  preferredCol?: number;
  preferredRow?: number;
  priority?: number;
  color?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  hidden?: boolean;
}

export interface ImportHomeWidgetPayload {
  id: string;
  label: string;
  icon?: string;
  action?: WidgetAction;
  sourceType?: HomeWidgetSourceType;
  widgetType?: HomeWidgetType;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  preferredCol: number;
  preferredRow: number;
  priority: number;
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  hidden: boolean;
}

export interface ImportHomeCategoryPayload {
  id: string;
  label: string;
  icon: string;
  sortOrder: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  widgets: ImportHomeWidgetPayload[];
}

export interface ImportHomeLayoutPayload {
  categories: ImportHomeCategoryPayload[];
}

export interface HomeLayoutApi {
  getHomeLayout: () => Promise<HomeLayoutDto>;
  createCategory: (input: CreateHomeCategoryPayload) => Promise<HomeLayoutCategoryDto>;
  updateCategory: (categoryId: string, input: UpdateHomeCategoryPayload) => Promise<HomeLayoutCategoryDto>;
  deleteCategory: (categoryId: string) => Promise<void>;
  createWidget: (input: CreateHomeWidgetPayload) => Promise<HomeWidgetDto>;
  updateWidget: (widgetId: string, input: UpdateHomeWidgetPayload) => Promise<HomeWidgetDto>;
  deleteWidget: (widgetId: string) => Promise<void>;
  importLegacyLayout: (input: ImportHomeLayoutPayload) => Promise<HomeLayoutDto>;
}
