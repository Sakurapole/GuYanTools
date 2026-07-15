<script setup lang="ts">
import type { WorkspaceWindowKey } from '@/contracts/workspace_window';

const props = withDefaults(defineProps<{
  pageKey?: WorkspaceWindowKey;
}>(), {
  pageKey: 'knowledge',
});

const skeletonRows: Record<WorkspaceWindowKey, { side: number; main: number; aside: number }> = {
  terminal: { side: 6, main: 8, aside: 4 },
  ftp: { side: 7, main: 9, aside: 5 },
  todo: { side: 5, main: 8, aside: 3 },
  ai: { side: 5, main: 7, aside: 4 },
  knowledge: { side: 8, main: 10, aside: 6 },
  webview: { side: 4, main: 9, aside: 3 },
};

const layout = skeletonRows[props.pageKey] ?? skeletonRows.knowledge;
</script>

<template>
  <div class="workspace-skeleton" :class="`workspace-skeleton--${pageKey}`" aria-hidden="true">
    <div class="workspace-skeleton__sidebar">
      <div class="workspace-skeleton__line workspace-skeleton__line--title" />
      <div
        v-for="item in layout.side"
        :key="`side-${item}`"
        class="workspace-skeleton__line"
        :style="{ width: `${item % 3 === 0 ? 72 : item % 2 === 0 ? 84 : 58}%` }"
      />
    </div>
    <div class="workspace-skeleton__main">
      <div class="workspace-skeleton__toolbar">
        <div class="workspace-skeleton__chip" />
        <div class="workspace-skeleton__chip workspace-skeleton__chip--short" />
        <div class="workspace-skeleton__spacer" />
        <div class="workspace-skeleton__icon" />
        <div class="workspace-skeleton__icon" />
      </div>
      <div class="workspace-skeleton__canvas">
        <div
          v-for="item in layout.main"
          :key="`main-${item}`"
          class="workspace-skeleton__block"
          :style="{ width: `${item % 4 === 0 ? 64 : item % 3 === 0 ? 92 : 78}%` }"
        />
      </div>
    </div>
    <div class="workspace-skeleton__aside">
      <div class="workspace-skeleton__line workspace-skeleton__line--title" />
      <div
        v-for="item in layout.aside"
        :key="`aside-${item}`"
        class="workspace-skeleton__line"
        :style="{ width: `${item % 2 === 0 ? 88 : 66}%` }"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.workspace-skeleton {
  display: grid;
  grid-template-columns: minmax(180px, 22%) minmax(0, 1fr) minmax(180px, 23%);
  gap: 1px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--ui-border-subtle);
}

.workspace-skeleton__sidebar,
.workspace-skeleton__main,
.workspace-skeleton__aside {
  min-width: 0;
  min-height: 0;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--ui-surface-panel) 94%, transparent), color-mix(in srgb, var(--ui-surface-muted) 90%, transparent));
}

.workspace-skeleton__sidebar,
.workspace-skeleton__aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 16px;
}

.workspace-skeleton__main {
  display: flex;
  flex-direction: column;
}

.workspace-skeleton__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 48px;
  padding: 0 18px;
  border-bottom: 1px solid var(--ui-border-subtle);
}

.workspace-skeleton__spacer {
  flex: 1;
}

.workspace-skeleton__canvas {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
  padding: 26px clamp(24px, 5vw, 72px);
}

.workspace-skeleton__line,
.workspace-skeleton__chip,
.workspace-skeleton__icon,
.workspace-skeleton__block {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-text-muted) 18%, transparent);

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ui-surface-glass-strong) 52%, transparent), transparent);
    animation: workspace-skeleton-shimmer 1.25s ease-in-out infinite;
  }
}

.workspace-skeleton__line {
  height: 13px;
}

.workspace-skeleton__line--title {
  width: 46%;
  height: 18px;
  margin-bottom: 8px;
}

.workspace-skeleton__chip {
  width: 132px;
  height: 28px;
}

.workspace-skeleton__chip--short {
  width: 88px;
}

.workspace-skeleton__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.workspace-skeleton__block {
  height: 18px;
}

.workspace-skeleton--terminal .workspace-skeleton__canvas,
.workspace-skeleton--ftp .workspace-skeleton__canvas {
  padding-inline: 22px;
}

.workspace-skeleton--terminal .workspace-skeleton__block,
.workspace-skeleton--ftp .workspace-skeleton__block {
  height: 28px;
  border-radius: 8px;
}

@keyframes workspace-skeleton-shimmer {
  to {
    transform: translateX(100%);
  }
}

@media (max-width: 860px) {
  .workspace-skeleton {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-skeleton__sidebar,
  .workspace-skeleton__aside {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-skeleton__line,
  .workspace-skeleton__chip,
  .workspace-skeleton__icon,
  .workspace-skeleton__block {
    &::after {
      animation: none;
    }
  }
}
</style>
