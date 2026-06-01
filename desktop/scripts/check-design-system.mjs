import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const scanRoot = join(root, 'src', 'windows', 'main');
const fileExts = new Set(['.vue', '.scss', '.css', '.ts']);

const allowedUndefinedVars = new Set([
  '--app-font-family',
  '--color-bg-primary',
  '--color-text-primary',
  '--ftp-col-2',
  '--ftp-col-3',
  '--ftp-col-4',
  '--ftp-col-5',
  '--ftp-name-col-min',
  '--ftp-task-tree-level',
  '--in-app-notification-top',
  '--quick-note-accent',
  '--term-bg-color',
  '--tag-color',
  '--todo-item-backdrop-filter',
  '--todo-item-surface-bg',
  '--todo-item-surface-hover-bg',
  '--todo-item-surface-opacity',
  '--todo-sidebar-item-backdrop-filter',
  '--todo-sidebar-item-surface-bg',
  '--todo-sidebar-item-surface-opacity',
  '--ui-file-icon-glyph-x',
  '--ui-tooltip-arrow-x',
  '--ui-tooltip-arrow-y',
  '--widget-text-primary',
  '--widget-text-secondary',
  '--widget-text-subtle',
  '--widget-text-muted',
]);

const discouragedAliasPrefixes = [
  '--color-',
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', '.vite'].includes(entry)) walk(path, files);
      continue;
    }
    const ext = path.slice(path.lastIndexOf('.'));
    if (fileExts.has(ext)) files.push(path);
  }
  return files;
}

const files = walk(scanRoot);
const defined = new Map();
const used = new Map();
const nativeControlHits = [];
const zIndexHits = [];
const discouragedAliases = [];
const componentContractHits = [];
const iconControlCompositionHits = [];

function hasNamedSlot(text, name) {
  return new RegExp(`<slot\\s+name=["']${name}["']`).test(text);
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file).replace(/\\/g, '/');

  for (const match of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
    const name = match[1];
    if (!defined.has(name)) defined.set(name, []);
    defined.get(name).push(rel);
    if (discouragedAliasPrefixes.some((prefix) => name.startsWith(prefix))) {
      discouragedAliases.push(`${rel}: defines ${name}`);
    }
  }

  for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    const name = match[1];
    if (!used.has(name)) used.set(name, []);
    used.get(name).push(rel);
  }

  for (const match of text.matchAll(/z-index:\s*(\d+)/g)) {
    const value = Number(match[1]);
    if (value >= 20) zIndexHits.push(`${rel}: z-index ${value}`);
  }

  for (const match of text.matchAll(/:z-index\s*=\s*["'](\d+)["']/g)) {
    const value = Number(match[1]);
    if (value >= 20) zIndexHits.push(`${rel}: :z-index ${value}`);
  }

  for (const match of text.matchAll(/\bzIndex\s*:\s*(\d+)/g)) {
    const value = Number(match[1]);
    if (value >= 20) zIndexHits.push(`${rel}: zIndex ${value}`);
  }

  if (!rel.includes('/components/ui/')) {
    for (const match of text.matchAll(/<(button|input|select|textarea)\b/g)) {
      nativeControlHits.push(`${rel}: native <${match[1]}>`);
    }

    const iconInputPatterns = [
      /settings-search__icon[\s\S]{0,260}<UiInput/g,
      /<IconRenderer[^>]+icon=["'][^"']*search[^"']*["'][\s\S]{0,260}<UiInput/g,
      /<svg[^>]+class=["'][^"']*search[^"']*["'][\s\S]{0,260}<UiInput/g,
    ];

    for (const pattern of iconInputPatterns) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index ?? 0).split(/\r?\n/).length;
        iconControlCompositionHits.push(`${rel}:${line}: external icon + UiInput composition`);
      }
    }
  }
}

const uiInputText = readFileSync(join(scanRoot, 'components', 'ui', 'UiInput.vue'), 'utf8');
const uiSelectText = readFileSync(join(scanRoot, 'components', 'ui', 'UiSelect.vue'), 'utf8');
for (const slotName of ['prefix', 'suffix']) {
  if (!hasNamedSlot(uiInputText, slotName)) {
    componentContractHits.push(`components/ui/UiInput.vue: missing ${slotName} slot`);
  }
  if (!hasNamedSlot(uiSelectText, slotName)) {
    componentContractHits.push(`components/ui/UiSelect.vue: missing ${slotName} slot`);
  }
}

const undefinedVars = [];
for (const [name, refs] of used.entries()) {
  if (!defined.has(name) && !allowedUndefinedVars.has(name)) {
    undefinedVars.push(`${name} used in ${[...new Set(refs)].join(', ')}`);
  }
}

const failures = [];
if (undefinedVars.length) {
  failures.push(['Undefined CSS variables', undefinedVars]);
}
if (componentContractHits.length) {
  failures.push(['UI component contracts', componentContractHits]);
}
if (iconControlCompositionHits.length) {
  failures.push(['External icon + UI control compositions', iconControlCompositionHits]);
}

const warnings = [];
if (discouragedAliases.length) warnings.push(['Discouraged standalone aliases', discouragedAliases]);
if (zIndexHits.length) warnings.push(['Numeric z-index values >= 20', zIndexHits]);
if (nativeControlHits.length) warnings.push(['Native controls outside components/ui', nativeControlHits]);

for (const [title, items] of warnings) {
  console.warn(`\n[design-system warning] ${title}`);
  for (const item of items.slice(0, 80)) console.warn(`- ${item}`);
  if (items.length > 80) console.warn(`- ... ${items.length - 80} more`);
}

if (failures.length) {
  for (const [title, items] of failures) {
    console.error(`\n[design-system error] ${title}`);
    for (const item of items) console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('[design-system] no undefined CSS variables found');
