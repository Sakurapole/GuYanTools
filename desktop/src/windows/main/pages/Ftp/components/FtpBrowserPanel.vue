<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiFileIcon from '@/windows/main/components/ui/UiFileIcon.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiSuggestInput from '@/windows/main/components/ui/UiSuggestInput.vue';
import UiTooltip from '@/windows/main/components/ui/UiTooltip.vue';
import type { FileTransferEntry } from '@/contracts/ftp';
import type { PanelFilterMode, PanelFilterState, PanelKind, PanelFilterOperator, PanelViewMode } from '../types';
import type { PathBreadcrumb } from '../utils/ftpPaths';

type PanelBadge = {
  text: string;
  accent?: boolean;
  danger?: boolean;
};

type CompactBreadcrumb = PathBreadcrumb & {
  collapsed?: boolean;
};

const props = withDefaults(defineProps<{
  kind: PanelKind;
  title: string;
  badges: PanelBadge[];
  active?: boolean;
  dropActive: boolean;
  breadcrumbs: PathBreadcrumb[];
  pathInput: string;
  pathSuggestions: string[];
  pathPlaceholder: string;
  viewMode: PanelViewMode;
  pathInputDisabled?: boolean;
  openPathDisabled?: boolean;
  goParentDisabled?: boolean;
  refreshDisabled?: boolean;
  showSearchControl?: boolean;
  showFilterControl?: boolean;
  showCreateDirectoryAction?: boolean;
  searchExpanded: boolean;
  searchActive: boolean;
  filterExpanded: boolean;
  filterActive: boolean;
  filterQuery: string;
  filterState: PanelFilterState;
  filterSummary: string;
  filterPresetId: string;
  filterPresetOptions: Array<{ label: string; value: string }>;
  entries: FileTransferEntry[];
  loading: boolean;
  loadingText: string;
  emptyText: string;
  dropHint: string;
  selectedPaths: string[];
  selectedCount: number;
  primaryActionLabel: string;
  primaryActionVariant?: 'primary' | 'secondary';
  primaryActionDisabled: boolean;
  createDirectoryDisabled?: boolean;
  showWorkspaceControls?: boolean;
  workspaceSelectValue?: string;
  workspaceOptions?: Array<{ label: string; value: string }>;
  bookmarkDisabled?: boolean;
  removeBookmarkDisabled?: boolean;
  secondaryMetaLabel: string;
  tertiaryMetaLabel: string;
  sizeValue: (entry: FileTransferEntry) => string;
  modifiedValue: (entry: FileTransferEntry) => string;
  permissionsValue: (entry: FileTransferEntry) => string;
  ownerValue: (entry: FileTransferEntry) => string;
  secondaryMetaValue: (entry: FileTransferEntry) => string;
  tertiaryMetaValue: (entry: FileTransferEntry) => string;
  secondaryMetaClass?: string;
  thumbnailUrlFor: (entry: FileTransferEntry) => string;
  isThumbnailLoading: (entry: FileTransferEntry) => boolean;
  highlightEntryName: (name: string, query: string) => string;
  showConnectingOverlay?: boolean;
  connectingTitle?: string;
  connectingMessage?: string;
}>(), {
  pathInputDisabled: false,
  openPathDisabled: false,
  goParentDisabled: false,
  refreshDisabled: false,
  showSearchControl: true,
  showFilterControl: true,
  showCreateDirectoryAction: true,
  primaryActionVariant: 'secondary',
  createDirectoryDisabled: false,
  showWorkspaceControls: false,
  workspaceSelectValue: '',
  workspaceOptions: () => [],
  bookmarkDisabled: false,
  removeBookmarkDisabled: false,
  secondaryMetaClass: '',
  showConnectingOverlay: false,
  connectingTitle: '正在建立连接',
  connectingMessage: '',
  active: false,
});

