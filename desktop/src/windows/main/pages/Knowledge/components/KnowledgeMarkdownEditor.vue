<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { marked } from 'marked';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import MarkdownPreviewVirtualList from './markdown/MarkdownPreviewVirtualList.vue';
import { markdownWysiwygDecorations } from '../composables/useMarkdownWysiwygDecorations';
import { sanitizeKnowledgeMarkdownHtml } from '../utils/markdown_sanitize';

type EditorMode = 'edit' | 'split' | 'preview' | 'wysiwyg';
type MarkdownEditorTheme = 'system' | 'paper' | 'focus';

const props = defineProps<{
  modelValue: string;
  dirty?: boolean;
  saving?: boolean;
  pageSuggestions?: string[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'save'): void;
  (event: 'asset-file', payload: { file: File; kind: 'image' | 'attachment' }): void;
}>();

const editorHost = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const mode = ref<EditorMode>('split');
const markdownTheme = ref<MarkdownEditorTheme>('system');
const focusMode = ref(false);
const typewriterMode = ref(false);
const searchQuery = ref('');
const activeMatchIndex = ref(0);
const pageLinkOpen = ref(false);
const pageLinkQuery = ref('');
const frontmatterOpen = ref(false);
const frontmatterDraft = ref('');
const tableToolOpen = ref(false);
const tableRows = ref(3);
const tableColumns = ref(3);

const markdownThemeOptions = [
  { label: '系统', value: 'system' },
  { label: '纸张', value: 'paper' },
  { label: '专注', value: 'focus' },
];
const exportOpen = ref(false);

const markdownEditorBaseExtensions: Extension[] = [
  lineNumbers(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    indentWithTab,
  ]),
];

const headings = computed(() => {
  return props.modelValue
    .split(/\r?\n/)
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) return null;
      return {
        id: `heading-${index + 1}`,
        level: match[1].length,
        title: match[2].replace(/[#*_`~[\]()]/g, '').trim(),
        line: index + 1,
      };
    })
    .filter(Boolean) as Array<{ id: string; level: number; title: string; line: number }>;
});

const searchMatches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];

  const doc = props.modelValue.toLowerCase();
  const matches: number[] = [];
  let index = doc.indexOf(query);
  while (index >= 0) {
    matches.push(index);
    index = doc.indexOf(query, index + query.length);
  }
  return matches;
});

const stats = computed(() => {
  const text = props.modelValue;
  const characters = text.replace(/\s/g, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split(/\r?\n/).length : 0;
  return { characters, words, lines };
});

const filteredPageSuggestions = computed(() => {
  const query = pageLinkQuery.value.trim().toLowerCase();
  return [...new Set(props.pageSuggestions ?? [])]
    .filter((title) => !query || title.toLowerCase().includes(query))
    .slice(0, 8);
});

const frontmatter = computed(() => parseFrontmatter(props.modelValue));

const frontmatterProperties = computed(() => parseFrontmatterProperties(frontmatter.value.raw));

const previewSource = computed(() => frontmatter.value.body);

const previewHtml = computed(() => {
  const rendered = marked.parse(renderEnhancedMarkdown(previewSource.value || ''), {
    async: false,
    breaks: false,
    gfm: true,
  }) as string;
  return sanitizeKnowledgeMarkdownHtml(rendered);
});

const editorClassNames = computed(() => ({
  [`knowledge-markdown-editor--${mode.value}`]: true,
  [`knowledge-markdown-editor--theme-${markdownTheme.value}`]: true,
  'knowledge-markdown-editor--focus': focusMode.value,
  'knowledge-markdown-editor--typewriter': typewriterMode.value,
}));

function parseFrontmatter(value: string) {
  const normalized = value.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { raw: '', body: value, start: 0, end: 0 };
  }

  const end = normalized.indexOf('\n---', 4);
  if (end < 0) {
    return { raw: '', body: value, start: 0, end: 0 };
  }

  const closeEnd = normalized.indexOf('\n', end + 4);
  const blockEnd = closeEnd >= 0 ? closeEnd + 1 : normalized.length;
  return {
    raw: normalized.slice(4, end).trim(),
    body: normalized.slice(blockEnd),
    start: 0,
    end: blockEnd,
  };
}

