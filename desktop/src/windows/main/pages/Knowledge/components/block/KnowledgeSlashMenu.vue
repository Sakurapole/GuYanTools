<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import type { KnowledgeBlockV2Type } from '@/windows/main/utils/knowledge_blocks_v2';

type SlashMenuOption = {
  id?: string;
  type: KnowledgeBlockV2Type;
  icon: string;
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  group?: string;
  attrs?: Record<string, unknown>;
};

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  query: string;
  prefix?: '/' | '+';
  options: SlashMenuOption[];
}>();

const emit = defineEmits<{
  (event: 'select', type: KnowledgeBlockV2Type, attrs?: Record<string, unknown>): void;
  (event: 'close'): void;
}>();

const menuRef = ref<HTMLElement | null>(null);
const activeIndex = ref(0);
const suggestedCommands = [
  'paragraph',
  'heading_1',
  'bullet_list',
  'task_list',
  'toggle',
  'code',
];
const suggestedCommandSet = new Set<string>(suggestedCommands);

function optionCommandKey(option: SlashMenuOption) {
  return option.id ?? option.type;
}

const menuStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));

const filteredOptions = computed(() => {
  const query = props.query.trim().toLowerCase();
  const options = query ? props.options.filter((option) => [
    option.type,
    option.label,
    ...(option.keywords ?? []),
  ].some((value) => value.toLowerCase().includes(query))) : props.options;

  if (query) return options;

  const suggestedOptions = suggestedCommands
    .map((command) => options.find((option) => optionCommandKey(option) === command))
    .filter((option): option is SlashMenuOption => Boolean(option))
    .map((option) => ({ ...option, group: '建议' }));
  const otherOptions = options.filter((option) => !suggestedCommandSet.has(optionCommandKey(option)));
  return [...suggestedOptions, ...otherOptions];
});

const groupedOptions = computed(() => filteredOptions.value.map((option, index) => ({
  ...option,
  index,
  itemId: `knowledge-slash-menu-item-${index}`,
  optionKey: option.id ?? `${option.type}-${index}`,
  showGroup: index === 0 || option.group !== filteredOptions.value[index - 1]?.group,
  groupLabel: option.group || '基础',
})));

const activeDescendant = computed(() => filteredOptions.value.length
  ? `knowledge-slash-menu-item-${activeIndex.value}`
  : undefined);

const displayPrefix = computed(() => props.prefix ?? '/');
const displayQuery = computed(() => (props.query.trim() ? `${displayPrefix.value}${props.query.trim()}` : displayPrefix.value));

watch(
  () => [props.open, props.query, filteredOptions.value.length] as const,
  () => {
    activeIndex.value = 0;
  },
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleGlobalKeydown, true);
      window.addEventListener('pointerdown', handleGlobalPointerdown, true);
      return;
    }
    window.removeEventListener('keydown', handleGlobalKeydown, true);
    window.removeEventListener('pointerdown', handleGlobalPointerdown, true);
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true);
  window.removeEventListener('pointerdown', handleGlobalPointerdown, true);
});

function selectOption(option = filteredOptions.value[activeIndex.value]) {
  if (!option) return;
  emit('select', option.type, option.attrs);
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    activeIndex.value = filteredOptions.value.length
      ? (activeIndex.value + 1) % filteredOptions.value.length
      : 0;
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    activeIndex.value = filteredOptions.value.length
      ? (activeIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length
      : 0;
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    activeIndex.value = 0;
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    activeIndex.value = Math.max(0, filteredOptions.value.length - 1);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    selectOption();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.target instanceof Node && menuRef.value?.contains(event.target)) return;
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'].includes(event.key)) return;
  handleKeydown(event);
}

function handleGlobalPointerdown(event: PointerEvent) {
  if (!props.open) return;
  if (event.target instanceof Node && menuRef.value?.contains(event.target)) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="knowledge-slash-menu"
      :style="menuStyle"
      role="menu"
      tabindex="-1"
      :aria-activedescendant="activeDescendant"
      @keydown="handleKeydown"
    >
      <div class="knowledge-slash-menu__body">
        <UiScrollbar :x="false" :y="true" :size="8">
          <div class="knowledge-slash-menu__list">
            <template v-for="option in groupedOptions" :key="option.optionKey">
              <div v-if="option.showGroup" class="knowledge-slash-menu__section-label">{{ option.groupLabel }}</div>
              <button
                :id="option.itemId"
                class="knowledge-slash-menu__item"
                type="button"
                role="menuitem"
                :class="{ 'knowledge-slash-menu__item--active': option.index === activeIndex }"
                @mouseenter="activeIndex = option.index"
                @click="selectOption(option)"
              >
                <span class="knowledge-slash-menu__icon-card">
                  <IconRenderer :icon="option.icon" :size="16" />
                </span>
                <span class="knowledge-slash-menu__item-copy">
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.description || option.type }}</small>
                </span>
                <kbd v-if="option.shortcut" class="knowledge-slash-menu__shortcut">{{ option.shortcut }}</kbd>
              </button>
            </template>
            <div v-if="!filteredOptions.length" class="knowledge-slash-menu__empty">没有匹配块</div>
          </div>
        </UiScrollbar>
      </div>

      <div class="knowledge-slash-menu__footer" aria-hidden="true">
        <span>{{ displayQuery || displayPrefix }}输入以搜索</span>
        <span>关闭菜单 <kbd>esc</kbd></span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.knowledge-slash-menu {
  position: fixed;
  z-index: 4200;
  display: grid;
  gap: 0;
  width: min(324px, calc(100vw - 24px));
  max-height: min(482px, calc(100vh - 24px));
  overflow: hidden;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--ui-surface-panel) 98%, #fff);
  box-shadow:
    0 12px 28px rgb(15 23 42 / 13%),
    0 1px 2px rgb(15 23 42 / 10%);
}

.knowledge-slash-menu__footer {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-slash-menu__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.knowledge-slash-menu__body {
  height: min(424px, calc(100vh - 66px));
  min-height: 0;
}

.knowledge-slash-menu__list {
  display: grid;
  gap: 0;
  padding: 6px 5px;
}

.knowledge-slash-menu__item {
  appearance: none;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 4px 8px;
  border: 0;
  border-radius: 5px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible,
  &--active {
    outline: none;
    background: color-mix(in srgb, var(--ui-text-primary) 8%, transparent);
  }
}

.knowledge-slash-menu__icon-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--ui-text-primary);
  background: transparent;
  box-shadow: none;
}

.knowledge-slash-menu__item-copy {
  display: grid;
  min-width: 0;
  line-height: 1.25;

  strong,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
    font-weight: 600;
  }

  small {
    margin-top: 0;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-slash-menu__shortcut {
  flex: 0 0 auto;
  min-width: 24px;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: color-mix(in srgb, var(--ui-text-muted) 78%, transparent);
  background: transparent;
  font-family: var(--ui-font-mono, 'Geist Mono Variable', monospace);
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.knowledge-slash-menu__section-label {
  padding: 8px 8px 4px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
  letter-spacing: 0;
}

.knowledge-slash-menu__empty {
  padding: 8px 10px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-slash-menu__footer {
  padding: 7px 10px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 58%, transparent);

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
}

.knowledge-slash-menu__footer kbd {
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, transparent);
  border-radius: 5px;
  color: var(--ui-text-secondary);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 62%, transparent);
  font-family: var(--ui-font-mono, 'Geist Mono Variable', monospace);
  font-size: 10px;
  font-weight: 650;
  text-align: center;
}
</style>
