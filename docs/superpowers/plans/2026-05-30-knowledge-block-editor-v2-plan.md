# Knowledge Block Editor V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current form-based Knowledge block editor into a Notion-like structured editor with a V2 document schema, slash insertion, block handles, keyboard block operations, and Markdown interoperability.

**Architecture:** Keep Vue 3 as the editor surface for this phase and avoid adding Tiptap until a separate spike proves it is necessary. Introduce V2 schema utilities beside the existing V1 `knowledge_blocks.ts`, migrate V1 documents at parse boundaries, and keep save payload derivation flowing through `knowledge_document_codec.ts`.

**Tech Stack:** Vue 3, TypeScript, Pinia, current GuYanTools UI components, existing `KnowledgeBlockDocument` contracts, no new runtime dependency in this plan.

---

## Foundation Readiness Gate

Before Task 1, confirm the Markdown foundation work is usable enough to build on:

- `pnpm --dir desktop run verify:knowledge-editor` must pass.
- `pnpm --dir desktop run lint` must pass.
- `pnpm --dir desktop run build:renderer` must pass.
- Manually smoke test the Knowledge Markdown editor with `desktop/tmp/knowledge-large-10000.md` at minimum.
- Do not stage unrelated pre-existing Knowledge files unless the user explicitly approves turning the whole Knowledge feature tree into tracked work.

## File Structure

- Create `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
  - V2 schema, V1 migration, normalize, serialize, Markdown/text derivation, block tree operations.
- Create `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`
  - Renders one V2 block and emits focused edit operations.
- Create `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeSlashMenu.vue`
  - Teleported fixed-position slash insertion menu.
- Create `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockHandle.vue`
  - Handle actions: move up/down, duplicate, delete, convert.
- Modify `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
  - Replace form-like per-block layout with V2 renderer loop, keyboard operations, slash menu state.
- Modify `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`
  - Use V2 parser/serializer for block pages while preserving V1 read compatibility.
- Modify `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - Add focused V2 schema and migration checks.
- Modify `desktop/src/contracts/knowledge.ts`
  - Add V2 types only if they need to cross component/service boundaries; otherwise keep V2 internal to renderer utilities.

## Task 1: Add Block V2 Schema and Migration

**Files:**
- Create: `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add failing V2 verification**

Append before the final `console.log` in `desktop/scripts/verify-knowledge-editor-foundation.cjs`:

```js
const {
  createDefaultBlockDocumentV2,
  migrateBlockDocumentToV2,
  serializeBlockDocumentV2,
  parseKnowledgeBlockDocumentV2,
  blockDocumentV2ToPlainText,
  blockDocumentV2ToMarkdown,
} = require('../src/windows/main/utils/knowledge_blocks_v2.ts');

function testBlockV2DefaultDocument() {
  const document = createDefaultBlockDocumentV2('V2 title');
  assert.equal(document.type, 'guyantools.block-page');
  assert.equal(document.version, 2);
  assert.equal(document.blocks[0].type, 'heading');
  assert.equal(document.blocks[0].content[0].text, 'V2 title');
}

function testBlockV1MigratesToV2() {
  const v1 = createDefaultBlockDocument('Migrated title');
  const v2 = migrateBlockDocumentToV2(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.blocks[0].content[0].text, 'Migrated title');
}

function testBlockV2RoundTripAndDerivedText() {
  const document = createDefaultBlockDocumentV2('Round trip');
  const serialized = serializeBlockDocumentV2(document);
  const parsed = parseKnowledgeBlockDocumentV2(serialized, 'Fallback');
  assert.equal(parsed.version, 2);
  assert.match(blockDocumentV2ToPlainText(parsed), /Round trip/);
  assert.match(blockDocumentV2ToMarkdown(parsed), /^# Round trip/m);
}

testBlockV2DefaultDocument();
testBlockV1MigratesToV2();
testBlockV2RoundTripAndDerivedText();
```

- [ ] **Step 2: Run verification and confirm missing module failure**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
Cannot find module '../src/windows/main/utils/knowledge_blocks_v2.ts'
```

- [ ] **Step 3: Implement V2 schema utility**

Create `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`:

```ts
import type { KnowledgeBlockDocument, KnowledgeBlockType } from '@/contracts/knowledge';
import { createKnowledgeBlock, normalizeBlockDocument } from './knowledge_blocks';