function parseFrontmatterProperties(raw: string) {
  if (!raw.trim()) return [];
  return raw
    .split(/\n/)
    .map((line) => {
      const match = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
      if (!match) return null;
      return { key: match[1], value: match[2] || '空' };
    })
    .filter(Boolean) as Array<{ key: string; value: string }>;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEnhancedMarkdown(value: string) {
  let source = value;
  source = source.replace(/```mermaid\s*\r?\n([\s\S]*?)```/gi, (_match, body: string) => {
    const code = escapeHtml(body.trim());
    return `\n\n<div class="knowledge-md-mermaid"><div class="knowledge-md-mermaid__title">Mermaid</div><pre><code>${code}</code></pre></div>\n\n`;
  });
  source = source.replace(/(^|\n)\$\$\s*\n?([\s\S]*?)\n?\$\$(?=\n|$)/g, (_match, prefix: string, body: string) => {
    return `${prefix}<figure class="knowledge-md-math knowledge-md-math--block"><code>${escapeHtml(body.trim())}</code></figure>`;
  });
  source = source.replace(/(^|[\s([>])\$([^$\n]+?)\$(?=[$\s,.;:!?)]|$)/g, (_match, prefix: string, body: string) => {
    return `${prefix}<span class="knowledge-md-math knowledge-md-math--inline">${escapeHtml(body.trim())}</span>`;
  });
  return source;
}

function emitContent(value: string) {
  emit('update:modelValue', value);
}

function replaceSelection(before: string, after = before, fallback = '') {
  const view = editorView.value;
  if (!view) return false;

  const selection = view.state.selection.main;
  const selectedText = view.state.doc.sliceString(selection.from, selection.to) || fallback;
  const insert = `${before}${selectedText}${after}`;
  const anchor = selection.from + before.length;
  const head = anchor + selectedText.length;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor, head },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

function insertLink() {
  const view = editorView.value;
  if (!view) return false;

  const selection = view.state.selection.main;
  const selectedText = view.state.doc.sliceString(selection.from, selection.to) || '链接文本';
  const insert = `[${selectedText}](https://)`;
  const urlStart = selection.from + selectedText.length + 3;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: urlStart, head: urlStart + 8 },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

function selectMatch(direction: 1 | -1 | 0) {
  const view = editorView.value;
  const query = searchQuery.value.trim();
  const matches = searchMatches.value;
  if (!view || !query || matches.length === 0) return;

  activeMatchIndex.value = (activeMatchIndex.value + direction + matches.length) % matches.length;
  const from = matches[activeMatchIndex.value];
  view.dispatch({
    selection: { anchor: from, head: from + query.length },
    scrollIntoView: true,
  });
  view.focus();
}

function goToHeading(line: number) {
  const view = editorView.value;
  if (!view) return;

  const target = view.state.doc.line(line);
  view.dispatch({
    selection: { anchor: target.from },
    scrollIntoView: true,
  });
  view.focus();
}

function insertTextAtSelection(text: string) {
  const view = editorView.value;
  if (!view) return;

  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: text },
    selection: { anchor: selection.from + text.length },
    scrollIntoView: true,
  });
  view.focus();
}

function replaceDocumentText(value: string) {
  const view = editorView.value;
  if (view) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(value.length, view.state.selection.main.head) },
      scrollIntoView: true,
    });
    view.focus();
    return;
  }
  emitContent(value);
}

function openFrontmatterPanel() {
  frontmatterDraft.value = frontmatter.value.raw || 'title: \ntags: []\nsummary: ';
  frontmatterOpen.value = !frontmatterOpen.value;
}

function applyFrontmatter() {
  const raw = frontmatterDraft.value.trim();
  const current = frontmatter.value;
  const next = raw ? `---\n${raw}\n---\n${current.body.replace(/^\n+/, '')}` : current.body.replace(/^\n+/, '');
  replaceDocumentText(next);
  frontmatterOpen.value = false;
}

function removeFrontmatter() {
  replaceDocumentText(frontmatter.value.body.replace(/^\n+/, ''));
  frontmatterDraft.value = '';
  frontmatterOpen.value = false;
}

function buildMarkdownTable(rows: number, columns: number) {
  const safeRows = Math.max(1, Math.min(20, Math.round(rows)));
  const safeColumns = Math.max(1, Math.min(12, Math.round(columns)));
  const headers = Array.from({ length: safeColumns }, (_item, index) => `列 ${index + 1}`);
  const divider = Array.from({ length: safeColumns }, () => '---');
  const body = Array.from({ length: safeRows }, () => Array.from({ length: safeColumns }, () => ' ').join(' | '));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...body.map((row) => `| ${row} |`),
  ].join('\n');
}

function insertTable() {
  insertTextAtSelection(`\n${buildMarkdownTable(tableRows.value, tableColumns.value)}\n`);
  tableToolOpen.value = false;
}

function insertCallout() {
  insertTextAtSelection('\n> [!NOTE] 标题\n> 在这里记录重点内容。\n');
}