const emit = defineEmits<{
  'update:pathInput': [value: string];
  'update:filterQuery': [value: string];
  'update:extensionQuery': [value: string];
  'update:minSizeKb': [value: string];
  'update:maxSizeKb': [value: string];
  'update:modifiedWithinDays': [value: string];
  dragenter: [event: DragEvent];
  dragleave: [event: DragEvent];
  dragover: [event: DragEvent];
  drop: [event: DragEvent];
  'list-contextmenu': [event: MouseEvent];
  'entry-click': [payload: { event: MouseEvent; entry: FileTransferEntry; index: number }];
  'entry-dblclick': [entry: FileTransferEntry];
  'entry-dragstart': [payload: { event: DragEvent; entry: FileTransferEntry }];
  'entry-dragend': [payload: { event: DragEvent; entry: FileTransferEntry }];
  'entry-contextmenu': [payload: { event: MouseEvent; entry: FileTransferEntry; index: number }];
  'primary-action': [];
  'create-directory': [];
  'switch-workspace': [value: string];
  'bookmark-current': [];
  'pick-workspace': [];
  'remove-workspace': [];
  'open-breadcrumb': [path: string];
  'open-path': [];
  'go-parent': [];
  refresh: [];
  'toggle-search': [];
  'toggle-filter': [];
  'set-view-mode': [mode: PanelViewMode];
  'set-filter-mode': [mode: PanelFilterMode];
  'set-filter-operator': [operator: PanelFilterOperator];
  'toggle-hide-hidden': [];
  'apply-filter-preset': [value: string];
  'save-filter-preset': [];
  'delete-filter-preset': [];
  'reset-filter': [];
  'panel-activate': [];
  'select-all': [];
  'marquee-select': [payload: { paths: string[]; additive: boolean }];
}>();

const panelRootRef = ref<HTMLElement | null>(null);
const entryListRef = ref<HTMLElement | null>(null);
const panelClass = computed(() => [
  'ftp-inner-card',
  'ftp-panel',
  `ftp-panel--${props.kind}`,
  {
    'ftp-panel--active': props.active,
    'ftp-panel--drop-active': props.dropActive,
  },
]);

const iconClass = computed(() => `ftp-pane-identity__icon--${props.kind}`);
const tableHeadClass = computed(() => `ftp-table__head--${props.kind}`);
const entryClass = computed(() => `ftp-entry--${props.kind}`);
const panelIconLabel = computed(() => (props.kind === 'local' ? 'L' : 'R'));
const compactBreadcrumbs = computed<CompactBreadcrumb[]>(() => {
  if (props.breadcrumbs.length <= 4) {
    return props.breadcrumbs;
  }

  return [
    {
      label: '...',
      path: props.breadcrumbs[Math.max(0, props.breadcrumbs.length - 4)].path,
      collapsed: true,
    },
    ...props.breadcrumbs.slice(-3),
  ];
});
const breadcrumbDirectoryOptions = computed(() => [
  { label: '下级目录', value: '', disabled: true },
  ...props.entries
    .filter((entry) => entry.isDir)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' }))
    .map((entry) => ({
      label: entry.name,
      value: entry.path,
    })),
]);
const showBreadcrumbDirectorySelect = computed(() =>
  props.kind === 'remote' && !props.pathInputDisabled && breadcrumbDirectoryOptions.value.length > 1,
);
const filterOperatorOptions = [
  { label: '全部条件 (AND)', value: 'and' },
  { label: '任一条件 (OR)', value: 'or' },
];
const filterModeOptions: Array<{ label: string; value: PanelFilterMode }> = [
  { label: '全部', value: 'all' },
  { label: '仅文件', value: 'files' },
  { label: '仅文件夹', value: 'folders' },
];
const filterDialogTitle = computed(() => (props.kind === 'local' ? '本地目录过滤' : '远程目录过滤'));
const filterDialogScope = computed(() => (props.kind === 'local' ? '本地目录' : '远程目录'));
const hasRuleFilter = computed(() =>
  props.filterState.mode !== 'all'
  || props.filterState.hideHidden
  || Boolean(props.filterState.extensionQuery.trim())
  || Boolean(props.filterState.minSizeKb.trim())
  || Boolean(props.filterState.maxSizeKb.trim())
  || Boolean(props.filterState.modifiedWithinDays.trim()),
);

// Minimum column width in pixels
const MIN_COL_WIDTH = 56;

// Column widths for details view (name column stays flexible)
const detailsColWidths = reactive({ size: 110, modified: 150, perms: 90, owner: 120 });

// Column widths for list view; default differs per panel kind
const listColWidths = reactive({
  secondary: props.kind === 'local' ? 110 : 150,
  tertiary: props.kind === 'local' ? 170 : 110,
});

