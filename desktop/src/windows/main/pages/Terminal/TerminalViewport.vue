<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import type { ISearchOptions, ISearchResultChangeEvent } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { ImageAddon } from '@xterm/addon-image';
import type { TerminalRendererMode } from '@/contracts/terminal';
import type { BackgroundStyleConfig } from '@/contracts/background';
import { eventMatchesAccelerator } from '@/shared/shortcuts';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import { resolveScheme } from './terminal-themes';
import '@xterm/xterm/css/xterm.css';

const props = withDefaults(defineProps<{
  sessionId: string;
  buffer: string;
  rendererMode: TerminalRendererMode;
  enableBell: boolean;
  enableSixel: boolean;
  colorSchemeId: string;
  /** Viewport background type */
  bgType?: 'color' | 'image' | 'video';
  /** Color / gradient CSS value */
  bgColor?: string;
  /** Image data-URL or path */
  bgImage?: string;
  /** Video data-URL or path */
  bgVideo?: string;
  /** Background CSS style overrides */
  bgStyle?: BackgroundStyleConfig;
  /**
   * Optional custom write handler for the terminal's stdin.
   * When provided (e.g. for SSH sessions), this is called instead of
   * window.terminalApi.write() so the data is routed to the SSH channel.
   */
  writeHandler?: (data: string) => void | Promise<void>;
  /**
   * Optional custom resize handler.
   * When provided (e.g. for SSH sessions), this is called instead of
   * window.terminalApi.resizeSession().
   */
  resizeHandler?: (cols: number, rows: number) => void | Promise<void>;
  autoFocus?: boolean;
  copyShortcut?: string;
  pasteShortcut?: string;
}>(), {
  bgType: 'color',
  bgColor: '',
  bgImage: '',
  bgVideo: '',
  bgStyle: () => ({}),
  writeHandler: undefined,
  resizeHandler: undefined,
  autoFocus: true,
  copyShortcut: 'CommandOrControl+Shift+C',
  pasteShortcut: 'CommandOrControl+Shift+V',
});

const emit = defineEmits<{
  rendererFallback: [mode: Exclude<TerminalRendererMode, 'webgl'>];
  searchResults: [value: ISearchResultChangeEvent];
}>();

const hostRef = ref<HTMLElement | null>(null);
const { open: openContextMenu } = useContextMenu();
const hoveredViewportRow = ref<number | null>(null);
const hoveredLineText = ref('');
const hoveredSuggestion = ref('');
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let searchAddon: SearchAddon | null = null;
let searchResultsDisposable: { dispose: () => void } | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastRenderedBuffer = '';
let wasmDecoderAvailability: Promise<boolean> | null = null;
let renderQueue = Promise.resolve();
const TRANSPARENT_BG = 'rgba(0, 0, 0, 0)';
const COMMON_COMMANDS = [
  'cd',
  'clear',
  'code',
  'cargo',
  'git',
  'ls',
  'npm',
  'pnpm',
  'pwd',
  'python',
  'ssh',
  'uv',
];
const SEARCH_DECORATIONS: NonNullable<ISearchOptions['decorations']> = {
  matchBackground: '#334155',
  matchBorder: '#64748b',
  matchOverviewRuler: '#64748b',
  activeMatchBackground: '#f59e0b',
  activeMatchBorder: '#fbbf24',
  activeMatchColorOverviewRuler: '#f59e0b',
};

function hasParam(params: ReadonlyArray<number | number[]>, expected: number) {
  return params.some((param) => Array.isArray(param)
    ? param.includes(expected)
    : param === expected);
}

function isTerminalFocused() {
  if (!terminal) {
    return false;
  }

  const activeElement = document.activeElement;
  return activeElement === terminal.textarea
    || (!!terminal.element && terminal.element.contains(activeElement));
}

function isActiveTerminalInstance(value: Terminal) {
  return terminal === value;
}

async function canUseWasmDecoder() {
  if (wasmDecoderAvailability) {
    return wasmDecoderAvailability;
  }

  wasmDecoderAvailability = WebAssembly.compile(
    new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
  )
    .then(() => true)
    .catch((error) => {
      console.warn('[TerminalViewport] WebAssembly decoder disabled by current CSP, sixel will be skipped:', error);
      return false;
    });

  return wasmDecoderAvailability;
}

