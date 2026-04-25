<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { ImageAddon } from '@xterm/addon-image';
import type { TerminalRendererMode } from '@/contracts/terminal';
import type { BackgroundStyleConfig } from '@/contracts/background';
import { eventMatchesAccelerator } from '@/shared/shortcuts';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { resolveScheme } from './terminal-themes';
import '@xterm/xterm/css/xterm.css';

const props = withDefaults(defineProps<{
  sessionId: string;
  buffer: string;
  rendererMode: TerminalRendererMode;
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
  copyShortcut: 'CommandOrControl+Shift+C',
  pasteShortcut: 'CommandOrControl+Shift+V',
});

const emit = defineEmits<{
  rendererFallback: [mode: Exclude<TerminalRendererMode, 'webgl'>];
}>();

const hostRef = ref<HTMLElement | null>(null);
const { open: openContextMenu } = useContextMenu();
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let searchAddon: SearchAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastRenderedBuffer = '';
let wasmDecoderAvailability: Promise<boolean> | null = null;
let renderQueue = Promise.resolve();
const TRANSPARENT_BG = 'rgba(0, 0, 0, 0)';

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

/** Whether a user-defined background is active */
const hasCustomBg = computed(() => {
  if (props.bgType === 'image' && props.bgImage) return true;
  if (props.bgType === 'video' && props.bgVideo) return true;
  if (props.bgType === 'color' && props.bgColor) return true;
  return false;
});

/** Show video background layer */
const showVideo = computed(() => props.bgType === 'video' && !!props.bgVideo);

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
    style.backgroundSize = props.bgStyle?.backgroundSize || 'cover';
    style.backgroundPosition = props.bgStyle?.backgroundPosition || 'center';
    style.backgroundRepeat = props.bgStyle?.backgroundRepeat || 'no-repeat';
  }

  const opacity = props.bgStyle?.opacity;
  if (typeof opacity === 'number' && opacity < 1) {
    style.opacity = String(opacity);
  }

  return style;
});

async function createTerminal() {
  const scheme = activeScheme.value;
  terminal = new Terminal({
    allowProposedApi: true,
    fontFamily: 'Consolas, "Cascadia Mono", "JetBrains Mono", monospace',
    fontSize: 14,
    cursorBlink: true,
    allowTransparency: true,
    scrollback: 5000,
    convertEol: false,
    theme: { ...scheme.theme },
  });

  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(new Unicode11Addon());

  terminal.parser.registerCsiHandler({ final: 'n' }, (params) => {
    if (params[0] !== 6 || !terminal) {
      return false;
    }

    const row = terminal.buffer.active.cursorY + 1;
    const col = terminal.buffer.active.cursorX + 1;
    void writeToActiveSession(`\u001b[${row};${col}R`, 'respond to DSR request');
    return true;
  });

  terminal.parser.registerCsiHandler({ prefix: '?', final: 'n' }, (params) => {
    if (params[0] !== 6 || !terminal) {
      return false;
    }

    const row = terminal.buffer.active.cursorY + 1;
    const col = terminal.buffer.active.cursorX + 1;
    void writeToActiveSession(`\u001b[?${row};${col}R`, 'respond to DEC DSR request');
    return true;
  });

  terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
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

  if (props.enableSixel && await canUseWasmDecoder()) {
    try {
      terminal.loadAddon(new ImageAddon({
        enableSizeReports: true,
        sixelSupport: true,
        sixelScrolling: true,
      }));
    } catch (error) {
      console.warn('[TerminalViewport] Failed to load image addon:', error);
    }
  }

  // WebGL renderer does NOT support allowTransparency;
  // skip it when a custom background is active so the standard renderer is used.
  if (!hasCustomBg.value && (props.rendererMode === 'webgl' || props.rendererMode === 'auto')) {
    try {
      terminal.loadAddon(new WebglAddon());
    } catch (error) {
      console.warn('[TerminalViewport] WebGL renderer unavailable, falling back:', error);
      emit('rendererFallback', 'standard');
    }
  }

  terminal.onData((data) => {
    void writeToActiveSession(data, 'write terminal input');
  });

  terminal.onResize(({ cols, rows }) => {
    void sendResize(cols, rows);
  });
  terminal.attachCustomKeyEventHandler(handleShortcutKey);
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

function clear() {
  terminal?.clear();
  terminal?.reset();
  lastRenderedBuffer = '';
}

function findNext(query: string) {
  if (!query.trim() || !searchAddon) return;
  searchAddon.findNext(query);
}

function findPrevious(query: string) {
  if (!query.trim() || !searchAddon) return;
  searchAddon.findPrevious(query);
}

defineExpose({
  clear,
  findNext,
  findPrevious,
});

watch(() => props.buffer, (value) => {
  renderBuffer(value);
}, { flush: 'post' });

// Live-update xterm theme + viewport background when scheme changes
watch(() => props.colorSchemeId, () => {
  if (!terminal) return;
  const scheme = activeScheme.value;
  terminal.options.theme = { ...scheme.theme };
  terminal.refresh(0, terminal.rows - 1);
});

onMounted(async () => {
  await createTerminal();
  if (!terminal || !hostRef.value) return;
  terminal.open(hostRef.value);
  terminal.focus();
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
  renderQueue = Promise.resolve();
  terminal?.dispose();
  terminal = null;
});
</script>

<template>
  <div class="terminal-viewport" :class="{
    'terminal-viewport--no-grid': !activeScheme.showGrid || hasCustomBg,
    'terminal-viewport--custom-bg': hasCustomBg,
  }" :style="viewportInlineStyle" @contextmenu="handleContextMenu">
    <div v-if="hasCustomBg && !showVideo" class="terminal-viewport__bg-layer" :style="backgroundLayerStyle" />

    <!-- Video background layer (only for video type) -->
    <video v-if="showVideo" class="terminal-viewport__bg-video" :src="bgVideo" autoplay loop muted playsinline
      :style="{ opacity: (bgStyle?.opacity ?? 1) < 1 ? String(bgStyle?.opacity) : undefined }" />

    <!-- xterm host -->
    <div ref="hostRef" class="terminal-viewport__host" />
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
</style>
