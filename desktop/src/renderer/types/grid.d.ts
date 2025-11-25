export type GridItem = {
  id: string;
  label: string;
  icon?: string; // 图标名称
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  color: string;
  backgroundImage?: string; // 背景图片（base64或URL）
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
  gridItems: GridItem[];
};

export type GridConfig = {
  GRID_GAP: number;
  MIN_UNIT_SIZE: number;
  STORAGE_KEY: string;
  GRID_PADDING: number;
  HOLD_DELAY_MS: number;
  FIXED_COLUMNS: number;
};