const activeScheme = computed(() => resolveScheme(props.colorSchemeId));

function resolveTerminalTheme() {
  const theme = { ...activeScheme.value.theme };
  const textColor = props.bgStyle?.textColor?.trim();
  if (textColor) {
    theme.foreground = textColor;
    theme.cursor = textColor;
    theme.selectionForeground = textColor;
  }
  return theme;
}

/** Whether a user-defined background is active */
const hasCustomBg = computed(() => {
  if (props.bgType === 'image' && props.bgImage) return true;
  if (props.bgType === 'video' && props.bgVideo) return true;
  if (props.bgType === 'color' && props.bgColor) return true;
  return false;
});

/** Show video background layer */
const showVideo = computed(() => props.bgType === 'video' && !!props.bgVideo);
const backgroundSize = computed(() => props.bgStyle?.backgroundSize || 'cover');
const backgroundPosition = computed(() => props.bgStyle?.backgroundPosition || 'center');
const backgroundRepeat = computed(() => props.bgStyle?.backgroundRepeat || 'no-repeat');

/**
 * Inline styles applied directly to .terminal-viewport.
 * Keep the container responsible only for the fallback scheme background.
 */
const viewportInlineStyle = computed(() => {
  const style: Record<string, string> = {};

  if (!hasCustomBg.value) {
    // Fallback: use the color scheme's viewport background
    style.backgroundColor = activeScheme.value.viewportBg;
  }

  return style;
});

/**
 * Background layer that sits behind xterm.
 * This avoids using opacity on the whole terminal container, which would also
 * fade the terminal text and cursor.
 */
const backgroundLayerStyle = computed(() => {
  if (!hasCustomBg.value || showVideo.value) {
    return {};
  }

  const style: Record<string, string> = {};

  if (props.bgType === 'color' && props.bgColor) {
    style.background = props.bgColor;
  } else if (props.bgType === 'image' && props.bgImage) {
    style.backgroundImage = `url(${props.bgImage})`;
    style.backgroundSize = backgroundSize.value;
    style.backgroundPosition = backgroundPosition.value;
    style.backgroundRepeat = backgroundRepeat.value;
  }

  const opacity = props.bgStyle?.opacity;
  if (typeof opacity === 'number' && opacity < 1) {
    style.opacity = String(opacity);
  }

  return style;
});

const backgroundMemoKey = computed(() => [
  props.bgType,
  props.bgColor,
  props.bgImage,
  props.bgVideo,
  backgroundSize.value,
  backgroundPosition.value,
  backgroundRepeat.value,
  String(props.bgStyle?.opacity ?? 1),
].join('::'));

function toObjectFit(backgroundSizeValue?: string): 'contain' | 'cover' | 'fill' | 'none' {
  switch (backgroundSizeValue) {
    case 'contain':
      return 'contain';
    case '100% 100%':
      return 'fill';
    case 'auto':
      return 'none';
    default:
      return 'cover';
  }
}

const backgroundVideoStyle = computed(() => {
  const style: Record<string, string> = {
    objectFit: toObjectFit(props.bgStyle?.backgroundSize),
    objectPosition: props.bgStyle?.backgroundPosition || 'center',
  };
  const opacity = props.bgStyle?.opacity;
  if (typeof opacity === 'number' && opacity < 1) {
    style.opacity = String(opacity);
  }
  return style;
});

