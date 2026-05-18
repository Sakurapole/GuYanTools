<script setup lang="ts">
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeFromList,
  completionKeymap,
  type Completion,
} from '@codemirror/autocomplete';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
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
  rectangularSelection,
} from '@codemirror/view';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  filePath: string;
  readOnly?: boolean;
}>(), {
  readOnly: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'save-requested': [];
}>();

const editorRoot = ref<HTMLDivElement | null>(null);
const editorLanguageLabel = ref('Plain Text');
const editorReady = ref(false);

let editorView: EditorView | null = null;
let updatingFromOutside = false;

const languageCompartment = new Compartment();
const completionCompartment = new Compartment();
const editableCompartment = new Compartment();

const ftpBaseEditorExtensions: Extension[] = [
  lineNumbers(),
  highlightSpecialChars(),
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
    ...foldKeymap,
    ...completionKeymap,
  ]),
];

const ftpCodeEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--ui-text-primary)',
    backgroundColor: 'var(--ui-surface-panel)',
    fontFamily: "Consolas, 'Cascadia Mono', 'JetBrains Mono', monospace",
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "Consolas, 'Cascadia Mono', 'JetBrains Mono', monospace",
    lineHeight: '1.7',
  },
  '.cm-content': {
    padding: '14px 0',
    caretColor: 'var(--primary-color)',
  },
  '.cm-line': {
    padding: '0 16px',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in srgb, var(--ui-surface-panel-muted) 92%, transparent)',
    color: 'var(--ui-text-muted)',
    borderRight: '1px solid var(--ui-border-subtle)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--primary-color) 26%, transparent)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--primary-color)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--ui-surface-panel)',
    color: 'var(--ui-text-primary)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--ui-border-subtle)',
    backgroundColor: 'var(--ui-surface-panel)',
    color: 'var(--ui-text-primary)',
    borderRadius: 'var(--ui-radius-sm)',
    boxShadow: 'var(--ui-panel-shadow-hover)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, transparent)',
    color: 'var(--ui-text-primary)',
  },
});

const editorStatus = computed(() => (
  editorReady.value
    ? `${editorLanguageLabel.value} 语法高亮已启用 · Ctrl/Cmd+S 保存 · Ctrl+Space 提示`
    : '正在加载编辑器能力...'
));

onMounted(() => {
  if (!editorRoot.value) return;

  const saveKeymap = keymap.of([
    {
      key: 'Mod-s',
      preventDefault: true,
      run: () => {
        emit('save-requested');
        return true;
      },
    },
  ]);

  editorView = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        ftpBaseEditorExtensions,
        ftpCodeEditorTheme,
        EditorView.lineWrapping,
        saveKeymap,
        editableCompartment.of([
          EditorState.readOnly.of(props.readOnly),
          EditorView.editable.of(!props.readOnly),
        ]),
        languageCompartment.of([]),
        completionCompartment.of(autocompletion({
          override: [],
          activateOnTyping: true,
        })),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || updatingFromOutside) return;
          emit('update:modelValue', update.state.doc.toString());
        }),
      ],
    }),
    parent: editorRoot.value,
  });

  editorReady.value = true;
  void reconfigureLanguage();
});

onBeforeUnmount(() => {
  editorView?.destroy();
  editorView = null;
});

watch(() => props.modelValue, (value) => {
  if (!editorView) return;
  const current = editorView.state.doc.toString();
  if (current === value) return;
  updatingFromOutside = true;
  editorView.dispatch({
    changes: {
      from: 0,
      to: current.length,
      insert: value,
    },
    selection: EditorSelection.cursor(Math.min(editorView.state.selection.main.head, value.length)),
  });
  updatingFromOutside = false;
});

watch(() => props.filePath, () => {
  void reconfigureLanguage();
});

watch(() => props.readOnly, (value) => {
  if (!editorView) return;
  editorView.dispatch({
    effects: editableCompartment.reconfigure([
      EditorState.readOnly.of(value),
      EditorView.editable.of(!value),
    ]),
  });
});

async function reconfigureLanguage() {
  if (!editorView) return;
  const config = await resolveLanguageConfig(props.filePath);
  editorLanguageLabel.value = config.label;
  editorView.dispatch({
    effects: [
      languageCompartment.reconfigure(config.extension),
      completionCompartment.reconfigure(autocompletion({
        override: config.completions.length ? [completeFromList(config.completions)] : [],
        activateOnTyping: true,
      })),
    ],
  });
}

type EditorLanguageConfig = {
  label: string;
  extension: Extension;
  completions: Completion[];
};

