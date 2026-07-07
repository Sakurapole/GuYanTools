<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { TerminalLayoutMode, TerminalRendererMode, TerminalSessionDescriptor } from '@/contracts/terminal';
import type { UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ConnectionLayoutConfig } from '@/windows/main/session_layouts';
import { BUILTIN_SCHEMES } from './terminal-themes';

const props = defineProps<{
  activeSession: TerminalSessionDescriptor | null;
  rendererMode: TerminalRendererMode;
  layoutMode: TerminalLayoutMode;
  colorSchemeId: string;

  /** Whether the current session is SSH mode */
  sshMode?: boolean;
  /** Whether the current view can be detached into an independent window */
  canDetach?: boolean;
  /** Whether port forward panel is open */
  portForwardOpen?: boolean;
  /** Whether the toolbar title can be renamed inline */
  titleEditable?: boolean;
  connectionLayouts?: ConnectionLayoutConfig[];
}>();

const emit = defineEmits<{
  'update:colorSchemeId': [value: string];
  detach: [];
  clear: [];
  search: [];
  background: [];
  portForward: [];
  openFileManager: [];
  resetLayoutSize: [];
  saveConnectionLayout: [];
  openConnectionLayout: [layoutId: string];
  deleteConnectionLayout: [layoutId: string];
  rename: [sessionId: string, newLabel: string];
  'update:rendererMode': [value: TerminalRendererMode];
  'update:layoutMode': [value: TerminalLayoutMode];
}>();

const rendererOptions: UiSelectOption[] = [
  { label: '自动', value: 'auto' },
  { label: '标准', value: 'standard' },
  { label: 'WebGL', value: 'webgl' },
];

const layoutOptions: UiSelectOption[] = [
  { label: '标签布局', value: 'tabbed' },
  { label: '水平分屏', value: 'split-horizontal' },
  { label: '垂直分屏', value: 'split-vertical' },
  { label: '主从布局', value: 'master-stack' },
  { label: '递减布局', value: 'dwindle' },
  { label: '网格布局', value: 'grid' },
];

const selectedConnectionLayoutId = ref('');
const connectionLayoutOptions = computed<UiSelectOption[]>(() => [
  { label: '打开布局...', value: '' },
  ...(props.connectionLayouts ?? []).map((layout) => ({
    label: layout.name,
    value: layout.id,
  })),
]);

watch(
  () => props.connectionLayouts,
  (layouts) => {
    if (!selectedConnectionLayoutId.value) return;
    if (!(layouts ?? []).some((layout) => layout.id === selectedConnectionLayoutId.value)) {
      selectedConnectionLayoutId.value = '';
    }
  },
);

const schemeOptions = computed<UiSelectOption[]>(() => {
  const darkSchemes = BUILTIN_SCHEMES.filter((s) => s.group === 'dark');
  const lightSchemes = BUILTIN_SCHEMES.filter((s) => s.group === 'light');
  const options: UiSelectOption[] = [];

  if (darkSchemes.length > 0) {
    options.push({ label: '-- 深色方案 --', value: '__dark_divider__', disabled: true });
    for (const s of darkSchemes) {
      options.push({ label: s.label, value: s.id });
    }
  }

  if (lightSchemes.length > 0) {
    options.push({ label: '-- 浅色方案 --', value: '__light_divider__', disabled: true });
    for (const s of lightSchemes) {
      options.push({ label: s.label, value: s.id });
    }
  }

  return options;
});

// ── Responsive layout state ───────────────────────────────────
// 'full' = icon + text, 'icon' = icon only, 'collapsed' = overflow menu
type ToolbarActionMode = 'full' | 'icon' | 'collapsed';
const actionMode = ref<ToolbarActionMode>('full');
const toolbarRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

// Breakpoints for the right section (px)
const FULL_BREAKPOINT = 820;
const ICON_BREAKPOINT = 460;

function updateActionMode(width: number) {
  if (width >= FULL_BREAKPOINT) {
    actionMode.value = 'full';
  } else if (width >= ICON_BREAKPOINT) {
    actionMode.value = 'icon';
  } else {
    actionMode.value = 'collapsed';
  }
}