export type KnowledgeInlineMarkType = 'bold' | 'italic' | 'code' | 'strike';

export interface KnowledgeInlineMark {
  type: KnowledgeInlineMarkType;
}

export interface KnowledgeInlineText {
  type: 'text';
  text: string;
  marks?: KnowledgeInlineMark[];
}

export type KnowledgeInlineContent = KnowledgeInlineText;

export interface KnowledgeBlockV2 {
  id: string;
  type: KnowledgeBlockType | 'divider' | 'toggle' | 'table';
  content: KnowledgeInlineContent[];
  children?: KnowledgeBlockV2[];
  attrs?: Record<string, unknown>;
  refs?: {
    assetId?: string;
    pageId?: string;
    todoId?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeBlockDocumentV2 {
  type: 'guyantools.block-page';
  version: 2;
  blocks: KnowledgeBlockV2[];
  importedFromMarkdown?: boolean;
  updatedAt: string;
}

export function createDefaultBlockDocumentV2(title = '块笔记'): KnowledgeBlockDocumentV2 {
  return normalizeBlockDocumentV2({
    type: 'guyantools.block-page',
    version: 2,
    updatedAt: new Date().toISOString(),
    blocks: [
      createBlockV2('heading', title, { level: 1 }),
      createBlockV2('paragraph', ''),
    ],
  });
}

export function createBlockV2(
  type: KnowledgeBlockV2['type'],
  text = '',
  attrs: Record<string, unknown> = {},
): KnowledgeBlockV2 {
  const now = new Date().toISOString();
  return {
    id: createKnowledgeBlock(type === 'divider' || type === 'toggle' || type === 'table' ? 'paragraph' : type).id,
    type,
    content: text ? [{ type: 'text', text }] : [],
    attrs,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseKnowledgeBlockDocumentV2(value?: string | null, fallbackTitle?: string): KnowledgeBlockDocumentV2 {
  if (!value) return createDefaultBlockDocumentV2(fallbackTitle);
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeBlockDocumentV2(parsed, fallbackTitle);
  } catch {
    return createDefaultBlockDocumentV2(fallbackTitle);
  }
}

export function migrateBlockDocumentToV2(document: KnowledgeBlockDocument): KnowledgeBlockDocumentV2 {
  const normalized = normalizeBlockDocument(document);
  return normalizeBlockDocumentV2({
    type: 'guyantools.block-page',
    version: 2,
    importedFromMarkdown: normalized.importedFromMarkdown,
    updatedAt: normalized.updatedAt,
    blocks: normalized.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      content: block.text ? [{ type: 'text', text: block.text }] : [],
      attrs: {
        level: block.level,
        language: block.language,
        checked: block.checked,
        assetName: block.assetName,
        assetMimeType: block.assetMimeType,
        assetUrl: block.assetUrl,
        title: block.title,
      },
      refs: {
        assetId: block.assetId,
        pageId: block.pageId,
        todoId: block.todoId,
      },
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    })),
  });
}

export function normalizeBlockDocumentV2(value: unknown, fallbackTitle?: string): KnowledgeBlockDocumentV2 {
  const source = isRecord(value) ? value : {};
  if (source.version !== 2) {
    return migrateBlockDocumentToV2(normalizeBlockDocument(value, fallbackTitle));
  }

  const blocks = Array.isArray(source.blocks)
    ? source.blocks.map(normalizeBlockV2).filter((block): block is KnowledgeBlockV2 => Boolean(block))
    : [];

  return {
    type: 'guyantools.block-page',
    version: 2,
    importedFromMarkdown: source.importedFromMarkdown === true,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    blocks: blocks.length ? blocks : createDefaultBlockDocumentV2(fallbackTitle).blocks,
  };
}

export function serializeBlockDocumentV2(document: KnowledgeBlockDocumentV2): string {
  return JSON.stringify({
    ...normalizeBlockDocumentV2(document),
    updatedAt: new Date().toISOString(),
  });
}