// CSS variables applied to .ftp-table so both header and entry rows share the widths
const tableVars = computed(() => {
  if (props.viewMode === 'details') {
    return {
      '--ftp-col-2': `${detailsColWidths.size}px`,
      '--ftp-col-3': `${detailsColWidths.modified}px`,
      '--ftp-col-4': `${detailsColWidths.perms}px`,
      '--ftp-col-5': `${detailsColWidths.owner}px`,
    };
  }
  return {
    '--ftp-col-2': `${listColWidths.secondary}px`,
    '--ftp-col-3': `${listColWidths.tertiary}px`,
  };
});

type ResizableCol = 'detailsSize' | 'detailsModified' | 'detailsPerms' | 'detailsOwner' | 'listSecondary' | 'listTertiary';

function getColWidth(col: ResizableCol): number {
  switch (col) {
    case 'detailsSize': return detailsColWidths.size;
    case 'detailsModified': return detailsColWidths.modified;
    case 'detailsPerms': return detailsColWidths.perms;
    case 'detailsOwner': return detailsColWidths.owner;
    case 'listSecondary': return listColWidths.secondary;
    case 'listTertiary': return listColWidths.tertiary;
  }
}

function setColWidth(col: ResizableCol, width: number): void {
  switch (col) {
    case 'detailsSize': detailsColWidths.size = width; break;
    case 'detailsModified': detailsColWidths.modified = width; break;
    case 'detailsPerms': detailsColWidths.perms = width; break;
    case 'detailsOwner': detailsColWidths.owner = width; break;
    case 'listSecondary': listColWidths.secondary = width; break;
    case 'listTertiary': listColWidths.tertiary = width; break;
  }
}

function startResize(event: MouseEvent, col: ResizableCol, invert = false): void {
  const startX = event.clientX;
  const startWidth = getColWidth(col);

  const onMouseMove = (e: MouseEvent): void => {
    // When invert is true (name-column boundary), negate the delta so that
    // dragging right shrinks the adjacent fixed column, growing the flexible name column.
    const delta = invert ? startX - e.clientX : e.clientX - startX;
    setColWidth(col, Math.max(MIN_COL_WIDTH, startWidth + delta));
  };

  const onMouseUp = (): void => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function setFilterDialogOpen(value: boolean): void {
  if (value !== props.filterExpanded) {
    emit('toggle-filter');
  }
}

const marqueeState = reactive({
  active: false,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
});
const marqueeStyle = computed(() => ({
  left: `${marqueeState.left}px`,
  top: `${marqueeState.top}px`,
  width: `${marqueeState.width}px`,
  height: `${marqueeState.height}px`,
}));
let marqueeStartX = 0;
let marqueeStartY = 0;
let marqueeAdditive = false;

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(
    'input, textarea, select, option, button, [contenteditable], [role="textbox"], .cm-editor, .cm-content',
  ));
}

function handlePanelPointerDown(event: PointerEvent): void {
  emit('panel-activate');
  if (!isEditableTarget(event.target)) {
    panelRootRef.value?.focus({ preventScroll: true });
  }
}