onMounted(() => {
  if (toolbarRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateActionMode(entry.contentRect.width);
      }
    });
    resizeObserver.observe(toolbarRef.value);
    // Initialize
    updateActionMode(toolbarRef.value.offsetWidth);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

// ── Action button definitions ─────────────────────────────────
interface ActionItem {
  id: string;
  label: string;
  icon: string; // SVG path content
  event: string;
  show: () => boolean;
  disabled: () => boolean;
  active?: () => boolean;
}

const actionItems = computed<ActionItem[]>(() => [
  {
    id: 'background',
    label: '个性化',
    icon: 'background',
    event: 'background',
    show: () => true,
    disabled: () => false,
  },
  {
    id: 'portForward',
    label: '端口转发',
    icon: 'portForward',
    event: 'portForward',
    show: () => !!props.sshMode,
    disabled: () => false,
    active: () => !!props.portForwardOpen,
  },
  {
    id: 'fileManager',
    label: '文件管理器',
    icon: 'fileManager',
    event: 'openFileManager',
    show: () => !!props.sshMode,
    disabled: () => false,
  },
  {
    id: 'resetLayoutSize',
    label: '恢复布局大小',
    icon: 'resetLayoutSize',
    event: 'resetLayoutSize',
    show: () => props.layoutMode !== 'tabbed',
    disabled: () => false,
  },
  {
    id: 'search',
    label: '搜索',
    icon: 'search',
    event: 'search',
    show: () => true,
    disabled: () => false,
  },
  {
    id: 'detach',
    label: '独立窗口',
    icon: 'detach',
    event: 'detach',
    show: () => true,
    disabled: () => !(props.activeSession || props.canDetach),
  },
  {
    id: 'clear',
    label: '清屏',
    icon: 'clear',
    event: 'clear',
    show: () => true,
    disabled: () => false,
  },
]);

const visibleActions = computed(() => actionItems.value.filter((a) => a.show()));

function handleAction(action: ActionItem) {
  if (action.disabled()) return;
  emit(action.event as any);
}

function handleConnectionLayoutSelect(value: string | number) {
  const layoutId = String(value || '');
  selectedConnectionLayoutId.value = layoutId;
  if (layoutId) {
    emit('openConnectionLayout', layoutId);
  }
}

// ── Inline rename state ───────────────────────────────────────
const titleEditing = ref(false);
const titleEditValue = ref('');
const titleInputRef = ref<InstanceType<typeof UiInput> | null>(null);

function startTitleEdit() {
  if (!props.titleEditable) return;
  if (!props.activeSession) return;
  titleEditValue.value = props.activeSession.profileLabel;
  titleEditing.value = true;
  void nextTick(() => {
    titleInputRef.value?.focus();
    titleInputRef.value?.select();
  });
}

function commitTitleEdit() {
  if (!props.activeSession) return;
  const trimmed = titleEditValue.value.trim();
  if (trimmed && trimmed !== props.activeSession.profileLabel) {
    emit('rename', props.activeSession.sessionId, trimmed);
  }
  titleEditing.value = false;
}

function handleTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    (e.target as HTMLInputElement)?.blur();
  } else if (e.key === 'Escape') {
    titleEditing.value = false;
  }
}
</script>