export function blockDocumentV2ToPlainText(document: KnowledgeBlockDocumentV2): string {
  return flattenBlocks(normalizeBlockDocumentV2(document).blocks)
    .map((block) => inlineText(block.content))
    .filter(Boolean)
    .join('\n');
}

export function blockDocumentV2ToMarkdown(document: KnowledgeBlockDocumentV2): string {
  return flattenBlocks(normalizeBlockDocumentV2(document).blocks)
    .map(blockV2ToMarkdown)
    .filter(Boolean)
    .join('\n\n');
}

function blockV2ToMarkdown(block: KnowledgeBlockV2): string {
  const text = inlineText(block.content);
  if (block.type === 'heading') return `${'#'.repeat(Number(block.attrs?.level ?? 2))} ${text}`;
  if (block.type === 'bullet_list') return text.split('\n').filter(Boolean).map((line) => `- ${line}`).join('\n');
  if (block.type === 'ordered_list') return text.split('\n').filter(Boolean).map((line, index) => `${index + 1}. ${line}`).join('\n');
  if (block.type === 'task_list') return `- [${block.attrs?.checked ? 'x' : ' '}] ${text}`;
  if (block.type === 'code') return `\`\`\`${String(block.attrs?.language ?? 'text')}\n${text}\n\`\`\``;
  if (block.type === 'quote') return text.split('\n').map((line) => `> ${line}`).join('\n');
  if (block.type === 'divider') return '---';
  return text;
}

function normalizeBlockV2(value: unknown): KnowledgeBlockV2 | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return null;
  return {
    id: value.id,
    type: value.type as KnowledgeBlockV2['type'],
    content: normalizeInlineContent(value.content),
    children: Array.isArray(value.children)
      ? value.children.map(normalizeBlockV2).filter((block): block is KnowledgeBlockV2 => Boolean(block))
      : undefined,
    attrs: isRecord(value.attrs) ? value.attrs : undefined,
    refs: isRecord(value.refs) ? value.refs as KnowledgeBlockV2['refs'] : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function normalizeInlineContent(value: unknown): KnowledgeInlineContent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string'
      ? { type: 'text' as const, text: item.text, marks: Array.isArray(item.marks) ? item.marks as KnowledgeInlineMark[] : undefined }
      : null)
    .filter((item): item is KnowledgeInlineContent => Boolean(item));
}

function inlineText(content: KnowledgeInlineContent[]): string {
  return content.map((item) => item.text).join('');
}

function flattenBlocks(blocks: KnowledgeBlockV2[]): KnowledgeBlockV2[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children ?? [])]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec eslint src/windows/main/utils/knowledge_blocks_v2.ts
```

Expected:

```text
knowledge editor foundation checks passed
```

- [ ] **Step 5: Commit Task 1**

```bash
git add desktop/src/windows/main/utils/knowledge_blocks_v2.ts desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "feat(knowledge): introduce block document v2 schema" -m "Add an internal block document schema that can migrate existing V1 pages while preserving Markdown and search-text derivation."
```

## Task 2: Route Block Save Payloads Through V2 Codec

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`
- Modify: `desktop/src/windows/main/stores/knowledge_store.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Extend codec verification**

Add this check after the Task 1 V2 tests:

```js
function testBlockCodecWritesVersionTwoJson() {
  const document = createDefaultBlockDocumentV2('Codec title');
  const payload = createBlockSavePayload(document, undefined);
  const parsed = JSON.parse(payload.contentJson);
  assert.equal(parsed.version, 2);
  assert.match(payload.contentMarkdown, /Codec title/);
  assert.match(payload.contentText, /Codec title/);
}

