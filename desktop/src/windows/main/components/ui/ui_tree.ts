export interface UiTreeNodeData {
  id: string;
  label: string;
  tooltip?: string;
  meta?: string;
  badge?: string;
  iconText?: string;
  selectable?: boolean;
  disabled?: boolean;
  children?: UiTreeNodeData[];
  kind?: string;
  data?: unknown;
}

export interface UiTreeEventPayload {
  event: MouseEvent;
  node: UiTreeNodeData;
}

export interface UiTreeDropPayload {
  event: DragEvent;
  node: UiTreeNodeData;
  draggedNode: UiTreeNodeData;
  position: 'before' | 'inside' | 'after';
}