async function resolveLanguageConfig(filePath: string): Promise<EditorLanguageConfig> {
  const extension = extractFileExtension(filePath);
  if (['js', 'mjs', 'cjs', 'jsx'].includes(extension)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return {
      label: extension === 'jsx' ? 'JavaScript React' : 'JavaScript',
      extension: [javascript({ jsx: extension === 'jsx' })],
      completions: keywordCompletions(javascriptKeywords, 'keyword', 'JavaScript'),
    };
  }
  if (['ts', 'mts', 'cts', 'tsx'].includes(extension)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return {
      label: extension === 'tsx' ? 'TypeScript React' : 'TypeScript',
      extension: [javascript({ typescript: true, jsx: extension === 'tsx' })],
      completions: keywordCompletions(typescriptKeywords, 'keyword', 'TypeScript'),
    };
  }
  if (['json', 'jsonc'].includes(extension)) {
    const { json } = await import('@codemirror/lang-json');
    return {
      label: 'JSON',
      extension: [json()],
      completions: keywordCompletions(['true', 'false', 'null'], 'constant', 'JSON'),
    };
  }
  if (['html', 'htm', 'vue'].includes(extension)) {
    const { html } = await import('@codemirror/lang-html');
    return {
      label: extension === 'vue' ? 'Vue / HTML' : 'HTML',
      extension: [html()],
      completions: keywordCompletions(htmlKeywords, 'keyword', 'HTML'),
    };
  }
  if (['css', 'scss', 'sass', 'less'].includes(extension)) {
    const { css } = await import('@codemirror/lang-css');
    return {
      label: 'CSS',
      extension: [css()],
      completions: keywordCompletions(cssKeywords, 'property', 'CSS'),
    };
  }
  if (['md', 'markdown'].includes(extension)) {
    const { markdown } = await import('@codemirror/lang-markdown');
    return {
      label: 'Markdown',
      extension: [markdown()],
      completions: keywordCompletions(markdownKeywords, 'keyword', 'Markdown'),
    };
  }
  if (extension === 'sql') {
    const { sql } = await import('@codemirror/lang-sql');
    return {
      label: 'SQL',
      extension: [sql()],
      completions: keywordCompletions(sqlKeywords, 'keyword', 'SQL'),
    };
  }
  if (['xml', 'svg'].includes(extension)) {
    const { xml } = await import('@codemirror/lang-xml');
    return {
      label: 'XML',
      extension: [xml()],
      completions: keywordCompletions(xmlKeywords, 'keyword', 'XML'),
    };
  }
  if (extension === 'py') {
    const { python } = await import('@codemirror/lang-python');
    return {
      label: 'Python',
      extension: [python()],
      completions: keywordCompletions(pythonKeywords, 'keyword', 'Python'),
    };
  }
  if (extension === 'rs') {
    const { rust } = await import('@codemirror/lang-rust');
    return {
      label: 'Rust',
      extension: [rust()],
      completions: keywordCompletions(rustKeywords, 'keyword', 'Rust'),
    };
  }

  return {
    label: 'Plain Text',
    extension: [],
    completions: [],
  };
}

function extractFileExtension(filePath: string) {
  const normalized = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (!normalized || !normalized.includes('.')) return '';
  return normalized.slice(normalized.lastIndexOf('.') + 1);
}

function keywordCompletions(keywords: string[], type: Completion['type'], detail: string) {
  return keywords.map((keyword) => ({
    label: keyword,
    type,
    detail,
  }));
}

const javascriptKeywords = [
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'else',
  'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'let', 'new', 'return',
  'switch', 'throw', 'try', 'typeof', 'var', 'while', 'yield', 'Promise', 'console', 'map',
  'filter', 'reduce', 'Object', 'Array',
];

const typescriptKeywords = [
  ...javascriptKeywords,
  'interface', 'type', 'enum', 'implements', 'readonly', 'keyof', 'infer', 'unknown', 'never',
  'Record', 'Partial', 'Pick', 'Omit',
];

const htmlKeywords = [
  'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'button',
  'input', 'textarea', 'select', 'option', 'label', 'form', 'table', 'thead', 'tbody', 'tr',
  'td', 'th', 'img', 'a', 'ul', 'ol', 'li', 'script', 'style', 'template',
];

const cssKeywords = [
  'display', 'position', 'color', 'background', 'background-color', 'font-size', 'font-weight',
  'line-height', 'margin', 'padding', 'border', 'border-radius', 'width', 'height', 'max-width',
  'min-height', 'flex', 'grid', 'gap', 'align-items', 'justify-content', 'overflow', 'transition',
  'transform', 'opacity', 'z-index',
];

const markdownKeywords = [
  '#', '##', '###', '-', '*', '`code`', '```', '[link](https://)', '![image](path)', '> quote',
];

const sqlKeywords = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'INSERT INTO', 'UPDATE', 'DELETE',
  'CREATE TABLE', 'ALTER TABLE', 'ORDER BY', 'GROUP BY', 'LIMIT', 'OFFSET', 'AND', 'OR', 'NULL',
];

const xmlKeywords = [
  'xml', 'svg', 'path', 'g', 'defs', 'clipPath', 'linearGradient', 'stop', 'viewBox', 'xmlns',
];

const pythonKeywords = [
  'def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'try',
  'except', 'with', 'as', 'async', 'await', 'lambda', 'None', 'True', 'False',
];

const rustKeywords = [
  'fn', 'let', 'mut', 'struct', 'enum', 'impl', 'trait', 'match', 'if', 'else', 'loop', 'while',
  'for', 'use', 'pub', 'crate', 'mod', 'Result', 'Option', 'String', 'Vec',
];
</script>

<template>
  <div class="ftp-code-editor">
    <div class="ftp-code-editor__status">
      <span class="ftp-badge ftp-badge--accent">{{ editorLanguageLabel }}</span>
      <span class="ftp-code-editor__hint">{{ editorStatus }}</span>
    </div>
    <div ref="editorRoot" class="ftp-code-editor__surface" />
  </div>
</template>

<style scoped lang="scss">
.ftp-code-editor {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}

.ftp-code-editor__status {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ftp-code-editor__hint {
  color: var(--ui-text-muted);
  font-size: 0.74rem;
}

.ftp-code-editor__surface {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  overflow: hidden;
  background: var(--ui-surface-panel);
}

.ftp-code-editor__surface :deep(.cm-editor) {
  height: 100%;
}

.ftp-code-editor__surface :deep(.cm-scroller) {
  overflow: auto;
}
</style>
