<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDetachedTerminalStore } from './detached_terminal_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import type { DetachedTerminalSessionKind, TerminalRendererMode } from '@/contracts/terminal';
import TerminalViewport from '@/windows/main/pages/Terminal/TerminalViewport.vue';
import TerminalSearchPanel from '@/windows/main/pages/Terminal/TerminalSearchPanel.vue';
import DetachedTerminalToolbar from './DetachedTerminalToolbar.vue';

/**
 * Root component for the detached (independent) terminal window.
 *
 * This component is the ONLY page-level component used in detached windows.
 * It does NOT import TerminalPage.vue or any main-window page-level components.
 * It reuses only atomic/pure components: TerminalViewport, TerminalSearchPanel.
 */

const props = defineProps<{
  sessionId: string;
  target: string;
  initialLabel?: string;
  sessionKind?: DetachedTerminalSessionKind;
}>();

const store = useDetachedTerminalStore();
const appConfigStore = useAppConfigStore();

const viewportRef = ref<InstanceType<typeof TerminalViewport> | null>(null);
const searchPanelRef = ref<InstanceType<typeof TerminalSearchPanel> | null>(null);
const searchVisible = ref(false);
const searchQuery = ref('');
const searchResultIndex = ref(-1);
const searchResultCount = ref(0);

// ── App config derived values ─────────────────────────────────
const rendererMode = computed(() => appConfigStore.config.features.terminal.rendererMode);
const enableSixel = computed(() => appConfigStore.config.features.terminal.enableSixel);
const colorSchemeId = computed(() => appConfigStore.config.features.terminal.colorSchemeId ?? 'dark-default');
const writeHandler = computed(() => (store.sessionKind === 'ssh' ? store.write : undefined));
const resizeHandler = computed(() => (store.sessionKind === 'ssh' ? store.resize : undefined));

// Background config (read-only in detached window)
const termBgType = computed(() => appConfigStore.config.features.terminal.viewportBgType ?? 'color');
const termBgColor = computed(() => appConfigStore.config.features.terminal.viewportBgColor ?? '');
const termBgImage = computed(() => appConfigStore.config.features.terminal.viewportBgImage ?? '');
const termBgVideo = computed(() => appConfigStore.config.features.terminal.viewportBgVideo ?? '');
const termBgStyle = computed(() => appConfigStore.config.features.terminal.viewportBgStyle ?? {});

const hasCustomBg = computed(() => {
  if (termBgType.value === 'image' && termBgImage.value) return true;
  if (termBgType.value === 'video' && termBgVideo.value) return true;
  if (termBgType.value === 'color' && termBgColor.value) return true;
  return false;
});

// ── Window title display ──────────────────────────────────────
const windowTitle = computed(() => {
  const label = store.profileLabel || 'Terminal';
  const statusText = store.isRunning ? (store.sessionKind === 'ssh' ? 'Connected' : 'Running') : 'Stopped';
  return `${label} — ${statusText}`;
});

// ── Window controls ───────────────────────────────────────────
const { ipcRenderer } = window;

function minimizeWindow() {
  ipcRenderer?.send('window:minimize');
}

function maximizeWindow() {
  ipcRenderer?.send('window:maximize');
}

function closeWindow() {
  ipcRenderer?.send('window:close');
}

// ── Terminal actions ──────────────────────────────────────────

async function returnToMainWindow() {
  await window.terminalApi.returnDetachedToMain(
    props.sessionId,
    props.target,
    props.sessionKind ?? 'local',
  );
}

function clearTerminal() {
  store.clearBuffer();
  viewportRef.value?.clear();
}

async function killSession() {
  await store.kill();
}

function findNext() {
  viewportRef.value?.findNext(searchQuery.value);
}

function findPrevious() {
  viewportRef.value?.findPrevious(searchQuery.value);
}

function resetSearchResults() {
  searchResultIndex.value = -1;
  searchResultCount.value = 0;
}

function handleSearchResults(value: { resultIndex: number; resultCount: number }) {
  searchResultIndex.value = value.resultIndex;
  searchResultCount.value = value.resultCount;
}

function updateSearchQuery(value: string) {
  searchQuery.value = value;
  if (!value.trim()) {
    resetSearchResults();
    viewportRef.value?.clearSearchResults();
    return;
  }

  viewportRef.value?.findNext(value, true);
}

async function toggleSearchPanel() {
  if (searchVisible.value) {
    closeSearchPanel();
    return;
  }

  searchVisible.value = true;
  await nextTick();
  await searchPanelRef.value?.focusInput();
  if (searchQuery.value.trim()) {
    viewportRef.value?.findNext(searchQuery.value, true);
  }
}

function closeSearchPanel() {
  searchVisible.value = false;
  resetSearchResults();
  viewportRef.value?.clearSearchResults();
}

async function updateRendererMode(mode: TerminalRendererMode) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        rendererMode: mode,
      },
    },
  });
}

async function updateColorScheme(schemeId: string) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        colorSchemeId: schemeId,
      },
    },
  });
}