function insertMathBlock() {
  insertTextAtSelection('\n$$\nE = mc^2\n$$\n');
}

function insertMermaidBlock() {
  insertTextAtSelection('\n```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```\n');
}

function insertWikiLink(title: string) {
  const text = title.trim();
  if (!text) return;
  insertTextAtSelection(`[[${text}]]`);
  pageLinkOpen.value = false;
  pageLinkQuery.value = '';
}

function filenameBase() {
  const title = headings.value[0]?.title || frontmatterProperties.value.find((item) => item.key === 'title')?.value || 'knowledge-page';
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) || 'knowledge-page';
}

function downloadText(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportMarkdown() {
  downloadText(`${filenameBase()}.md`, 'text/markdown;charset=utf-8', props.modelValue);
  exportOpen.value = false;
}

function exportHtml() {
  const html = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(filenameBase())}</title>`,
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;max-width:920px;margin:40px auto;padding:0 24px;color:#1f2937}pre{overflow:auto;padding:14px;border:1px solid #d1d5db;border-radius:8px;background:#f8fafc}code{font-family:"Cascadia Mono",Consolas,monospace}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:8px 10px}blockquote{border-left:3px solid #2563eb;padding-left:14px;color:#4b5563}.knowledge-md-callout{border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:8px;padding:10px 12px;background:#eff6ff}.knowledge-md-callout__title{font-weight:700;margin-bottom:6px}.knowledge-md-math,.knowledge-md-mermaid{border:1px solid #d1d5db;border-radius:8px;padding:10px;background:#f8fafc}</style>',
    '</head>',
    '<body>',
    `<article>${previewHtml.value}</article>`,
    '</body>',
    '</html>',
  ].join('');
  downloadText(`${filenameBase()}.html`, 'text/html;charset=utf-8', html);
  exportOpen.value = false;
}

function printPreviewAsPdf() {
  const printWindow = window.open('', '_blank', 'width=980,height=720');
  if (!printWindow) return;
  printWindow.document.write([
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />',
    `<title>${escapeHtml(filenameBase())}</title>`,
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;margin:32px;color:#111827}pre{overflow:auto;padding:14px;border:1px solid #d1d5db;border-radius:8px;background:#f8fafc}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:8px 10px}blockquote{border-left:3px solid #2563eb;padding-left:14px;color:#4b5563}.knowledge-md-callout{border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:8px;padding:10px 12px;background:#eff6ff}.knowledge-md-callout__title{font-weight:700;margin-bottom:6px}.knowledge-md-math,.knowledge-md-mermaid{border:1px solid #d1d5db;border-radius:8px;padding:10px;background:#f8fafc}@media print{body{margin:0}}</style>',
    '</head><body>',
    previewHtml.value,
    '</body></html>',
  ].join(''));
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 120);
  exportOpen.value = false;
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  const image = files.find((file) => file.type.startsWith('image/'));
  if (!image) return false;

  event.preventDefault();
  emit('asset-file', { file: image, kind: 'image' });
  return true;
}

function handleDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return false;

  event.preventDefault();
  files.forEach((file) => {
    emit('asset-file', {
      file,
      kind: file.type.startsWith('image/') ? 'image' : 'attachment',
    });
  });
  return true;
}

function handlePreviewClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest('a');
  if (!anchor) return;

  const href = anchor.getAttribute('href') || '';
  if (href.startsWith('app://knowledge-assets/id/')) {
    event.preventDefault();
    const assetId = extractKnowledgeAssetId(href);
    if (assetId) {
      const openPromise = window.knowledgeApi?.openAsset(assetId);
      void openPromise?.catch(() => undefined);
    }
    return;
  }

  if (href.startsWith('app://knowledge-assets/path/')) {
    event.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }

  if (href.startsWith('file:') || href.startsWith('http:') || href.startsWith('https:')) {
    event.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

function extractKnowledgeAssetId(href: string) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    return parts[0] === 'id' ? parts[1] : '';
  } catch {
    return '';
  }
}

function scrollActiveLineToCenter(view: EditorView) {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (!coords) return;

  const scrollDom = view.scrollDOM;
  const scroller = scrollDom.getBoundingClientRect();
  const nextTop = scrollDom.scrollTop + coords.top - scroller.top - scrollDom.clientHeight * 0.42;
  scrollDom.scrollTo({
    top: Math.max(0, nextTop),
    behavior: 'smooth',
  });
}

function createEditor() {
  if (!editorHost.value) return;

  editorView.value = new EditorView({
    parent: editorHost.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        markdownEditorBaseExtensions,
        markdown(),
        markdownWysiwygDecorations(() => mode.value === 'wysiwyg'),
        placeholder('开始写 Markdown'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emitContent(update.state.doc.toString());
          }
          if (typewriterMode.value && (update.selectionSet || update.docChanged)) {
            window.requestAnimationFrame(() => scrollActiveLineToCenter(update.view));
          }
        }),
        EditorView.domEventHandlers({
          paste: handlePaste,
          drop: handleDrop,
        }),
        Prec.highest(
          keymap.of([
            { key: 'Mod-s', run: () => (emit('save'), true) },
            { key: 'Mod-b', run: () => replaceSelection('**', '**', '加粗文本') },
            { key: 'Mod-i', run: () => replaceSelection('*', '*', '斜体文本') },
            { key: 'Mod-k', run: insertLink },
          ]),
        ),
        EditorView.theme({
          '&': {
            height: '100%',
            color: 'var(--ui-text-primary)',
            backgroundColor: 'transparent',
          },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono, \"Cascadia Mono\", Consolas, monospace)',
            fontSize: 'var(--ui-font-size-md)',
            lineHeight: '1.75',
          },
          '.cm-content': {
            padding: '18px 20px 28px',
            caretColor: 'var(--ui-primary-color)',
          },
          '.cm-gutters': {
            color: 'var(--ui-text-muted)',
            backgroundColor: 'transparent',
            borderRight: '1px solid var(--ui-border-subtle)',
          },
          '.cm-activeLineGutter, .cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--ui-primary-color) 10%, transparent)',
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'color-mix(in srgb, var(--ui-primary-color) 30%, transparent)',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    }),
  });
}

watch(
  () => props.modelValue,
  (value) => {
    const view = editorView.value;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  },
);

watch(searchQuery, () => {
  activeMatchIndex.value = 0;
  nextTick(() => {
    if (searchMatches.value.length) selectMatch(0);
  });
});

watch(mode, () => {
  editorView.value?.dispatch({});
});

watch(typewriterMode, (enabled) => {
  if (!enabled || !editorView.value) return;
  nextTick(() => scrollActiveLineToCenter(editorView.value as EditorView));
});

onMounted(createEditor);

onBeforeUnmount(() => {
  editorView.value?.destroy();
  editorView.value = null;
});

defineExpose({
  insertTextAtSelection,
});
</script>

<template>
  <div class="knowledge-markdown-editor" :class="editorClassNames">
    <header class="knowledge-markdown-editor__toolbar">
      <div class="knowledge-markdown-editor__segmented" aria-label="编辑器模式">
        <UiIconButton size="sm" :active="mode === 'edit'" :aria-pressed="mode === 'edit'" title="编辑" @click="mode = 'edit'">
          <IconRenderer icon="iconify:lucide:pencil" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" :active="mode === 'split'" :aria-pressed="mode === 'split'" title="分屏" @click="mode = 'split'">
          <IconRenderer icon="iconify:lucide:columns-2" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" :active="mode === 'wysiwyg'" :aria-pressed="mode === 'wysiwyg'" title="所见即所得" @click="mode = 'wysiwyg'">
          <IconRenderer icon="iconify:lucide:eye" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" :active="mode === 'preview'" :aria-pressed="mode === 'preview'" title="预览" @click="mode = 'preview'">
          <IconRenderer icon="iconify:lucide:book-open" :size="15" />
        </UiIconButton>
      </div>

      <div class="knowledge-markdown-editor__format" aria-label="格式工具">
        <UiIconButton size="sm" title="加粗 Ctrl+B" @click="replaceSelection('**', '**', '加粗文本')">
          <IconRenderer icon="iconify:lucide:bold" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" title="斜体 Ctrl+I" @click="replaceSelection('*', '*', '斜体文本')">
          <IconRenderer icon="iconify:lucide:italic" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" title="链接 Ctrl+K" @click="insertLink">
          <IconRenderer icon="iconify:lucide:link" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" title="Callout" @click="insertCallout">
          <IconRenderer icon="iconify:lucide:message-square-warning" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" title="数学公式" @click="insertMathBlock">
          <IconRenderer icon="iconify:lucide:sigma" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" title="Mermaid" @click="insertMermaidBlock">
          <IconRenderer icon="iconify:lucide:git-fork" :size="15" />
        </UiIconButton>
        <div class="knowledge-markdown-editor__table-tool">
          <UiIconButton size="sm" :active="tableToolOpen" :aria-pressed="tableToolOpen" title="插入表格" @click="tableToolOpen = !tableToolOpen">
            <IconRenderer icon="iconify:lucide:table-2" :size="15" />
          </UiIconButton>
          <div v-if="tableToolOpen" class="knowledge-markdown-editor__floating-panel knowledge-markdown-editor__floating-panel--table">
            <label>
              行
              <UiInput
                :model-value="String(tableRows)"
                type="number"
                size="sm"
                :min="1"
                :max="20"
                @update:model-value="value => tableRows = Math.max(1, Math.min(20, Number(value) || 1))"
              />
            </label>
            <label>
              列
              <UiInput
                :model-value="String(tableColumns)"
                type="number"
                size="sm"
                :min="1"
                :max="12"
                @update:model-value="value => tableColumns = Math.max(1, Math.min(12, Number(value) || 1))"
              />
            </label>
            <UiButton type="button" variant="primary" size="sm" @click="insertTable">插入</UiButton>
          </div>
        </div>
        <div class="knowledge-markdown-editor__wikilink">
          <UiIconButton size="sm" :active="pageLinkOpen" :aria-pressed="pageLinkOpen" title="页面引用" @click="pageLinkOpen = !pageLinkOpen">
            <IconRenderer icon="iconify:lucide:brackets" :size="15" />
          </UiIconButton>
          <div v-if="pageLinkOpen" class="knowledge-markdown-editor__wikilink-menu">
            <UiInput v-model="pageLinkQuery" type="search" size="sm" placeholder="搜索页面或输入新页面名" />
            <UiButton
              v-for="title in filteredPageSuggestions"
              :key="title"
              type="button"
              variant="ghost"
              size="sm"
              @click="insertWikiLink(title)"
            >
              {{ title }}
            </UiButton>
            <UiButton
              v-if="pageLinkQuery.trim() && !filteredPageSuggestions.includes(pageLinkQuery.trim())"
              type="button"
              variant="ghost"
              size="sm"
              @click="insertWikiLink(pageLinkQuery)"
            >
              引用“{{ pageLinkQuery.trim() }}”
            </UiButton>
          </div>
        </div>
      </div>

      <div class="knowledge-markdown-editor__tools" aria-label="写作工具">
        <UiIconButton size="sm" :active="focusMode" :aria-pressed="focusMode" title="Focus Mode" @click="focusMode = !focusMode">
          <IconRenderer icon="iconify:lucide:scan-line" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" :active="typewriterMode" :aria-pressed="typewriterMode" title="Typewriter Mode" @click="typewriterMode = !typewriterMode">
          <IconRenderer icon="iconify:lucide:text-cursor-input" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" :active="frontmatterOpen" :aria-pressed="frontmatterOpen" title="Frontmatter 属性" @click="openFrontmatterPanel">
          <IconRenderer icon="iconify:lucide:list-checks" :size="15" />
        </UiIconButton>
        <UiSelect
          v-model="markdownTheme"
          :options="markdownThemeOptions"
          size="sm"
        />
        <div class="knowledge-markdown-editor__export">
          <UiIconButton size="sm" :active="exportOpen" :aria-pressed="exportOpen" title="导出" @click="exportOpen = !exportOpen">
            <IconRenderer icon="iconify:lucide:download" :size="15" />
          </UiIconButton>
          <div v-if="exportOpen" class="knowledge-markdown-editor__floating-panel knowledge-markdown-editor__floating-panel--export">
            <UiButton type="button" variant="ghost" size="sm" @click="exportMarkdown">Markdown</UiButton>
            <UiButton type="button" variant="ghost" size="sm" @click="exportHtml">HTML</UiButton>
            <UiButton type="button" variant="ghost" size="sm" @click="printPreviewAsPdf">打印/PDF</UiButton>
          </div>
        </div>
      </div>

      <label class="knowledge-markdown-editor__search" aria-label="页面内搜索">
        <UiInput v-model="searchQuery" class="knowledge-markdown-editor__search-input" type="search" size="sm" placeholder="搜索页面">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:search" :size="14" />
          </template>
        </UiInput>
        <span>{{ searchMatches.length ? activeMatchIndex + 1 : 0 }}/{{ searchMatches.length }}</span>
        <UiIconButton size="sm" title="上一个" :disabled="!searchMatches.length" @click.prevent="selectMatch(-1)">
          <IconRenderer icon="iconify:lucide:chevron-up" :size="14" />
        </UiIconButton>
        <UiIconButton size="sm" title="下一个" :disabled="!searchMatches.length" @click.prevent="selectMatch(1)">
          <IconRenderer icon="iconify:lucide:chevron-down" :size="14" />
        </UiIconButton>
      </label>

      <div class="knowledge-markdown-editor__status">
        <span>{{ stats.characters }} 字</span>
        <span>{{ stats.lines }} 行</span>
        <strong v-if="dirty">未保存</strong>
        <strong v-else>已保存</strong>
      </div>

      <UiButton class="knowledge-markdown-editor__save" type="button" variant="primary" size="sm" :disabled="saving || !dirty" @click="emit('save')">
        <template #prefix>
          <IconRenderer icon="iconify:lucide:save" :size="15" />
        </template>
        <span>{{ saving ? '保存中' : '保存' }}</span>
      </UiButton>
    </header>

    <section v-if="frontmatterOpen" class="knowledge-markdown-editor__frontmatter">
      <div class="knowledge-markdown-editor__frontmatter-summary">
        <strong>Frontmatter</strong>
        <span v-if="frontmatterProperties.length">{{ frontmatterProperties.length }} 个属性</span>
        <span v-else>当前页面还没有属性</span>
      </div>
      <UiTextarea v-model="frontmatterDraft" spellcheck="false" placeholder="title:&#10;tags: []&#10;summary:" />
      <div class="knowledge-markdown-editor__frontmatter-properties">
        <span v-for="item in frontmatterProperties" :key="item.key">{{ item.key }}: {{ item.value }}</span>
      </div>
      <div class="knowledge-markdown-editor__frontmatter-actions">
        <UiButton type="button" variant="primary" size="sm" @click="applyFrontmatter">应用</UiButton>
        <UiButton type="button" variant="secondary" size="sm" @click="removeFrontmatter">移除</UiButton>
        <UiButton type="button" variant="ghost" size="sm" @click="frontmatterOpen = false">关闭</UiButton>
      </div>
    </section>

    <div class="knowledge-markdown-editor__surface">
      <section v-show="mode !== 'preview'" class="knowledge-markdown-editor__pane knowledge-markdown-editor__pane--edit">
        <div ref="editorHost" class="knowledge-markdown-editor__codemirror" />
      </section>

      <section
        v-show="mode === 'split' || mode === 'preview'"
        class="knowledge-markdown-editor__pane knowledge-markdown-editor__pane--preview"
      >
        <div v-if="headings.length" class="knowledge-markdown-editor__outline">
          <UiButton
            v-for="heading in headings"
            :key="heading.id"
            type="button"
            variant="ghost"
            size="sm"
            :style="{ paddingLeft: `${(heading.level - 1) * 12}px` }"
            @click="goToHeading(heading.line)"
          >
            {{ heading.title }}
          </UiButton>
        </div>
        <MarkdownPreviewVirtualList
          :markdown="previewSource"
          @preview-click="handlePreviewClick"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.knowledge-markdown-editor {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.knowledge-markdown-editor__toolbar {
  display: grid;
  grid-template-columns: auto auto auto minmax(180px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
}

.knowledge-markdown-editor__segmented,
.knowledge-markdown-editor__format,
.knowledge-markdown-editor__tools,
.knowledge-markdown-editor__search,
.knowledge-markdown-editor__status,
.knowledge-markdown-editor__save {
  display: inline-flex;
  align-items: center;
}

.knowledge-markdown-editor__segmented,
.knowledge-markdown-editor__format,
.knowledge-markdown-editor__tools,
.knowledge-markdown-editor__search {
  min-height: 30px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 7px;
  background: var(--ui-input-bg);
}

.knowledge-markdown-editor__table-tool,
.knowledge-markdown-editor__wikilink,
.knowledge-markdown-editor__export {
  position: relative;
}

.knowledge-markdown-editor__tools {
  gap: 2px;
  padding: 0 4px;

  :deep(.ui-select-wrap) {
    min-width: 64px;
  }

  :deep(.ui-select-trigger) {
    min-height: 28px;
    border-color: transparent;
    background: transparent;
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-markdown-editor__wikilink-menu,
.knowledge-markdown-editor__floating-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: var(--ui-z-sticky);
  display: grid;
  width: 240px;
  max-height: 280px;
  overflow: auto;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel);
  box-shadow: var(--ui-shadow-popover, 0 10px 30px rgba(0, 0, 0, 0.22));
}

.knowledge-markdown-editor__wikilink-menu {
  display: grid;
  gap: 4px;

  input {
    height: 30px;
    min-width: 0;
    border: 1px solid var(--ui-input-border);
    border-radius: 7px;
    padding: 0 8px;
    color: var(--ui-input-text);
    background: var(--ui-input-bg);
    font-size: var(--ui-font-size-xs);
  }

  :deep(.ui-button) {
    justify-content: flex-start;
    width: 100%;
    min-width: 0;
    padding: 0 8px;
    overflow: hidden;
  }

  :deep(.ui-button__label) {
    justify-content: flex-start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.knowledge-markdown-editor__floating-panel {
  display: grid;
  gap: 8px;

  label {
    display: grid;
    gap: 4px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  input {
    height: 30px;
    border: 1px solid var(--ui-input-border);
    border-radius: 7px;
    padding: 0 8px;
    color: var(--ui-input-text);
    background: var(--ui-input-bg);
  }
}

.knowledge-markdown-editor__floating-panel--table {
  width: 180px;
}

.knowledge-markdown-editor__floating-panel--export {
  right: 0;
  left: auto;
  width: 150px;

  :deep(.ui-button) {
    justify-content: flex-start;
    width: 100%;
    padding: 0 8px;
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-markdown-editor__search {
  min-width: 0;
  gap: 6px;
  padding: 0 6px 0 9px;
  color: var(--ui-text-muted);

  span {
    min-width: 42px;
    font-size: var(--ui-font-size-xs);
    text-align: right;
  }
}

.knowledge-markdown-editor__search-input.ui-input-affix-wrapper {
  flex: 1 1 auto;
  min-width: 80px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.knowledge-markdown-editor__search-input :deep(.ui-input) {
  color: inherit;
  font-size: var(--ui-font-size-xs);
}

.knowledge-markdown-editor__status {
  gap: 8px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  white-space: nowrap;

  strong {
    color: var(--ui-primary-color);
    font-weight: 700;
  }
}

.knowledge-markdown-editor__save {
  gap: 6px;
  min-width: 78px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--ui-primary-color) 48%, transparent);
  border-radius: 7px;
  color: var(--ui-button-primary-text);
  background: var(--ui-button-primary-bg);
}

.knowledge-markdown-editor__save:disabled {
  color: var(--ui-text-muted);
  background: var(--ui-button-secondary-bg);
}

.knowledge-markdown-editor__frontmatter {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr) minmax(180px, 260px) auto;
  gap: 10px;
  align-items: stretch;
  min-height: 96px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-surface-panel) 88%, var(--ui-surface-base) 12%);
}

.knowledge-markdown-editor__frontmatter-summary {
  display: grid;
  align-content: start;
  gap: 4px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);

  strong {
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
  }
}

.knowledge-markdown-editor__frontmatter :deep(.ui-textarea) {
  min-height: 76px;
  resize: vertical;
  border: 1px solid var(--ui-input-border);
  border-radius: 7px;
  padding: 8px 10px;
  color: var(--ui-input-text);
  background: var(--ui-input-bg);
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
  font-size: var(--ui-font-size-xs);
  line-height: 1.55;
  outline: 0;
}

.knowledge-markdown-editor__frontmatter-properties {
  display: flex;
  align-content: flex-start;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  overflow: auto;

  span {
    max-width: 100%;
    padding: 4px 7px;
    overflow: hidden;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 999px;
    color: var(--ui-text-muted);
    background: var(--ui-surface-muted);
    font-size: var(--ui-font-size-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.knowledge-markdown-editor__frontmatter-actions {
  display: grid;
  align-content: start;
  gap: 6px;
}

.knowledge-markdown-editor__surface {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 0;
}

.knowledge-markdown-editor--edit .knowledge-markdown-editor__surface,
.knowledge-markdown-editor--wysiwyg .knowledge-markdown-editor__surface,
.knowledge-markdown-editor--preview .knowledge-markdown-editor__surface {
  grid-template-columns: minmax(0, 1fr);
}

.knowledge-markdown-editor__pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.knowledge-markdown-editor__pane--preview {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-left: 1px solid var(--ui-border-subtle);
}

.knowledge-markdown-editor--preview .knowledge-markdown-editor__pane--preview {
  border-left: 0;
}

.knowledge-markdown-editor__codemirror {
  height: 100%;
}

.knowledge-markdown-editor--focus :deep(.cm-line:not(.cm-activeLine)) {
  opacity: 0.42;
}

.knowledge-markdown-editor--focus :deep(.cm-activeLine) {
  opacity: 1;
}

.knowledge-markdown-editor--typewriter :deep(.cm-content) {
  padding-top: 30vh;
  padding-bottom: 36vh;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-heading) {
  color: var(--ui-text-primary);
  font-weight: 800;
  line-height: 1.35;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-heading-1) {
  font-size: 1.55em;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-heading-2) {
  font-size: 1.35em;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-heading-3) {
  font-size: 1.18em;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-strong) {
  color: var(--ui-text-primary);
  font-weight: 800;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-emphasis) {
  font-style: italic;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-inline-code) {
  padding: 0.08em 0.34em;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 5px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 86%, transparent);
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-task) {
  display: inline-grid;
  place-items: center;
  width: 1.05em;
  height: 1.05em;
  margin: 0 0.14em;
  border: 1px solid color-mix(in srgb, var(--ui-text-muted) 58%, transparent);
  border-radius: 4px;
  color: var(--ui-button-primary-text);
  background: var(--ui-input-bg);
  font-size: 0.78em;
  font-weight: 800;
  line-height: 1;
  vertical-align: -0.12em;
}

.knowledge-markdown-editor :deep(.cm-md-wysiwyg-task--checked) {
  border-color: color-mix(in srgb, var(--ui-primary-color) 72%, transparent);
  background: var(--ui-primary-color);
}

.knowledge-markdown-editor--theme-paper {
  --knowledge-editor-preview-bg: color-mix(in srgb, var(--ui-surface-base) 82%, white 18%);
  --knowledge-editor-editor-bg: color-mix(in srgb, var(--ui-surface-base) 92%, white 8%);
}

.knowledge-markdown-editor--theme-focus {
  --knowledge-editor-preview-bg: color-mix(in srgb, var(--ui-surface-panel) 90%, var(--ui-primary-color) 10%);
  --knowledge-editor-editor-bg: color-mix(in srgb, var(--ui-surface-base) 94%, var(--ui-primary-color) 6%);
}

.knowledge-markdown-editor__pane--edit {
  background: var(--knowledge-editor-editor-bg, transparent);
}

.knowledge-markdown-editor__outline {
  display: grid;
  gap: 2px;
  padding: 14px 20px 0;

  :deep(.ui-button) {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: 24px;
    min-width: 28px;
    overflow: hidden;
    font-size: var(--ui-font-size-xs);
  }

  :deep(.ui-button__label) {
    justify-content: flex-start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.knowledge-markdown-editor__preview {
  max-width: 920px;
  padding: 22px 28px 44px;
  color: var(--ui-text-primary);
  background: var(--knowledge-editor-preview-bg, transparent);
  line-height: 1.72;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 1.15em 0 0.55em;
  line-height: 1.25;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table) {
  margin: 0 0 1em;
}

.markdown-body :deep(a) {
  color: var(--ui-primary-color);
}

.markdown-body :deep(code) {
  padding: 0.12em 0.32em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 82%, transparent);
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
}

.markdown-body :deep(pre) {
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 88%, var(--ui-surface-base) 12%);
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  padding-left: 14px;
  border-left: 3px solid var(--ui-primary-color);
  color: var(--ui-text-muted);
}

.markdown-body :deep(.knowledge-md-callout) {
  margin: 0 0 1em;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ui-primary-color) 32%, var(--ui-border-subtle) 68%);
  border-left: 4px solid var(--ui-primary-color);
  border-radius: 8px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-primary-color) 9%, var(--ui-surface-panel) 91%);
}

.markdown-body :deep(.knowledge-md-callout__title) {
  margin-bottom: 6px;
  color: var(--ui-primary-color);
  font-size: var(--ui-font-size-xs);
  font-weight: 800;
  letter-spacing: 0;
}

.markdown-body :deep(.knowledge-md-math) {
  border: 1px solid var(--ui-border-subtle);
  border-radius: 7px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 88%, transparent);
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
}

.markdown-body :deep(.knowledge-md-math--inline) {
  display: inline-flex;
  padding: 0.08em 0.38em;
}

.markdown-body :deep(.knowledge-md-math--block) {
  display: block;
  margin: 0 0 1em;
  padding: 12px 14px;
}

.markdown-body :deep(.knowledge-md-mermaid) {
  margin: 0 0 1em;
  overflow: auto;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 86%, transparent);
}

.markdown-body :deep(.knowledge-md-mermaid__title) {
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border-subtle);
  color: var(--ui-primary-color);
  font-size: var(--ui-font-size-xs);
  font-weight: 800;
}

.markdown-body :deep(.knowledge-md-mermaid pre) {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 10px;
  border: 1px solid var(--ui-border-subtle);
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

@media (max-width: 1040px) {
  .knowledge-markdown-editor__toolbar {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .knowledge-markdown-editor__tools,
  .knowledge-markdown-editor__search {
    grid-column: span 1;
  }

  .knowledge-markdown-editor__status,
  .knowledge-markdown-editor__save {
    grid-column: span 1;
  }

  .knowledge-markdown-editor__frontmatter {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