async function createTerminal() {
  const nextTerminal = new Terminal({
    allowProposedApi: true,
    fontFamily: 'Consolas, "Cascadia Mono", "JetBrains Mono", monospace',
    fontSize: 14,
    cursorBlink: true,
    allowTransparency: true,
    bellStyle: props.enableBell ? 'sound' : 'none',
    scrollback: 5000,
    convertEol: false,
    theme: resolveTerminalTheme(),
  });
  terminal = nextTerminal;

  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();

  nextTerminal.loadAddon(fitAddon);
  nextTerminal.loadAddon(searchAddon);
  nextTerminal.loadAddon(new Unicode11Addon());
  searchResultsDisposable = searchAddon.onDidChangeResults((value) => {
    emit('searchResults', value);
  });

  nextTerminal.parser.registerCsiHandler({ final: 'n' }, (params) => {
    if (params[0] !== 6 || !isActiveTerminalInstance(nextTerminal)) {
      return false;
    }

    const row = nextTerminal.buffer.active.cursorY + 1;
    const col = nextTerminal.buffer.active.cursorX + 1;
    void writeToActiveSession(`\u001b[${row};${col}R`, 'respond to DSR request');
    return true;
  });

  nextTerminal.parser.registerCsiHandler({ prefix: '?', final: 'n' }, (params) => {
    if (params[0] !== 6 || !isActiveTerminalInstance(nextTerminal)) {
      return false;
    }

    const row = nextTerminal.buffer.active.cursorY + 1;
    const col = nextTerminal.buffer.active.cursorX + 1;
    void writeToActiveSession(`\u001b[?${row};${col}R`, 'respond to DEC DSR request');
    return true;
  });

  nextTerminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
    if (!hasParam(params, 1004)) {
      return false;
    }

    queueMicrotask(() => {
      if (!isTerminalFocused()) {
        return;
      }

      void writeToActiveSession('\u001b[I', 'report terminal focus state');
    });

    return false;
  });

  const canUseSixel = props.enableSixel && await canUseWasmDecoder();
  if (!isActiveTerminalInstance(nextTerminal)) {
    return;
  }

  if (canUseSixel) {
    try {
      nextTerminal.loadAddon(new ImageAddon({
        enableSizeReports: true,
        sixelSupport: true,
        sixelScrolling: true,
      }));
    } catch (error) {
      console.warn('[TerminalViewport] Failed to load image addon:', error);
    }
  }

  if (!isActiveTerminalInstance(nextTerminal)) {
    return;
  }

  // WebGL renderer does NOT support allowTransparency;
  // skip it when a custom background is active so the standard renderer is used.
  if (!hasCustomBg.value && (props.rendererMode === 'webgl' || props.rendererMode === 'auto')) {
    try {
      nextTerminal.loadAddon(new WebglAddon());
    } catch (error) {
      console.warn('[TerminalViewport] WebGL renderer unavailable, falling back:', error);
      emit('rendererFallback', 'standard');
    }
  }

  if (!isActiveTerminalInstance(nextTerminal)) {
    return;
  }

  nextTerminal.onData((data) => {
    void writeToActiveSession(data, 'write terminal input');
  });

  nextTerminal.onResize(({ cols, rows }) => {
    void sendResize(cols, rows);
  });
  nextTerminal.attachCustomKeyEventHandler(handleShortcutKey);
}

function getTerminalRowHeight() {
  const rowElement = hostRef.value?.querySelector('.xterm-rows > div');
  const rowHeight = rowElement?.getBoundingClientRect().height ?? 0;
  if (rowHeight > 0) {
    return rowHeight;
  }
  if (!terminal || !hostRef.value || terminal.rows <= 0) {
    return 0;
  }
  return hostRef.value.clientHeight / terminal.rows;
}

function getHoveredBufferLine() {
  if (!terminal || hoveredViewportRow.value === null) {
    return null;
  }
  return terminal.buffer.active.viewportY + hoveredViewportRow.value;
}

function readBufferLine(bufferLine: number) {
  if (!terminal) {
    return '';
  }
  return terminal.buffer.active.getLine(bufferLine)?.translateToString(true).trim() ?? '';
}