testBlockCodecWritesVersionTwoJson();
```

- [ ] **Step 2: Update codec imports and function type**

In `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`, replace block V1 derivation imports with:

```ts
import type { KnowledgeBlockDocumentV2 } from '../../../utils/knowledge_blocks_v2';
import {
  blockDocumentV2ToMarkdown,
  blockDocumentV2ToPlainText,
  normalizeBlockDocumentV2,
  serializeBlockDocumentV2,
} from '../../../utils/knowledge_blocks_v2';
```

Change `createBlockSavePayload` to accept both versions:

```ts
export function createBlockSavePayload(
  document: KnowledgeBlockDocument | KnowledgeBlockDocumentV2,
  existingPropertiesJson?: string,
): UpdateKnowledgePagePayload {
  const normalized = normalizeBlockDocumentV2(document);
  return {
    contentJson: serializeBlockDocumentV2(normalized),
    contentText: blockDocumentV2ToPlainText(normalized),
    contentMarkdown: blockDocumentV2ToMarkdown(normalized),
    propertiesJson: existingPropertiesJson || JSON.stringify(defaultBlockProperties),
  };
}
```

- [ ] **Step 3: Update store draft type**

In `desktop/src/windows/main/stores/knowledge_store.ts`, import:

```ts
import type { KnowledgeBlockDocumentV2 } from '@/windows/main/utils/knowledge_blocks_v2';
import {
  createDefaultBlockDocumentV2,
  parseKnowledgeBlockDocumentV2,
} from '@/windows/main/utils/knowledge_blocks_v2';
```

Change:

```ts
const blockDraft = ref<KnowledgeBlockDocument>(createDefaultBlockDocument());
```

to:

```ts
const blockDraft = ref<KnowledgeBlockDocumentV2>(createDefaultBlockDocumentV2());
```

Update `syncBlockDraft`, `createBlockPage`, and dirty comparison to use V2 parse/create helpers.

- [ ] **Step 4: Run verification and build**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

Expected: all exit code 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts desktop/src/windows/main/stores/knowledge_store.ts desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "refactor(knowledge): save block pages through v2 codec" -m "Route block page persistence through the V2 document normalizer while keeping existing V1 pages readable."
```

## Task 3: Split Block Renderer Components

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`
- Create: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockHandle.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`

- [ ] **Step 1: Create block handle**

Create `KnowledgeBlockHandle.vue`:

```vue
<script setup lang="ts">
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';

defineProps<{ disabledUp?: boolean; disabledDown?: boolean }>();

const emit = defineEmits<{
  (event: 'move-up'): void;
  (event: 'move-down'): void;
  (event: 'duplicate'): void;
  (event: 'remove'): void;
}>();
</script>

<template>
  <div class="knowledge-block-handle" aria-label="块操作">
    <UiIconButton size="xs" title="上移" :disabled="disabledUp" @click="emit('move-up')">
      <IconRenderer icon="iconify:lucide:arrow-up" :size="13" />
    </UiIconButton>
    <UiIconButton size="xs" title="下移" :disabled="disabledDown" @click="emit('move-down')">
      <IconRenderer icon="iconify:lucide:arrow-down" :size="13" />
    </UiIconButton>
    <UiIconButton size="xs" title="复制" @click="emit('duplicate')">
      <IconRenderer icon="iconify:lucide:copy" :size="13" />
    </UiIconButton>
    <UiIconButton size="xs" title="删除" @click="emit('remove')">
      <IconRenderer icon="iconify:lucide:trash-2" :size="13" />
    </UiIconButton>
  </div>
</template>
```

- [ ] **Step 2: Create block renderer**

Create `KnowledgeBlockRenderer.vue` with one renderer entry point and per-type controls. Use `content[0].text` for this phase; do not implement nested rendering until Task 6.

- [ ] **Step 3: Replace inline block template**

In `KnowledgeBlockEditor.vue`, replace the current large `v-for` block template with:

```vue
<KnowledgeBlockRenderer
  v-for="(block, index) in documentDraft.blocks"
  :key="block.id"
  :block="block"
  :index="index"
  :is-first="index === 0"
  :is-last="index === documentDraft.blocks.length - 1"
  @update="patchBlock(block.id, $event)"
  @insert-after="insertBlockAfter(block.id, $event)"
  @move-up="moveBlock(block.id, -1)"
  @move-down="moveBlock(block.id, 1)"
  @duplicate="duplicateBlock(block.id)"
  @remove="removeBlock(block.id)"
/>
```

- [ ] **Step 4: Run renderer build**

```bash
pnpm --dir desktop run build:renderer
```

Expected: Vite build succeeds.