function handlePanelKeydown(event: KeyboardEvent): void {
  const isSelectAll = (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === 'a';
  if (!isSelectAll || isEditableTarget(event.target)) return;
  event.preventDefault();
  emit('select-all');
}

function openParentDirectory(): void {
  if (props.goParentDisabled) return;
  emit('go-parent');
}

function openBreadcrumbDirectory(value: string | number): void {
  const path = String(value);
  if (!path) return;
  emit('open-breadcrumb', path);
}

function entryIntersectsSelection(entryRect: DOMRect, selectionRect: DOMRect): boolean {
  return entryRect.left < selectionRect.right
    && entryRect.right > selectionRect.left
    && entryRect.top < selectionRect.bottom
    && entryRect.bottom > selectionRect.top;
}

function updateMarqueeSelection(event: MouseEvent): void {
  const list = entryListRef.value;
  if (!list) return;

  const listRect = list.getBoundingClientRect();
  const leftClient = Math.min(marqueeStartX, event.clientX);
  const rightClient = Math.max(marqueeStartX, event.clientX);
  const topClient = Math.min(marqueeStartY, event.clientY);
  const bottomClient = Math.max(marqueeStartY, event.clientY);
  const visibleLeft = Math.max(listRect.left, leftClient);
  const visibleRight = Math.min(listRect.right, rightClient);
  const visibleTop = Math.max(listRect.top, topClient);
  const visibleBottom = Math.min(listRect.bottom, bottomClient);

  marqueeState.left = Math.max(0, visibleLeft - listRect.left);
  marqueeState.top = Math.max(0, visibleTop - listRect.top);
  marqueeState.width = Math.max(0, visibleRight - visibleLeft);
  marqueeState.height = Math.max(0, visibleBottom - visibleTop);

  const selectionRect = new DOMRect(leftClient, topClient, rightClient - leftClient, bottomClient - topClient);
  const selectedPaths = Array.from(list.querySelectorAll<HTMLElement>('.ftp-entry[data-entry-path]'))
    .filter((element) => entryIntersectsSelection(element.getBoundingClientRect(), selectionRect))
    .map((element) => element.dataset.entryPath)
    .filter((path): path is string => Boolean(path));
  emit('marquee-select', { paths: selectedPaths, additive: marqueeAdditive });
}

function stopMarqueeSelection(): void {
  document.removeEventListener('mousemove', handleMarqueeMouseMove);
  document.removeEventListener('mouseup', handleMarqueeMouseUp);
  marqueeState.active = false;
}

function handleMarqueeMouseMove(event: MouseEvent): void {
  updateMarqueeSelection(event);
}

function handleMarqueeMouseUp(event: MouseEvent): void {
  updateMarqueeSelection(event);
  stopMarqueeSelection();
}

function isDirectoryTableControlTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(
    '.ftp-entry, .ftp-table__head, .ftp-col-resizer, button, input, textarea, select, [contenteditable], [role="textbox"]',
  ));
}

function handleTableContentMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return;
  if (isDirectoryTableControlTarget(event.target)) {
    return;
  }

  event.preventDefault();
  emit('panel-activate');
  panelRootRef.value?.focus({ preventScroll: true });
  marqueeStartX = event.clientX;
  marqueeStartY = event.clientY;
  marqueeAdditive = event.ctrlKey || event.metaKey;
  marqueeState.active = true;
  updateMarqueeSelection(event);
  document.addEventListener('mousemove', handleMarqueeMouseMove);
  document.addEventListener('mouseup', handleMarqueeMouseUp);
}

function handleTableContentContextMenu(event: MouseEvent): void {
  if (isDirectoryTableControlTarget(event.target)) {
    return;
  }

  event.preventDefault();
  emit('list-contextmenu', event);
}

onBeforeUnmount(() => {
  stopMarqueeSelection();
});
</script>