function handleRendererFallback(nextMode: Exclude<TerminalRendererMode, 'webgl'>) {
  if (rendererMode.value === 'webgl') {
    void updateRendererMode(nextMode);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────
onMounted(async () => {
  await store.initialize(props.sessionId, props.target, props.initialLabel, props.sessionKind ?? 'local');
});

onBeforeUnmount(() => {
  store.dispose();
});
</script>

<template>
  <div class="detached-shell">
    <!-- Custom frameless title bar -->
    <div class="detached-titlebar">
      <div class="detached-titlebar__icon">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </div>
      <div class="detached-titlebar__title">{{ windowTitle }}</div>
      <div class="detached-titlebar__status">
        <span
          class="status-indicator"
          :class="store.isRunning ? 'status-indicator--running' : 'status-indicator--stopped'"
        />
      </div>
      <div class="detached-titlebar__drag" />
      <div class="detached-titlebar__actions">
        <button class="detached-titlebar__btn" title="返回主窗口" @click="returnToMainWindow">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14l-4-4 4-4" />
            <path d="M5 10h11a4 4 0 0 1 0 8h-1" />
            <rect x="14" y="4" width="7" height="5" rx="1" />
          </svg>
        </button>
        <button class="detached-titlebar__btn" title="最小化" @click="minimizeWindow">
          <svg width="10" height="1" viewBox="0 0 10 1">
            <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1"/>
          </svg>
        </button>
        <button class="detached-titlebar__btn" title="最大化" @click="maximizeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1"/>
          </svg>
        </button>
        <button class="detached-titlebar__btn detached-titlebar__btn--close" title="关闭" @click="closeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Simplified toolbar -->
    <DetachedTerminalToolbar
      :renderer-mode="rendererMode"
      :color-scheme-id="colorSchemeId"
      :session-running="store.isRunning"
      @update:colorSchemeId="updateColorScheme"
      @update:rendererMode="updateRendererMode"
      @search="toggleSearchPanel"
      @clear="clearTerminal"
      @kill="killSession"
    />

    <!-- Search panel -->
    <TerminalSearchPanel
      v-if="searchVisible"
      ref="searchPanelRef"
      :query="searchQuery"
      :result-index="searchResultIndex"
      :result-count="searchResultCount"
      @update:query="updateSearchQuery"
      @next="findNext"
      @previous="findPrevious"
      @close="closeSearchPanel"
    />

    <!-- Terminal viewport -->
    <div v-if="store.sessionId" class="detached-stage">
      <TerminalViewport
        :key="`${store.sessionId}:${rendererMode}:${enableSixel}:${hasCustomBg}`"
        ref="viewportRef"
        :session-id="store.sessionId"
        :buffer="store.buffer"
        :renderer-mode="rendererMode"
        :enable-sixel="enableSixel"
        :color-scheme-id="colorSchemeId"
        :bg-type="termBgType"
        :bg-color="termBgColor"
        :bg-image="termBgImage"
        :bg-video="termBgVideo"
        :bg-style="termBgStyle"
        :copy-shortcut="appConfigStore.config.shortcuts.internal.terminalCopy"
        :paste-shortcut="appConfigStore.config.shortcuts.internal.terminalPaste"
        :write-handler="writeHandler"
        :resize-handler="resizeHandler"
        @renderer-fallback="handleRendererFallback"
        @search-results="handleSearchResults"
      />
    </div>

    <!-- Empty state (session not found or exited) -->
    <div v-else class="detached-empty">
      <div class="detached-empty__title">会话不可用</div>
      <div class="detached-empty__desc">
        终端会话已结束或未找到。请关闭此窗口。
      </div>
    </div>

    <!-- Status bar -->
    <div class="detached-statusbar">
      <div class="detached-statusbar__left">
        <span class="detached-statusbar__label">Detached</span>
      </div>
      <div class="detached-statusbar__right">
        <span>{{ store.sessionKind === 'ssh' ? 'SSH' : 'Local' }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
/* Import UI primitives and theme variables for reused main-window components. */
@use '@/windows/main/assets/foundation.scss';
@use '@/windows/main/assets/theme.scss';

/* ── Global resets for detached terminal window ──────────────── */
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#guyan-tools-terminal-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>

<style lang="scss" scoped>
.detached-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-bg-muted);
}

/* ── Title bar ─────────────────────────────────────────────── */

.detached-titlebar {
  display: flex;
  align-items: center;
  height: 36px;
  flex-shrink: 0;
  background: var(--ui-surface-elevated, var(--background-color));
  border-bottom: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
  -webkit-app-region: drag;
  user-select: none;
}

.detached-titlebar__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  color: var(--primary-color, #6366f1);
  flex-shrink: 0;
}

.detached-titlebar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.detached-titlebar__status {
  display: flex;
  align-items: center;
  padding: 0 8px;
  flex-shrink: 0;
}

.status-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &--running {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
  }

  &--stopped {
    background: var(--ui-text-subtle, #6b7280);
  }
}

.detached-titlebar__drag {
  flex: 1;
  height: 100%;
}

.detached-titlebar__actions {
  display: flex;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.detached-titlebar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: rgba(128, 128, 128, 0.12);
  }

  &--close:hover {
    background: #e81123;
    color: #fff;
  }
}

/* ── Terminal stage ────────────────────────────────────────── */

.detached-stage {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

/* ── Empty state ───────────────────────────────────────────── */

.detached-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.detached-empty__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text-primary);
}

.detached-empty__desc {
  max-width: 360px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

/* ── Status bar ────────────────────────────────────────────── */

.detached-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  background: var(--ui-surface-panel-muted);
  border-top: 1px solid var(--ui-border-subtle);
  font-size: 11px;
  color: var(--ui-text-muted);
  flex-shrink: 0;
}

.detached-statusbar__left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.detached-statusbar__label {
  font-family: Consolas, 'Cascadia Mono', monospace;
}

.detached-statusbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