<template>
  <div ref="toolbarRef" class="terminal-toolbar">
    <div class="terminal-toolbar__left">
      <div v-if="activeSession" class="terminal-toolbar__title">
        <UiInput
          v-if="titleEditing"
          ref="titleInputRef"
          v-model="titleEditValue"
          class="title-name-input"
          size="sm"
          @blur="commitTitleEdit"
          @keydown="handleTitleKeydown"
        />
        <span
          v-else
          class="title-name"
          :class="{ 'title-name--editable': titleEditable }"
          :title="activeSession.profileLabel"
          @click="startTitleEdit"
        >{{ activeSession.profileLabel }}</span>
      </div>
    </div>

    <div class="terminal-toolbar__right">
      <UiSelect
        :model-value="colorSchemeId"
        :options="schemeOptions"
        size="sm"
        @update:modelValue="emit('update:colorSchemeId', $event as string)"
      />
      <UiSelect
        :model-value="rendererMode"
        :options="rendererOptions"
        size="sm"
        @update:modelValue="emit('update:rendererMode', $event as TerminalRendererMode)"
      />
      <UiSelect
        :model-value="layoutMode"
        :options="layoutOptions"
        size="sm"
        @update:modelValue="emit('update:layoutMode', $event as TerminalLayoutMode)"
      />
      <UiSelect
        :model-value="selectedConnectionLayoutId"
        :options="connectionLayoutOptions"
        size="sm"
        @update:modelValue="handleConnectionLayoutSelect"
      />
      <UiIconButton
        class="toolbar-action-btn"
        size="sm"
        variant="ghost"
        :disabled="!selectedConnectionLayoutId"
        title="删除选中的连接布局"
        @click="emit('deleteConnectionLayout', selectedConnectionLayoutId)"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </UiIconButton>
      <UiIconButton
        class="toolbar-action-btn"
        size="sm"
        variant="ghost"
        :disabled="!activeSession"
        title="保存当前连接布局"
        @click="emit('saveConnectionLayout')"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <path d="M17 21v-8H7v8" />
          <path d="M7 3v5h8" />
        </svg>
      </UiIconButton>

      <!-- Full mode keeps all commands as icon buttons; text is exposed through title/aria-label. -->
      <template v-if="actionMode === 'full'">
        <UiIconButton
          v-for="action in visibleActions"
          :key="action.id"
          class="toolbar-action-btn"
          size="sm"
          variant="ghost"
          type="button"
          :active="action.active?.()"
          :class="{ 'toolbar-action-btn--active': action.active?.() }"
          :disabled="action.disabled()"
          :title="action.label"
          @click="handleAction(action)"
        >
          <!-- SVG icon -->
          <svg v-if="action.icon === 'background'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          </svg>
          <svg v-else-if="action.icon === 'portForward'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
          </svg>
          <svg v-else-if="action.icon === 'fileManager'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M3 10h18" />
          </svg>
          <svg v-else-if="action.icon === 'resetLayoutSize'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 3v6h6" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
          <svg v-else-if="action.icon === 'search'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <svg v-else-if="action.icon === 'detach'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <svg v-else-if="action.icon === 'clear'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <svg v-else-if="action.icon === 'kill'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </UiIconButton>
      </template>

      <!-- Icon mode: icon-only buttons -->
      <template v-else-if="actionMode === 'icon'">
        <UiIconButton
          v-for="action in visibleActions"
          :key="action.id"
          class="icon-action-btn"
          size="sm"
          variant="ghost"
          type="button"
          :active="action.active?.()"
          :class="{ 'icon-action-btn--active': action.active?.() }"
          :disabled="action.disabled()"
          :title="action.label"
          @click="handleAction(action)"
        >
          <svg v-if="action.icon === 'background'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          </svg>
          <svg v-else-if="action.icon === 'portForward'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
          </svg>
          <svg v-else-if="action.icon === 'fileManager'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M3 10h18" />
          </svg>
          <svg v-else-if="action.icon === 'resetLayoutSize'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 3v6h6" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
          <svg v-else-if="action.icon === 'search'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <svg v-else-if="action.icon === 'detach'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <svg v-else-if="action.icon === 'clear'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <svg v-else-if="action.icon === 'kill'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </UiIconButton>
      </template>

      <!-- Collapsed mode: overflow menu trigger -->
      <div v-else class="toolbar-overflow-wrapper">
        <UiIconButton class="icon-action-btn toolbar-overflow-trigger" size="sm" variant="ghost" title="更多操作">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
          </svg>
        </UiIconButton>
        <div class="toolbar-overflow-menu">
          <UiButton
            v-for="action in visibleActions"
            :key="action.id"
            class="toolbar-overflow-item"
            size="sm"
            variant="ghost"
            type="button"
            :active="action.active?.()"
            :class="{ 'toolbar-overflow-item--active': action.active?.() }"
            :disabled="action.disabled()"
            @click="handleAction(action)"
          >
            <svg v-if="action.icon === 'background'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            <svg v-else-if="action.icon === 'portForward'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
            </svg>
            <svg v-else-if="action.icon === 'fileManager'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M3 10h18" />
            </svg>
            <svg v-else-if="action.icon === 'resetLayoutSize'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 3v6h6" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
            <svg v-else-if="action.icon === 'search'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <svg v-else-if="action.icon === 'detach'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <svg v-else-if="action.icon === 'clear'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <svg v-else-if="action.icon === 'kill'" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span class="toolbar-overflow-item__label">{{ action.label }}</span>
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.terminal-toolbar {
  --terminal-toolbar-action-bg: transparent;
  --terminal-toolbar-action-border: transparent;
  --terminal-toolbar-action-text: var(--ui-button-ghost-text);
  --terminal-toolbar-action-hover-bg: var(--ui-button-ghost-hover-bg);
  --terminal-toolbar-action-hover-border: transparent;
  --terminal-toolbar-action-hover-text: var(--ui-button-ghost-hover-text);
  --terminal-toolbar-action-active-bg: var(--ui-tabs-active-bg);
  --terminal-toolbar-action-active-border: var(--ui-border-accent-soft);
  --terminal-toolbar-action-active-text: var(--primary-color);
  --terminal-toolbar-action-disabled-text: var(--ui-text-subtle);
  --terminal-toolbar-overflow-bg: var(--ui-menu-bg);
  --terminal-toolbar-overflow-border: var(--ui-border-subtle);
  --terminal-toolbar-overflow-shadow: var(--ui-menu-shadow);

  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--ui-surface-panel) 88%, transparent);
  border-bottom: 1px solid var(--ui-border-subtle);
  min-height: 46px;
  box-sizing: border-box;
  backdrop-filter: blur(12px);
  position: relative;
  z-index: var(--ui-z-toolbar);
}