<template>
  <div
    ref="panelRootRef"
    :class="panelClass"
    tabindex="-1"
    @pointerdown.capture="handlePanelPointerDown"
    @keydown="handlePanelKeydown"
    @focusin="$emit('panel-activate')"
    @dragenter.prevent="$emit('dragenter', $event)"
    @dragleave="$emit('dragleave', $event)"
    @dragover.prevent="$emit('dragover', $event)"
    @drop="$emit('drop', $event)"
  >
    <div class="ftp-panel__titlebar">
      <div class="ftp-pane-identity">
        <span class="ftp-pane-identity__icon" :class="iconClass">{{ panelIconLabel }}</span>
        <div class="ftp-pane-identity__copy">
          <div class="ftp-panel__title">{{ title }}</div>
        </div>
      </div>
      <div class="ftp-panel__titlebar-meta">
        <span
          v-for="badge in badges"
          :key="badge.text"
          class="ftp-badge"
          :class="{ 'ftp-badge--accent': badge.accent, 'ftp-badge--danger': badge.danger }"
        >
          {{ badge.text }}
        </span>
      </div>
    </div>

    <div class="ftp-panel__controls">
      <div class="ftp-panel__toolrow">
        <div class="ftp-panel__breadcrumbs" :class="{ 'ftp-panel__breadcrumbs--disabled': pathInputDisabled }">
          <template v-for="(breadcrumb, index) in compactBreadcrumbs" :key="`${breadcrumb.path}:${index}`">
            <UiTooltip :content="breadcrumb.collapsed ? pathInput : breadcrumb.label" placement="bottom" :delay="450">
              <UiIconButton
                size="sm"
                variant="ghost"
                class="ftp-panel__breadcrumb"
                :class="{ 'ftp-panel__breadcrumb--ellipsis': breadcrumb.collapsed }"
                :disabled="pathInputDisabled"
                :label="breadcrumb.label"
                @click="$emit('open-breadcrumb', breadcrumb.path)"
              />
            </UiTooltip>
            <span v-if="index < compactBreadcrumbs.length - 1" class="ftp-panel__breadcrumb-separator">/</span>
          </template>
          <span v-if="!breadcrumbs.length" class="ftp-panel__breadcrumb-empty">未选择路径</span>
          <UiSelect
            v-if="showBreadcrumbDirectorySelect"
            class="ftp-panel__breadcrumb-directory-select"
            size="sm"
            :model-value="''"
            :options="breadcrumbDirectoryOptions"
            @change="openBreadcrumbDirectory"
          />
          <UiIconButton
            v-if="showWorkspaceControls"
            class="ftp-panel__breadcrumb-picker"
            size="sm"
            variant="ghost"
            title="选择目录"
            @click="$emit('pick-workspace')"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5z" />
              <path d="M9.5 8.8h-3M8 7.3v3" />
            </svg>
          </UiIconButton>
        </div>

        <div class="ftp-panel__actions">
          <UiIconButton size="sm" variant="ghost" :active="viewMode === 'list'" title="列表" @click="$emit('set-view-mode', 'list')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" :active="viewMode === 'details'" title="详情" @click="$emit('set-view-mode', 'details')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M2 4h3M2 8h3M2 12h3M7 4h7M7 8h7M7 12h7" />
            </svg>
          </UiIconButton>
        </div>
      </div>

      <div class="ftp-panel__commandrow">
        <UiIconButton size="sm" :variant="primaryActionVariant" :disabled="primaryActionDisabled" :title="primaryActionLabel" @click="$emit('primary-action')">
          <!-- 上传图标（本地面板）or 下载图标（远程面板）-->
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path v-if="kind === 'local'" d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10" />
            <path v-else d="M8 3v8M4.5 7.5L8 11l3.5-3.5M3 13h10" />
          </svg>
        </UiIconButton>
        <UiIconButton
          v-if="showCreateDirectoryAction"
          size="sm"
          variant="secondary"
          title="新建目录"
          :disabled="createDirectoryDisabled"
          @click="$emit('create-directory')"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5z" />
            <path d="M8 7.5v3M6.5 9h3" />
          </svg>
        </UiIconButton>

        <template v-if="showWorkspaceControls">
          <UiIconButton size="sm" variant="ghost" :disabled="bookmarkDisabled" title="收藏当前" @click="$emit('bookmark-current')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" />
            </svg>
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" :disabled="removeBookmarkDisabled" title="移除书签" @click="$emit('remove-workspace')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" />
              <path d="M6 9h4" />
            </svg>
          </UiIconButton>
        </template>

        <div class="ftp-panel__path-input-wrap">
          <UiSelect
            v-if="showWorkspaceControls"
            size="sm"
            :model-value="workspaceSelectValue"
            :options="workspaceOptions"
            @change="$emit('switch-workspace', String($event))"
          />
          <UiSuggestInput
            v-else
            :model-value="pathInput"
            :suggestions="pathSuggestions"
            :placeholder="pathPlaceholder"
            :disabled="pathInputDisabled"
            @update:modelValue="$emit('update:pathInput', $event)"
            @enter="$emit('open-path')"
          />
        </div>
        <UiIconButton v-if="!showWorkspaceControls" size="sm" variant="secondary" :disabled="openPathDisabled" title="打开" @click="$emit('open-path')">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5z" />
          </svg>
        </UiIconButton>
        <UiIconButton
          class="ftp-panel__icon-action"
          size="sm"
          variant="secondary"
          :disabled="goParentDisabled"
          :title="kind === 'local' ? '本地上级' : '远程上级'"
          @click="$emit('go-parent')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 12V4M4.5 7.5L8 4l3.5 3.5" />
          </svg>
        </UiIconButton>
        <UiIconButton
          v-if="showSearchControl"
          class="ftp-panel__icon-action"
          size="sm"
          variant="ghost"
          :disabled="refreshDisabled"
          :title="kind === 'local' ? '刷新本地' : '刷新远程'"
          @click="$emit('refresh')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.5 5.5V2.8H9.8" />
            <path d="M3.5 10.5v2.7h2.7" />
            <path d="M12 6A4.5 4.5 0 0 0 4.8 4.2L3.5 5.5" />
            <path d="M4 10A4.5 4.5 0 0 0 11.2 11.8l1.3-1.3" />
          </svg>
        </UiIconButton>
        <UiIconButton
          v-if="showFilterControl"
          class="ftp-panel__icon-action"
          size="sm"
          variant="ghost"
          :active="searchActive"
          title="搜索当前目录"
          @click="$emit('toggle-search')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="7" cy="7" r="3.75" />
            <path d="M10.2 10.2L13 13" />
          </svg>
        </UiIconButton>
        <UiIconButton
          class="ftp-panel__icon-action"
          size="sm"
          variant="ghost"
          :active="filterActive"
          title="过滤当前目录"
          @click="$emit('toggle-filter')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
          </svg>
        </UiIconButton>

        <div
          v-if="showSearchControl"
          class="ftp-panel__search-shell"
          :class="{ 'ftp-panel__search-shell--expanded': searchExpanded }"
        >
          <div class="ftp-panel__search-wrap">
            <UiInput :model-value="filterQuery" placeholder="搜索当前目录" @update:modelValue="$emit('update:filterQuery', $event)" />
          </div>
        </div>

      </div>
    </div>

    <UiDialog
      v-if="showFilterControl"
      class="ftp-filter-dialog"
      :model-value="filterExpanded"
      width="min(720px, calc(100vw - 32px))"
      max-width="720px"
      aria-label="目录过滤设置"
      @update:modelValue="setFilterDialogOpen"
    >
      <template #header>
        <div class="ftp-filter-dialog__header">
          <div class="ftp-filter-dialog__title-group">
            <span class="ftp-filter-dialog__eyebrow">{{ filterDialogScope }}</span>
            <h2 class="ftp-filter-dialog__title">{{ filterDialogTitle }}</h2>
          </div>
          <UiIconButton size="sm" variant="ghost" title="关闭" @click="setFilterDialogOpen(false)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </UiIconButton>
        </div>
      </template>

      <div class="ftp-filter-dialog__body">
        <section class="ftp-filter-dialog__section ftp-filter-dialog__section--summary">
          <span class="ftp-filter-dialog__section-label">当前规则</span>
          <strong class="ftp-filter-dialog__summary">{{ filterSummary }}</strong>
        </section>

        <section class="ftp-filter-dialog__section">
          <div class="ftp-filter-dialog__section-head">
            <span class="ftp-filter-dialog__section-label">类型范围</span>
          </div>
          <div class="ftp-filter-dialog__segmented">
            <UiButton
              v-for="option in filterModeOptions"
              :key="option.value"
              size="sm"
              variant="ghost"
              :active="filterState.mode === option.value"
              @click="$emit('set-filter-mode', option.value)"
            >
              {{ option.label }}
            </UiButton>
          </div>
        </section>

        <section class="ftp-filter-dialog__grid">
          <label class="ftp-filter-dialog__field">
            <span>匹配方式</span>
            <UiSelect
              size="sm"
              :model-value="filterState.operator"
              :options="filterOperatorOptions"
              @change="$emit('set-filter-operator', String($event) as PanelFilterOperator)"
            />
          </label>
          <label class="ftp-filter-dialog__field">
            <span>过滤预设</span>
            <UiSelect
              size="sm"
              :model-value="filterPresetId"
              :options="filterPresetOptions"
              @change="$emit('apply-filter-preset', String($event))"
            />
          </label>
        </section>

        <section class="ftp-filter-dialog__grid ftp-filter-dialog__grid--three">
          <label class="ftp-filter-dialog__field">
            <span>扩展名</span>
            <UiInput
              :model-value="filterState.extensionQuery"
              placeholder=".log,.json"
              @update:modelValue="$emit('update:extensionQuery', $event)"
            />
          </label>
          <label class="ftp-filter-dialog__field">
            <span>最小大小 KB</span>
            <UiInput
              :model-value="filterState.minSizeKb"
              placeholder="0"
              @update:modelValue="$emit('update:minSizeKb', $event)"
            />
          </label>
          <label class="ftp-filter-dialog__field">
            <span>最大大小 KB</span>
            <UiInput
              :model-value="filterState.maxSizeKb"
              placeholder="不限"
              @update:modelValue="$emit('update:maxSizeKb', $event)"
            />
          </label>
        </section>

        <section class="ftp-filter-dialog__grid">
          <label class="ftp-filter-dialog__field">
            <span>修改时间</span>
            <UiInput
              :model-value="filterState.modifiedWithinDays"
              placeholder="最近 N 天"
              @update:modelValue="$emit('update:modifiedWithinDays', $event)"
            />
          </label>
          <div class="ftp-filter-dialog__check">
            <UiCheckbox size="sm" :model-value="filterState.hideHidden" @update:modelValue="$emit('toggle-hide-hidden')">
              隐藏隐藏项
            </UiCheckbox>
          </div>
        </section>
      </div>

      <template #footer>
        <div class="ftp-filter-dialog__footer">
          <div class="ftp-filter-dialog__footer-left">
            <UiButton size="sm" variant="ghost" :disabled="!hasRuleFilter" @click="$emit('reset-filter')">清空过滤</UiButton>
          </div>
          <div class="ftp-filter-dialog__footer-actions">
            <UiButton size="sm" variant="ghost" @click="$emit('save-filter-preset')">保存预设</UiButton>
            <UiButton size="sm" variant="ghost" :disabled="!filterPresetId" @click="$emit('delete-filter-preset')">删除预设</UiButton>
            <UiButton size="sm" variant="primary" @click="setFilterDialogOpen(false)">完成</UiButton>
          </div>
        </div>
      </template>
    </UiDialog>

    <div class="ftp-table" :class="{ 'ftp-table--details': viewMode === 'details' }" :style="tableVars">
      <UiScrollbar class="ftp-table__scroll" :x="false" :size="6">
        <div class="ftp-table__content" @mousedown="handleTableContentMouseDown" @contextmenu="handleTableContentContextMenu">
          <!-- 表头在可滚动区域内，横向滚动时与列表同步 -->
          <div class="ftp-table__head" :class="[tableHeadClass, { 'ftp-table__head--details': viewMode === 'details' }]">
            <template v-if="viewMode === 'details'">
              <!-- Resizer on the name column uses invert=true: dragging right shrinks the next
                   fixed column, which lets the flexible name column grow. -->
              <div class="ftp-col-header">
                <span>名称</span>
                <div class="ftp-col-resizer" @mousedown.prevent="startResize($event, 'detailsSize', true)" />
              </div>
              <!-- Each fixed column's resizer controls that column's own width (drag right = column grows). -->
              <div class="ftp-col-header ftp-col-header--right">
                <span>大小</span>
                <div class="ftp-col-resizer" @mousedown.prevent="startResize($event, 'detailsSize', false)" />
              </div>
              <div class="ftp-col-header ftp-col-header--right">
                <span>修改时间</span>
                <div class="ftp-col-resizer" @mousedown.prevent="startResize($event, 'detailsModified', false)" />
              </div>
              <div class="ftp-col-header ftp-col-header--right">
                <span>权限</span>
                <div class="ftp-col-resizer" @mousedown.prevent="startResize($event, 'detailsPerms', false)" />
              </div>
              <div class="ftp-col-header ftp-col-header--right">
                <span>所有者</span>
              </div>
            </template>
            <template v-else>
              <div class="ftp-col-header">
                <span>名称</span>
                <div class="ftp-col-resizer" @mousedown.prevent="startResize($event, 'listSecondary', true)" />
              </div>
              <div class="ftp-col-header ftp-col-header--right">
                <span>{{ secondaryMetaLabel }}</span>
                <div class="ftp-col-resizer" @mousedown.prevent="startResize($event, 'listSecondary', false)" />
              </div>
              <div class="ftp-col-header ftp-col-header--right">
                <span>{{ tertiaryMetaLabel }}</span>
              </div>
            </template>
          </div>

          <div ref="entryListRef" class="ftp-entry-list">
            <div
              class="ftp-entry ftp-entry--parent"
              :class="[entryClass, { 'ftp-entry--details': viewMode === 'details', 'ftp-entry--disabled': goParentDisabled }]"
              :role="goParentDisabled ? undefined : 'button'"
              :tabindex="goParentDisabled ? undefined : 0"
              :aria-disabled="goParentDisabled ? 'true' : undefined"
              title="返回上一级目录"
              @click="openParentDirectory"
              @dblclick="openParentDirectory"
              @keydown.enter.prevent="openParentDirectory"
              @keydown.space.prevent="openParentDirectory"
              @contextmenu.prevent.stop
            >
              <div class="ftp-entry__name">
                <UiFileIcon name=".." :is-dir="true" />
                <span class="ftp-entry__name-text">..</span>
              </div>
              <template v-if="viewMode === 'details'">
                <div class="ftp-entry__meta ftp-entry__meta--align-right">上级目录</div>
                <div class="ftp-entry__meta ftp-entry__meta--align-right" />
                <div class="ftp-entry__meta ftp-entry__meta--align-right ftp-entry__meta--mono" />
                <div class="ftp-entry__meta ftp-entry__meta--align-right" />
              </template>
              <template v-else>
                <div class="ftp-entry__meta ftp-entry__meta--align-right" :class="secondaryMetaClass">上级目录</div>
                <div class="ftp-entry__meta ftp-entry__meta--align-right" />
              </template>
            </div>

            <div
              v-for="(entry, index) in entries"
              :key="entry.path"
              class="ftp-entry"
              :data-entry-path="entry.path"
              :class="[
                entryClass,
                {
                  'ftp-entry--selected': selectedPaths.includes(entry.path),
                  'ftp-entry--details': viewMode === 'details',
                },
              ]"
              :draggable="true"
              @click="$emit('entry-click', { event: $event, entry, index })"
              @dblclick="$emit('entry-dblclick', entry)"
              @dragstart="$emit('entry-dragstart', { event: $event, entry })"
              @dragend="$emit('entry-dragend', { event: $event, entry })"
              @contextmenu="$emit('entry-contextmenu', { event: $event, entry, index })"
            >
              <div class="ftp-entry__name">
                <img
                  v-if="thumbnailUrlFor(entry)"
                  class="ftp-entry__thumb"
                  :src="thumbnailUrlFor(entry)"
                  :alt="entry.name"
                />
                <span v-else-if="isThumbnailLoading(entry)" class="ftp-entry__thumb ftp-entry__thumb--loading" />
                <UiFileIcon v-else :name="entry.name" :is-dir="entry.isDir" />
                <UiTooltip :content="entry.name" placement="right" :delay="700" block>
                  <span class="ftp-entry__name-text" v-html="highlightEntryName(entry.name, filterQuery)" />
                </UiTooltip>
              </div>
              <template v-if="viewMode === 'details'">
                <div class="ftp-entry__meta ftp-entry__meta--align-right">{{ sizeValue(entry) }}</div>
                <div class="ftp-entry__meta ftp-entry__meta--align-right">{{ modifiedValue(entry) }}</div>
                <div class="ftp-entry__meta ftp-entry__meta--align-right ftp-entry__meta--mono">{{ permissionsValue(entry) }}</div>
                <div class="ftp-entry__meta ftp-entry__meta--align-right">{{ ownerValue(entry) }}</div>
              </template>
              <template v-else>
                <div class="ftp-entry__meta ftp-entry__meta--align-right" :class="secondaryMetaClass">{{ secondaryMetaValue(entry) }}</div>
                <div class="ftp-entry__meta ftp-entry__meta--align-right">{{ tertiaryMetaValue(entry) }}</div>
              </template>
            </div>

            <div v-if="loading" class="ftp-loading-state">
              <span class="ftp-loading-state__spinner" />
              <span class="ftp-loading-state__text">{{ loadingText }}</span>
            </div>
            <div v-else-if="!entries.length" class="ftp-empty-state">{{ emptyText }}</div>
            <div v-if="dropActive" class="ftp-drop-hint">{{ dropHint }}</div>
            <div v-if="marqueeState.active" class="ftp-selection-marquee" :style="marqueeStyle" />
          </div>
        </div>
      </UiScrollbar>

      <div v-if="selectedCount" class="ftp-selection-overlay">已选 {{ selectedCount }} 项</div>

      <div v-if="showConnectingOverlay" class="ftp-panel__connecting-overlay">
        <div class="ftp-panel__connecting-card">
          <span class="ftp-panel__connecting-spinner" />
          <strong>{{ connectingTitle }}</strong>
          <span>{{ connectingMessage }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
