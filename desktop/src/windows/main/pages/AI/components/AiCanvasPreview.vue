<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AiCanvasFile, AiCanvasMode } from '@/contracts/ai';

const props = defineProps<{
  mode: AiCanvasMode;
  files: AiCanvasFile[];
  activePath?: string;
}>();

const runtimeError = ref('');

const filePathList = computed(() => props.files.map((file) => file.path));
const preferredPath = computed(() => preferredPathForMode(props.mode, filePathList.value));
const activeFile = computed(() =>
  props.files.find((file) => file.path === props.activePath)
  ?? props.files.find((file) => file.path === preferredPath.value)
  ?? props.files[0],
);
const srcdoc = computed(() => {
  if (props.mode === 'html') {
    return activeFile.value?.content || emptyHtml('HTML Canvas');
  }
  if (props.mode === 'react') {
    return buildReactPreview(activeFile.value?.content || defaultReactSource());
  }
  return buildMarkdownPreview(activeFile.value?.content || '');
});

function handleMessage(event: MessageEvent) {
  if (!event.data || typeof event.data !== 'object') {
    return;
  }
  const payload = event.data as { source?: string; type?: string; message?: string };
  if (payload.source !== 'guyantools-ai-canvas-preview') {
    return;
  }
  if (payload.type === 'error') {
    runtimeError.value = payload.message || 'Canvas preview failed';
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage);
});

function preferredPathForMode(mode: AiCanvasMode, paths: string[]) {
  if (mode === 'html') {
    return paths.includes('index.html') ? 'index.html' : paths.find((path) => path.endsWith('.html'));
  }
  if (mode === 'react') {
    return paths.includes('App.jsx') ? 'App.jsx' : paths.find((path) => path.endsWith('.jsx') || path.endsWith('.tsx'));
  }
  return paths.includes('README.md') ? 'README.md' : paths.find((path) => path.endsWith('.md'));
}

function buildMarkdownPreview(content: string) {
  return emptyHtml(`<pre>${escapeHtml(content)}</pre>`);
}

function buildReactPreview(source: string) {
  const componentSource = normalizeReactSource(source);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body, #root { min-height: 100%; margin: 0; }
      body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
    </style>
    <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.addEventListener('error', function(event) {
        parent.postMessage({ source: 'guyantools-ai-canvas-preview', type: 'error', message: event.message }, '*');
      });
    <\/script>
    <script type="text/babel" data-presets="env,react">
${escapeScript(componentSource)}

      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(<App />);
    <\/script>
  </body>
</html>`;
}

function normalizeReactSource(source: string) {
  let normalized = source
    .replace(/import\s+React(?:,\s*\{[^}]*\})?\s+from\s+['"]react['"];?/g, '')
    .replace(/import\s+\{[^}]*\}\s+from\s+['"]react['"];?/g, '')
    .replace(/export\s+default\s+function\s+App\s*\(/, 'function App(')
    .replace(/export\s+default\s+function\s+\w*\s*\(/, 'function App(')
    .replace(/export\s+default\s+App\s*;?/g, '')
    .replace(/export\s+default\s+/, 'const App = ');

  if (!/function\s+App\s*\(|const\s+App\s*=|let\s+App\s*=|var\s+App\s*=/.test(normalized)) {
    normalized = `function App() {\n  return (${normalized});\n}`;
  }
  return normalized;
}

function defaultReactSource() {
  return 'export default function App() {\n  return <h1>Canvas</h1>;\n}\n';
}

function emptyHtml(body: string) {
  return `<!doctype html><html><body>${body}</body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeScript(value: string) {
  return value.replace(/<\/script/gi, '<\\/script');
}
</script>

<template>
  <div class="ai-canvas-preview">
    <iframe
      class="ai-canvas-preview__frame"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      :srcdoc="srcdoc"
      @load="runtimeError = ''"
    />
    <div v-if="runtimeError" class="ai-canvas-preview__error">
      {{ runtimeError }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ai-canvas-preview {
  position: relative;
  display: flex;
  min-height: 0;
  height: 100%;
  background: #fff;
}

.ai-canvas-preview__frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.ai-canvas-preview__error {
  position: absolute;
  right: 10px;
  bottom: 10px;
  max-width: calc(100% - 20px);
  padding: 8px 10px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-danger-text);
  background: color-mix(in srgb, var(--ui-surface-base) 94%, rgba(220, 38, 38, 0.12));
  font-size: 0.75rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
</style>