function buildCommandSuggestion(lineText: string, bufferLine: number) {
  if (!terminal || bufferLine !== terminal.buffer.active.baseY + terminal.buffer.active.cursorY) {
    return '';
  }

  const inputMatch = lineText.match(/(?:^|[>$#]\s+)([A-Za-z][\w.-]*)$/);
  const prefix = inputMatch?.[1]?.toLowerCase() ?? '';
  if (prefix.length < 1) {
    return '';
  }

  const suggestion = COMMON_COMMANDS.find((command) => command.startsWith(prefix) && command !== prefix);
  return suggestion ?? '';
}

function handleMouseMove(event: MouseEvent) {
  if (!terminal || !hostRef.value) {
    hoveredViewportRow.value = null;
    hoveredLineText.value = '';
    hoveredSuggestion.value = '';
    return;
  }

  const rowHeight = getTerminalRowHeight();
  if (rowHeight <= 0) {
    return;
  }

  const rect = hostRef.value.getBoundingClientRect();
  const nextRow = Math.max(0, Math.min(terminal.rows - 1, Math.floor((event.clientY - rect.top) / rowHeight)));
  hoveredViewportRow.value = nextRow;
  const bufferLine = getHoveredBufferLine();
  const lineText = bufferLine === null ? '' : readBufferLine(bufferLine);
  hoveredLineText.value = lineText;
  hoveredSuggestion.value = bufferLine === null ? '' : buildCommandSuggestion(lineText, bufferLine);
}

function clearHoveredLine() {
  hoveredViewportRow.value = null;
  hoveredLineText.value = '';
  hoveredSuggestion.value = '';
}

function selectHoveredLine() {
  const bufferLine = getHoveredBufferLine();
  if (!terminal || bufferLine === null) {
    return;
  }
  terminal.selectLines(bufferLine, bufferLine);
  terminal.focus();
}

function acceptSuggestion() {
  if (!hoveredSuggestion.value || !hoveredLineText.value) {
    return;
  }

  const inputMatch = hoveredLineText.value.match(/([A-Za-z][\w.-]*)$/);
  const prefix = inputMatch?.[1] ?? '';
  if (!prefix || !hoveredSuggestion.value.startsWith(prefix)) {
    return;
  }

  void writeInput(hoveredSuggestion.value.slice(prefix.length));
}

async function sendResize(cols?: number, rows?: number) {
  if (!terminal || !hostRef.value) return;
  const nextCols = cols ?? terminal.cols;
  const nextRows = rows ?? terminal.rows;
  try {
    if (props.resizeHandler) {
      await props.resizeHandler(nextCols, nextRows);
    } else {
      await window.terminalApi.resizeSession({
        sessionId: props.sessionId,
        cols: nextCols,
        rows: nextRows,
        pixelWidth: Math.max(1, Math.round(hostRef.value.clientWidth)),
        pixelHeight: Math.max(1, Math.round(hostRef.value.clientHeight)),
      });
    }
  } catch (error) {
    console.warn('[TerminalViewport] Failed to resize session:', error);
  }
}

async function writeToActiveSession(data: string, context: string) {
  if (!data) return;

  try {
    if (props.writeHandler) {
      await props.writeHandler(data);
    } else {
      await window.terminalApi.write(props.sessionId, data);
    }
  } catch (error) {
    console.warn(`[TerminalViewport] Failed to ${context}:`, error);
  }
}

async function writeInput(data: string) {
  if (!data) {
    return;
  }

  await writeToActiveSession(data, 'write terminal input');
}

async function copySelection() {
  const selection = terminal?.getSelection() ?? '';
  if (!selection) {
    terminal?.focus();
    return;
  }

  await window.terminalApi.writeClipboardText(selection);
  terminal?.focus();
}

async function pasteClipboard() {
  const text = await window.terminalApi.readClipboardText();
  if (!text) {
    terminal?.focus();
    return;
  }

  await writeInput(text);
  terminal?.focus();
}

function handleShortcutKey(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') {
    return true;
  }

  if (eventMatchesAccelerator(event, props.copyShortcut)) {
    event.preventDefault();
    void copySelection();
    return false;
  }

  if (eventMatchesAccelerator(event, props.pasteShortcut)) {
    event.preventDefault();
    void pasteClipboard();
    return false;
  }

  return true;
}

function enqueueTerminalWrite(data: string) {
  if (!terminal || !data) {
    return Promise.resolve();
  }

  renderQueue = renderQueue.then(() => new Promise<void>((resolve) => {
    terminal?.write(data, () => resolve());
  }));

  return renderQueue;
}

function renderBuffer(nextBuffer: string) {
  if (!terminal) return;

  if (!lastRenderedBuffer) {
    if (nextBuffer) {
      void enqueueTerminalWrite(nextBuffer);
    }
    lastRenderedBuffer = nextBuffer;
    return;
  }

  if (nextBuffer.startsWith(lastRenderedBuffer)) {
    const delta = nextBuffer.slice(lastRenderedBuffer.length);
    if (delta) {
      void enqueueTerminalWrite(delta);
    }
    lastRenderedBuffer = nextBuffer;
    return;
  }

  terminal.reset();
  lastRenderedBuffer = '';
  if (nextBuffer) {
    void enqueueTerminalWrite(nextBuffer);
  }
  lastRenderedBuffer = nextBuffer;
}

async function handleContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (!terminal) return;

  const selection = terminal.getSelection();
  const hasSelection = selection.length > 0;

  openContextMenu(event.clientX, event.clientY, [
    {
      id: 'terminal-copy',
      label: '复制',
      disabled: !hasSelection,
      action: () => {
        void copySelection();
      },
    },
    {
      id: 'terminal-paste',
      label: '粘贴',
      action: () => {
        void pasteClipboard();
      },
    },
  ]);
}

function fitTerminal() {
  if (!fitAddon) return;
  fitAddon.fit();
}

function refit() {
  fitTerminal();
  void sendResize();
}

function focus() {
  terminal?.focus();
}

function clear() {
  terminal?.clear();
  terminal?.reset();
  lastRenderedBuffer = '';
}

function clearSearchResults() {
  searchAddon?.clearDecorations();
  emit('searchResults', { resultIndex: -1, resultCount: 0 });
}

function findNext(query: string, incremental = false) {
  const term = query.trim();
  if (!term || !searchAddon) {
    clearSearchResults();
    return false;
  }

  return searchAddon.findNext(term, {
    decorations: SEARCH_DECORATIONS,
    incremental,
  });
}

function findPrevious(query: string) {
  const term = query.trim();
  if (!term || !searchAddon) {
    clearSearchResults();
    return false;
  }

  return searchAddon.findPrevious(term, {
    decorations: SEARCH_DECORATIONS,
  });
}

defineExpose({
  clearSearchResults,
  clear,
  focus,
  refit,
  findNext,
  findPrevious,
});

watch(() => props.buffer, (value) => {
  renderBuffer(value);
}, { flush: 'post' });

// Live-update xterm theme + viewport background when scheme changes
watch(() => [props.colorSchemeId, props.bgStyle?.textColor], () => {
  if (!terminal) return;
  terminal.options.theme = resolveTerminalTheme();
  terminal.refresh(0, terminal.rows - 1);
});

watch(() => props.enableBell, (value) => {
  if (!terminal) return;
  terminal.options.bellStyle = value ? 'sound' : 'none';
});

onMounted(async () => {
  await createTerminal();
  const mountedTerminal = terminal;
  if (!mountedTerminal || !hostRef.value) return;
  mountedTerminal.open(hostRef.value);
  if (props.autoFocus) {
    mountedTerminal.focus();
  }
  await nextTick();
  fitTerminal();
  renderBuffer(props.buffer);
  await sendResize();

  resizeObserver = new ResizeObserver(() => {
    fitTerminal();
    void sendResize();
  });
  resizeObserver.observe(hostRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  searchResultsDisposable?.dispose();
  searchResultsDisposable = null;
  renderQueue = Promise.resolve();
  terminal?.dispose();
  terminal = null;
});
</script>

<template>
  <div class="terminal-viewport" :class="{
    'terminal-viewport--no-grid': !activeScheme.showGrid || hasCustomBg,
    'terminal-viewport--custom-bg': hasCustomBg,
  }" :style="viewportInlineStyle" @mousemove="handleMouseMove" @mouseleave="clearHoveredLine" @contextmenu="handleContextMenu">
    <div
      v-if="hasCustomBg && !showVideo"
      v-memo="[backgroundMemoKey]"
      class="terminal-viewport__bg-layer"
      :style="backgroundLayerStyle"
    />

    <!-- Video background layer (only for video type) -->
    <video
      v-if="showVideo"
      v-memo="[backgroundMemoKey]"
      class="terminal-viewport__bg-video"
      :src="bgVideo"
      autoplay
      loop
      muted
      playsinline
      :style="backgroundVideoStyle"
    />

    <!-- xterm host -->
    <div ref="hostRef" class="terminal-viewport__host" />

    <div
      v-if="hoveredViewportRow !== null"
      class="terminal-viewport__row-highlight"
      :style="{ top: `${hoveredViewportRow * getTerminalRowHeight()}px`, height: `${getTerminalRowHeight()}px` }"
      aria-hidden="true"
    />

    <UiButton
      v-if="hoveredViewportRow !== null && hoveredLineText"
      class="terminal-viewport__line-action"
      size="sm"
      variant="ghost"
      type="button"
      title="选择此行"
      @click.stop="selectHoveredLine"
    >
      行
    </UiButton>

    <UiButton
      v-if="hoveredSuggestion"
      class="terminal-viewport__suggestion"
      size="sm"
      variant="ghost"
      type="button"
      :title="`补齐 ${hoveredSuggestion}`"
      @click.stop="acceptSuggestion"
    >
      Tab {{ hoveredSuggestion }}
    </UiButton>
  </div>
</template>

<style lang="scss" scoped>
.terminal-viewport {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  background-color: var(--term-bg-color, #0f1524);
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 32px 32px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  overflow: hidden;
  transition: background-color 0.3s ease;
  isolation: isolate;

  &--no-grid {
    background-image: none;
  }

  // xterm ships with black defaults in xterm.css; override them at the viewport
  // boundary so both scheme backgrounds and custom backgrounds can show through.
  :deep(.xterm) {
    background-color: transparent !important;
  }

  :deep(.xterm-viewport) {
    background-color: transparent !important;
  }

  :deep(.xterm-screen) {
    background-color: transparent !important;
  }

  :deep(.xterm-screen canvas) {
    background-color: transparent !important;
  }

  :deep(.xterm-helpers) {
    background-color: transparent !important;
  }

  :deep(.composition-view) {
    background: transparent !important;
    background-color: transparent !important;
  }
}

.terminal-viewport__bg-layer,
/* Video background (sits behind terminal) */
.terminal-viewport__bg-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  contain: paint;
}

/* Terminal host container */
.terminal-viewport__host {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;

  :deep(.xterm) {
    width: 100%;
    max-width: 100%;
    height: 100%;
  }

  :deep(.xterm-screen) {
    max-width: 100%;
  }

  :deep(.xterm-screen canvas) {
    max-width: 100%;
  }

  :deep(.xterm-viewport) {
    overflow-y: auto;
    overflow-x: hidden;
  }
}

.terminal-viewport__row-highlight {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  border-top: 1px solid rgba(102, 204, 255, 0.12);
  border-bottom: 1px solid rgba(102, 204, 255, 0.1);
  background: rgba(102, 204, 255, 0.08);
  pointer-events: none;
}

.terminal-viewport .terminal-viewport__line-action.ui-button,
.terminal-viewport .terminal-viewport__suggestion.ui-button {
  position: absolute;
  z-index: 3;
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding-top: 0;
  padding-bottom: 0;
  border: 1px solid rgba(102, 204, 255, 0.28);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.78);
  color: #d8f3ff;
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 11px;
  font-weight: 500;
  line-height: 22px;
  backdrop-filter: blur(12px);
  box-shadow: none;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
  transform: none;

  &:hover:not(:disabled) {
    transform: none;
  }

  :deep(.ui-button__label) {
    line-height: 22px;
  }
}

.terminal-viewport__line-action {
  top: 8px;
  right: 8px;
  padding: 0 8px;
}

.terminal-viewport__suggestion {
  right: 48px;
  bottom: 8px;
  padding: 0 10px;

  &:hover {
    border-color: rgba(102, 204, 255, 0.52);
    background: rgba(14, 116, 144, 0.72);
  }
}
</style>
