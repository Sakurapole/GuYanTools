<script lang="ts" setup>
import { computed } from 'vue';
import type { GridItem } from '../../../types/grid';
import IconRenderer from '../../../components/ui/IconRenderer.vue';

const props = defineProps<{
  item: GridItem;
  interactive?: boolean;
}>();

const hasIcon = computed(() => Boolean(props.item.icon));
const isIconOnly = computed(() => props.item.colSpan === 1 && props.item.rowSpan === 1);
const isHorizontal = computed(() => props.item.colSpan > 1 && props.item.rowSpan === 1);
</script>

<template>
  <div class="shortcut-widget" :class="{
    'shortcut-widget--interactive': props.interactive !== false,
    'shortcut-widget--hero': props.item.colSpan >= 4 || props.item.rowSpan >= 3,
    'shortcut-widget--icon-only': isIconOnly,
    'shortcut-widget--horizontal': isHorizontal,
  }" :title="isIconOnly ? props.item.label : undefined">
    <div class="shortcut-widget__icon">
      <IconRenderer v-if="hasIcon" :icon="props.item.icon!" :size="isIconOnly || isHorizontal ? 20 : (props.item.colSpan >= 4 ? 32 : 24)" color="var(--widget-text-primary, white)" />
      <span v-else class="shortcut-widget__text-icon">{{ props.item.label.slice(0, 1) }}</span>
    </div>
    <div v-if="!isIconOnly" class="shortcut-widget__label" :title="props.item.label">{{ props.item.label }}</div>
  </div>
</template>

<style lang="scss" scoped>
.shortcut-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 16px 14px;
  box-sizing: border-box;
  color: var(--widget-text-primary, white);
  text-align: center;
  overflow: hidden;
  isolation: isolate;
  transition:
    gap 0.24s ease,
    transform 0.24s ease;
}

.shortcut-widget::before,
.shortcut-widget::after {
  content: '';
  position: absolute;
  inset: auto;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity 0.24s ease,
    transform 0.32s ease;
}

.shortcut-widget::before {
  top: -32%;
  left: -18%;
  width: 72%;
  height: 72%;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--widget-text-primary, white) 26%, transparent) 0%, transparent 70%);
  transform: translate3d(-8px, 10px, 0) scale(0.92);
  z-index: 0;
}

.shortcut-widget::after {
  top: 0;
  left: -140%;
  width: 90%;
  height: 100%;
  background: linear-gradient(115deg, transparent 0%, color-mix(in srgb, var(--widget-text-primary, white) 8%, transparent) 42%, color-mix(in srgb, var(--widget-text-primary, white) 24%, transparent) 50%, transparent 58%);
  transform: skewX(-20deg);
  z-index: 1;
}

.shortcut-widget__icon {
  position: relative;
  z-index: 2;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 16%, transparent);
  box-shadow: var(--ui-shadow-sm);
  transition:
    transform 0.24s ease,
    background 0.24s ease,
    border-color 0.24s ease,
    box-shadow 0.24s ease;
}

.shortcut-widget__text-icon {
  font-size: 20px;
  font-weight: 700;
}

.shortcut-widget__label {
  position: relative;
  z-index: 2;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition:
    transform 0.24s ease,
    text-shadow 0.24s ease,
    letter-spacing 0.24s ease;
}

.shortcut-widget--interactive:hover {
  gap: 14px;
}

.shortcut-widget--interactive:hover::before {
  opacity: 1;
  transform: translate3d(8px, -6px, 0) scale(1.08);
}

.shortcut-widget--interactive:hover::after {
  opacity: 1;
  transform: translateX(240%) skewX(-20deg);
}

.shortcut-widget--interactive:hover .shortcut-widget__icon {
  transform: translateY(-4px) scale(1.08);
  background: color-mix(in srgb, var(--widget-text-primary, white) 22%, transparent);
  border-color: color-mix(in srgb, var(--widget-text-primary, white) 30%, transparent);
  box-shadow:
    0 14px 28px rgba(15, 23, 42, 0.24),
    0 0 0 1px color-mix(in srgb, var(--widget-text-primary, white) 8%, transparent);
}

.shortcut-widget--interactive:hover .shortcut-widget__label {
  transform: translateY(-2px);
  letter-spacing: 0.02em;
  text-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
}

.shortcut-widget--hero .shortcut-widget__icon {
  width: 60px;
  height: 60px;
}

.shortcut-widget--hero .shortcut-widget__label {
  font-size: 18px;
}

/* ── 1×1 仅图标模式 ── */
.shortcut-widget--icon-only {
  padding: 8px;
  gap: 0;

  .shortcut-widget__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }

  .shortcut-widget__text-icon {
    font-size: 16px;
  }
}

/* ── 宽>1 高=1 横向排列模式 ── */
.shortcut-widget--horizontal {
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;

  .shortcut-widget__icon {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 10px;
  }

  .shortcut-widget__label {
    text-align: left;
    font-size: 13px;
    -webkit-line-clamp: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .shortcut-widget__text-icon {
    font-size: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shortcut-widget,
  .shortcut-widget::before,
  .shortcut-widget::after,
  .shortcut-widget__icon,
  .shortcut-widget__label {
    transition: none;
  }
}
</style>