:global(.light) .terminal-toolbar {
  --terminal-toolbar-action-text: rgba(30, 70, 90, 0.7);
  --terminal-toolbar-action-hover-bg: rgba(102, 204, 255, 0.12);
  --terminal-toolbar-action-hover-text: rgba(30, 70, 90, 0.95);
  --terminal-toolbar-action-active-bg: rgba(102, 204, 255, 0.18);
  --terminal-toolbar-action-active-border: rgba(92, 157, 237, 0.28);
  --terminal-toolbar-action-active-text: #1d6fa5;
  --terminal-toolbar-overflow-bg: rgba(255, 255, 255, 0.98);
  --terminal-toolbar-overflow-border: rgba(15, 23, 42, 0.08);
  --terminal-toolbar-overflow-shadow: 0 12px 32px rgba(9, 38, 64, 0.14);
}

:global(.dark) .terminal-toolbar {
  --terminal-toolbar-action-text: rgba(220, 240, 255, 0.72);
  --terminal-toolbar-action-hover-bg: rgba(102, 204, 255, 0.16);
  --terminal-toolbar-action-hover-text: rgba(240, 250, 255, 0.96);
  --terminal-toolbar-action-active-bg: rgba(102, 204, 255, 0.2);
  --terminal-toolbar-action-active-border: rgba(102, 204, 255, 0.28);
  --terminal-toolbar-action-active-text: #8edcff;
  --terminal-toolbar-overflow-bg: rgba(20, 35, 45, 0.98);
  --terminal-toolbar-overflow-border: rgba(255, 255, 255, 0.08);
  --terminal-toolbar-overflow-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
}

.terminal-toolbar__left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
}

.terminal-toolbar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--ui-text-secondary);

  .title-name {
    display: inline-block;
    max-width: min(320px, 32vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ui-text-primary);
    font-weight: 500;
    vertical-align: bottom;
  }

  .title-name--editable {
    cursor: text;
    border-radius: 4px;
    padding: 1px 4px;
    margin: -1px -4px;
    transition: background 0.15s;

    &:hover {
      background: var(--ui-button-ghost-hover-bg);
    }
  }

  .title-name-input.ui-input {
    font-size: 13px;
    font-weight: 500;
    color: var(--ui-text-primary);
    background: var(--ui-input-bg);
    border: 1px solid var(--ui-input-focus-border, var(--primary-color));
    border-radius: 4px;
    padding: 1px 4px;
    width: min(220px, 32vw);
    min-width: 80px;
    min-height: 24px;
    font-family: inherit;
  }

  .title-divider {
    color: var(--ui-text-subtle);
  }
}