- [ ] **Step 5: Commit Task 3**

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue desktop/src/windows/main/pages/Knowledge/components/block
git commit -m "refactor(knowledge): split block editor renderers" -m "Move block item rendering and handles into focused components before adding Notion-like editing behavior."
```

## Task 4: Add Slash Menu Insertion

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeSlashMenu.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`

- [ ] **Step 1: Create teleported slash menu**

Create a fixed-position menu that receives `{ x, y, query }`, filters block types, and emits `select`.

- [ ] **Step 2: Detect slash command in block input**

In `KnowledgeBlockRenderer.vue`, when a paragraph input becomes exactly `/` or starts with `/he`, emit:

```ts
emit('slash-open', {
  blockId: props.block.id,
  query: nextValue.slice(1),
  rect: inputElement.value?.getBoundingClientRect(),
});
```

- [ ] **Step 3: Insert selected block type**

In `KnowledgeBlockEditor.vue`, handle menu selection by converting the active block when it only contains slash text; otherwise insert after the active block.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run build:renderer
pnpm --dir desktop run lint
```

- [ ] **Step 5: Commit Task 4**

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue desktop/src/windows/main/pages/Knowledge/components/block
git commit -m "feat(knowledge): add block slash insertion menu" -m "Provide a Notion-like command menu for inserting and converting common block types."
```

## Task 5: Add Keyboard Block Operations

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
- Modify: `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`

- [ ] **Step 1: Add pure operations**

Add these exported functions to `knowledge_blocks_v2.ts`:

```ts
export function insertBlockAfter(blocks: KnowledgeBlockV2[], blockId: string, block: KnowledgeBlockV2): KnowledgeBlockV2[] {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index < 0) return [...blocks, block];
  return [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)];
}

export function removeBlockById(blocks: KnowledgeBlockV2[], blockId: string): KnowledgeBlockV2[] {
  const next = blocks.filter((block) => block.id !== blockId);
  return next.length ? next : [createBlockV2('paragraph')];
}
```

- [ ] **Step 2: Wire Enter and Backspace**

Renderer key behavior:

- `Enter` on text blocks inserts a paragraph after the current block.
- `Backspace` on an empty block removes it and focuses the previous block.
- `Tab` / `Shift+Tab` is reserved for nesting in Task 6 and should be prevented only when nesting is implemented.

- [ ] **Step 3: Run build and manual checks**

```bash
pnpm --dir desktop run build:renderer
```

Manual checks:

- Add paragraph, heading, task, code via Enter/slash.
- Backspace removes an empty paragraph.
- Existing asset blocks still open asset actions.

- [ ] **Step 4: Commit Task 5**

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue desktop/src/windows/main/pages/Knowledge/components/block desktop/src/windows/main/utils/knowledge_blocks_v2.ts
git commit -m "feat(knowledge): support keyboard block editing" -m "Add the first Notion-like keyboard operations while keeping storage changes pure and testable."
```

## Task 6: Add Nested Blocks and Indent Controls

**Files:**
- Modify: `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add nested operation tests**

Add verification for indenting one paragraph under the previous heading and outdenting it back to root.

- [ ] **Step 2: Implement `indentBlock` and `outdentBlock`**

Keep these pure and tree-based. Do not mutate the original `blocks` array.

- [ ] **Step 3: Wire Tab and Shift+Tab**

In renderer keydown:

- `Tab` emits `indent`.
- `Shift+Tab` emits `outdent`.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run build:renderer
```

- [ ] **Step 5: Commit Task 6**

```bash
git add desktop/src/windows/main/utils/knowledge_blocks_v2.ts desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "feat(knowledge): add nested block operations" -m "Support basic block tree editing so structured pages can represent Notion-like hierarchy."
```

## Final Verification

- [ ] Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

- [ ] Manual smoke:
  - Create a block page.
  - Insert blocks with slash menu.
  - Move, duplicate, delete, indent, outdent.
  - Save and reopen; confirm content/search text remains.
  - Import Markdown and verify lossiness badge still appears.

## Deferred

- Tiptap integration.
- Rich inline mark editor toolbar.
- Table editing beyond schema placeholder.
- Drag-and-drop reorder if keyboard/handle reorder is stable first.
