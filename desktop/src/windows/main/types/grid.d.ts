import type { BackgroundStyleConfig } from '@/contracts/background';
import type {
  HomeWidgetSourceType,
  HomeWidgetType,
  WidgetAction,
  WidgetConfig,
  WidgetSizePreset,
} from '@/contracts/home_widget';

export type { BackgroundStyleConfig, BackgroundConfirmPayload } from '@/contracts/background';

export type {
  DateWidgetConfig,
  HomeWidgetSourceType,
  HomeWidgetType,
  PomodoroWidgetConfig,
  TodoWidgetConfig,
  WeatherWidgetConfig,
  WebpageOpenMode,
  WidgetAction,
  WidgetActionType,
  WidgetConfig,
  WidgetSizePreset,
} from '@/contracts/home_widget';

export type GridItem = {
  id: string;
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
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  isDragging: boolean;
  preferredCol: number;
  preferredRow: number;
  priority: number;
  hidden: boolean;
};

export type PendingDragState = {
  item: GridItem;
  pointerId: number;
  target: HTMLElement;
  clientX: number;
  clientY: number;
};

export type CategoryItem = {
  id: string;
  label: string;
  icon: string;
  sortOrder: number;
  gridItems: GridItem[];
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
};

export type GridConfig = {
  GRID_GAP: number;
  MIN_UNIT_SIZE: number;
  FIXED_UNIT_SIZE: number;
  STORAGE_KEY: string;
  GRID_PADDING: number;
  HOLD_DELAY_MS: number;
  FIXED_COLUMNS: number;
  MIN_VIEWPORT_WIDTH: number;
  MIN_VIEWPORT_HEIGHT: number;
};

export type WidgetEditPayload = {
  label: string;
  icon?: string;
  action?: WidgetAction;
  colSpan: number;
  rowSpan: number;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
};

export type WidgetCreatePayload = {
  label: string;
  icon?: string;
  action?: WidgetAction;
  sourceType: HomeWidgetSourceType;
  widgetType: HomeWidgetType;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  colSpan: number;
  rowSpan: number;
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
};