.terminal-toolbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  :deep(.ui-select) {
    min-height: 30px;
  }
}

// ── Full mode: icon + text button ─────────────────────────────

.toolbar-action-btn.ui-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  width: 32px;
  min-height: 30px;
  height: 30px;
  padding: 0 8px;
  border-radius: 4px;
  background: var(--terminal-toolbar-action-bg);
  border: 1px solid var(--terminal-toolbar-action-border);
  color: var(--terminal-toolbar-action-text);
  transition: all 0.2s ease;
  white-space: nowrap;
  font-size: 12px;
  box-shadow: none;
  transform: none;

  &:hover:not(:disabled) {
    background: var(--terminal-toolbar-action-hover-bg);
    border-color: var(--terminal-toolbar-action-hover-border);
    color: var(--terminal-toolbar-action-hover-text);
    transform: none;
  }

  &:disabled {
    color: var(--terminal-toolbar-action-disabled-text);
    opacity: 0.52;
  }

  :deep(svg) {
    fill: none;
    stroke: currentColor;
  }
}

.toolbar-action-btn--active.ui-icon-button {
  background: var(--terminal-toolbar-action-active-bg);
  color: var(--terminal-toolbar-action-active-text);
  border-color: var(--terminal-toolbar-action-active-border);
}

// ── Icon-only mode ────────────────────────────────────────────

.icon-action-btn.ui-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-height: 30px;
  height: 30px;
  padding: 0 8px;
  border-radius: 4px;
  background: var(--terminal-toolbar-action-bg);
  border: 1px solid var(--terminal-toolbar-action-border);
  color: var(--terminal-toolbar-action-text);
  transition: all 0.2s ease;
  box-shadow: none;
  transform: none;

  &:hover:not(:disabled) {
    background: var(--terminal-toolbar-action-hover-bg);
    border-color: var(--terminal-toolbar-action-hover-border);
    color: var(--terminal-toolbar-action-hover-text);
    transform: none;
  }

  &:disabled {
    color: var(--terminal-toolbar-action-disabled-text);
    opacity: 0.52;
  }

  :deep(svg) {
    fill: none;
    stroke: currentColor;
  }

  :deep(circle[fill="currentColor"]) {
    fill: currentColor;
    stroke: none;
  }
}

.icon-action-btn--active.ui-icon-button {
  background: var(--terminal-toolbar-action-active-bg);
  color: var(--terminal-toolbar-action-active-text);
  border-color: var(--terminal-toolbar-action-active-border);
}

// ── Collapsed mode: overflow menu ─────────────────────────────

.toolbar-overflow-wrapper {
  position: relative;

  &:hover .toolbar-overflow-menu,
  &:focus-within .toolbar-overflow-menu {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    pointer-events: auto;
  }
}

.toolbar-overflow-trigger {
  // Inherits from .icon-action-btn
}

.toolbar-overflow-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--ui-z-docked);
  min-width: 160px;
  padding: 6px;
  border-radius: var(--ui-radius-lg, 10px);
  background: var(--terminal-toolbar-overflow-bg);
  border: 1px solid var(--terminal-toolbar-overflow-border);
  box-shadow: var(--terminal-toolbar-overflow-shadow);
  backdrop-filter: blur(12px);

  // Hidden by default
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
}

.toolbar-overflow-item.ui-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 0;
  padding: 7px 10px;
  border: none;
  border-radius: var(--ui-radius-md, 6px);
  background: transparent;
  color: var(--terminal-toolbar-action-text);
  transition: all 0.15s ease;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: none;
  transform: none;

  &:hover:not(:disabled) {
    background: var(--terminal-toolbar-action-hover-bg);
    color: var(--terminal-toolbar-action-hover-text);
    transform: none;
  }

  &:disabled {
    color: var(--terminal-toolbar-action-disabled-text);
    opacity: 0.52;
  }

  :deep(.ui-button__label) {
    display: inline-flex;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
  }


  :deep(svg) {
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
  }

  .toolbar-overflow-item__label {
    line-height: 1;
  }
}

.toolbar-overflow-item--active.ui-button {
  background: var(--terminal-toolbar-action-active-bg);
  color: var(--terminal-toolbar-action-active-text);
}
</style>
