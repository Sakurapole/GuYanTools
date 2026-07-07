# Knowledge Cross-Mode Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create safe converted copies between Markdown, Block, and Canvas pages without overwriting the source page or pretending conversion is lossless.

**Architecture:** Conversion is a store/API workflow that creates a new page copy. Pure conversion utilities produce destination payloads and conversion metadata; UI surfaces show lossiness warnings before dispatching store actions.

**Tech Stack:** Vue 3, TypeScript, Pinia, existing Knowledge page creation/update API, existing Markdown segmenter/block/canvas derivation utilities, no new dependency.

---

## Foundation Readiness Gate

- Markdown foundation plan automated checks must pass.
- Block V2 plan should be completed before shipping Markdown -> Block V2 conversion.
- Canvas V2 plan should be completed before shipping Markdown/Block -> Canvas V2 card conversion.
- If Block V2 or Canvas V2 is not complete, implement this plan against current V1 helpers but keep converter names version-neutral.

## File Structure

- Create `desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts`
  - Pure conversion utilities and lossiness metadata.
- Create `desktop/src/windows/main/pages/Knowledge/components/KnowledgeConversionDialog.vue`
  - Confirmation dialog with source/destination, output title, and risk summary.
- Modify `desktop/src/windows/main/stores/knowledge_store.ts`
  - Adds `convertSelectedPageToMarkdownCopy`, `convertSelectedPageToBlockCopy`, `convertSelectedPageToCanvasCopy`.
- Modify `desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue`
  - Adds conversion entry points in page actions.
- Modify `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - Adds pure converter verification.

## Task 1: Add Conversion Utility and Metadata

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add failing converter tests**

Append before final `console.log`:

```js
const {
  createMarkdownToBlockConversion,
  createBlockToMarkdownConversion,
  createCanvasToMarkdownConversion,
} = require('../src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts');

function testMarkdownToBlockConversionProducesCopyPayload() {
  const result = createMarkdownToBlockConversion({
    title: 'Markdown source',
    markdown: '# Title\n\n- [x] Task',
  });
  assert.equal(result.pageType, 'block');
  assert.match(result.title, /Markdown source/);
  assert.match(result.warning, /可能有损/);
  assert.match(result.payload.contentMarkdown, /Title/);
}

function testBlockToMarkdownConversionProducesMarkdownCopy() {
  const block = createDefaultBlockDocument('Block source');
  const result = createBlockToMarkdownConversion({ title: 'Block source', document: block });
  assert.equal(result.pageType, 'markdown');
  assert.match(result.payload.contentMarkdown, /Block source/);
  assert.match(result.warning, /副本/);
}

function testCanvasToMarkdownConversionProducesSummary() {
  const canvas = createDefaultCanvasDocument('Canvas source');
  const result = createCanvasToMarkdownConversion({ title: 'Canvas source', document: canvas });
  assert.equal(result.pageType, 'markdown');
  assert.match(result.payload.contentMarkdown, /Canvas source/);
  assert.match(result.warning, /摘要/);
}

testMarkdownToBlockConversionProducesCopyPayload();
testBlockToMarkdownConversionProducesMarkdownCopy();
testCanvasToMarkdownConversionProducesSummary();
```

- [ ] **Step 2: Confirm expected failure**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
Cannot find module '../src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts'
```

- [ ] **Step 3: Implement conversion utility**

Create `knowledge_conversion.ts`:

```ts
import type {
  CreateKnowledgePagePayload,
  KnowledgeBlockDocument,
  KnowledgeCanvasDocument,
  KnowledgePageType,
} from '@/contracts/knowledge';
import {
  blockDocumentToMarkdown,
  blockDocumentToPlainText,
  markdownToBlockDocument,
  serializeBlockDocument,
} from '@/windows/main/utils/knowledge_blocks';
import {
  canvasDocumentToMarkdown,
  canvasDocumentToPlainText,
  serializeCanvasDocument,
} from '@/windows/main/utils/knowledge_canvas';

export interface KnowledgeConversionResult {
  pageType: KnowledgePageType;
  title: string;
  warning: string;
  payload: Pick<CreateKnowledgePagePayload, 'pageType' | 'contentMarkdown' | 'contentJson' | 'contentText' | 'propertiesJson'>;
}

export function createMarkdownToBlockConversion(input: {
  title: string;
  markdown: string;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const document = markdownToBlockDocument(input.markdown, input.title);
  return {
    pageType: 'block',
    title: `${input.title} - 块副本`,
    warning: 'Markdown 转块页面可能有损，原页面会保留并创建副本。',
    payload: {
      pageType: 'block',
      contentJson: serializeBlockDocument(document),
      contentMarkdown: blockDocumentToMarkdown(document),
      contentText: blockDocumentToPlainText(document),
      propertiesJson: conversionProperties('markdown', 'block', input.sourcePageId, true),
    },
  };
}

export function createBlockToMarkdownConversion(input: {
  title: string;
  document: KnowledgeBlockDocument;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const markdown = blockDocumentToMarkdown(input.document);
  return {
    pageType: 'markdown',
    title: `${input.title} - Markdown 副本`,
    warning: '将创建 Markdown 副本，原块页面不会被覆盖。',
    payload: {
      pageType: 'markdown',
      contentMarkdown: markdown,
      contentText: blockDocumentToPlainText(input.document),
      propertiesJson: conversionProperties('block', 'markdown', input.sourcePageId, true),
    },
  };
}

export function createCanvasToMarkdownConversion(input: {
  title: string;
  document: KnowledgeCanvasDocument;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const markdown = canvasDocumentToMarkdown(input.document);
  return {
    pageType: 'markdown',
    title: `${input.title} - 画布摘要`,
    warning: '画布只能转换为空间内容摘要，布局不会无损保留。',
    payload: {
      pageType: 'markdown',
      contentMarkdown: markdown,
      contentText: canvasDocumentToPlainText(input.document),
      propertiesJson: conversionProperties('canvas', 'markdown', input.sourcePageId, true),
    },
  };
}

export function createCanvasSummaryPayload(document: KnowledgeCanvasDocument) {
  return {
    contentJson: serializeCanvasDocument(document),
    contentMarkdown: canvasDocumentToMarkdown(document),
    contentText: canvasDocumentToPlainText(document),
  };
}

function conversionProperties(
  sourceType: KnowledgePageType | 'markdown' | 'block' | 'canvas',
  targetType: KnowledgePageType | 'markdown' | 'block' | 'canvas',
  sourcePageId: string | undefined,
  lossy: boolean,
) {
  return JSON.stringify({
    conversion: {
      sourceType,
      targetType,
      sourcePageId,
      lossy,
      convertedAt: new Date().toISOString(),
    },
  });
}
```

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec eslint src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts
```

- [ ] **Step 5: Commit Task 1**

```bash
git add desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "feat(knowledge): add page conversion utilities" -m "Create pure conversion helpers that produce copied page payloads and explicit lossiness metadata."
```

## Task 2: Add Store Conversion Actions

**Files:**
- Modify: `desktop/src/windows/main/stores/knowledge_store.ts`

- [ ] **Step 1: Import converters**

Add:

```ts
import {
  createBlockToMarkdownConversion,
  createCanvasToMarkdownConversion,
  createMarkdownToBlockConversion,
  type KnowledgeConversionResult,
} from '@/windows/main/pages/Knowledge/utils/knowledge_conversion';
```

- [ ] **Step 2: Add private copy creator**

Inside the store, add:

```ts
async function createConvertedPageCopy(result: KnowledgeConversionResult) {
  if (!selectedPage.value) return null;
  saving.value = true;
  try {
    const page = await api().createPage({
      libraryId: activeLibraryId.value || undefined,
      spaceId: selectedPage.value.node.spaceId || activeSpaceId.value || undefined,
      parentId: selectedPage.value.node.parentId,
      title: result.title,
      ...result.payload,
    });
    await refreshTree();
    selectedNodeId.value = page.node.id;
    selectedPage.value = page;
    syncMarkdownDraft(page);
    syncBlockDraft(page);
    syncCanvasDraft(page);
    await refreshSelectedRelations();
    await refreshGraph();
    await refreshOrphanPages();
    return page;
  } catch (err) {
    notifyError(err, '页面转换失败');
    return null;
  } finally {
    saving.value = false;
  }
}
```

- [ ] **Step 3: Add public conversion actions**

Add:

```ts
async function convertSelectedPageToBlockCopy() {
  if (!selectedPage.value || selectedPage.value.page.pageType !== 'markdown') return null;
  return createConvertedPageCopy(createMarkdownToBlockConversion({
    title: selectedPage.value.node.title,
    markdown: selectedPage.value.page.contentMarkdown,
    sourcePageId: selectedPage.value.page.id,
  }));
}

async function convertSelectedPageToMarkdownCopy() {
  if (!selectedPage.value) return null;
  if (selectedPage.value.page.pageType === 'block') {
    return createConvertedPageCopy(createBlockToMarkdownConversion({
      title: selectedPage.value.node.title,
      document: blockDraft.value,
      sourcePageId: selectedPage.value.page.id,
    }));
  }
  if (selectedPage.value.page.pageType === 'canvas') {
    return createConvertedPageCopy(createCanvasToMarkdownConversion({
      title: selectedPage.value.node.title,
      document: canvasDraft.value,
      sourcePageId: selectedPage.value.page.id,
    }));
  }
  return null;
}
```

Expose both in the store return object.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

- [ ] **Step 5: Commit Task 2**

```bash
git add desktop/src/windows/main/stores/knowledge_store.ts
git commit -m "feat(knowledge): add page conversion store actions" -m "Create converted page copies through the existing Knowledge API without mutating source pages."
```

## Task 3: Add Conversion Confirmation Dialog

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeConversionDialog.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue`

- [ ] **Step 1: Create dialog component**

Use existing `UiDialog` and `UiButton`. Props:

```ts
defineProps<{
  open: boolean;
  title: string;
  warning: string;
  confirmLabel: string;
}>();
```

Emits:

```ts
const emit = defineEmits<{
  (event: 'confirm'): void;
  (event: 'close'): void;
}>();
```

Content must clearly state:

```text
将创建一个新页面副本，原页面不会被覆盖。
```

- [ ] **Step 2: Add conversion buttons to page actions**

In `KnowledgePage.vue`, add actions only when selected page type supports them:

- Markdown page: `转换为块页面副本`
- Block page: `导出为 Markdown 副本`
- Canvas page: `导出为 Markdown 摘要`

- [ ] **Step 3: Wire dialog confirmation**

On confirm, call the matching store action and close the dialog only after the promise settles.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run build:renderer
```

Manual checks:

- Markdown -> Block creates a new block page.
- Block -> Markdown creates a new Markdown page.
- Canvas -> Markdown creates a summary page.
- Source page still exists unchanged.

- [ ] **Step 5: Commit Task 3**

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeConversionDialog.vue desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue
git commit -m "feat(knowledge): add conversion confirmation flow" -m "Expose safe page-copy conversions with explicit lossiness warnings in the Knowledge UI."
```

## Task 4: Add Canvas Card Conversion

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts`
- Modify: `desktop/src/windows/main/stores/knowledge_store.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add tests**

Verify Markdown -> Canvas creates text/card elements and records lossiness metadata.

- [ ] **Step 2: Implement Markdown -> Canvas summary**

Use heading lines as text cards, image Markdown as image placeholder cards, and task lines as todo-like cards. If Canvas V2 is not complete, map these to current V1 `text` and `rect` elements.

- [ ] **Step 3: Add store action**

Add `convertSelectedPageToCanvasCopy()` for Markdown and Block sources.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

- [ ] **Step 5: Commit Task 4**

```bash
git add desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts desktop/src/windows/main/stores/knowledge_store.ts desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "feat(knowledge): convert notes into canvas cards" -m "Allow Markdown and block pages to create visual canvas copies without overwriting the source document."
```

## Task 5: Link Conversion Provenance Into Relations

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts`
- Modify: `desktop/src/windows/main/stores/knowledge_store.ts`

- [ ] **Step 1: Add provenance Markdown**

For Markdown destinations, prepend:

```markdown
> [!INFO]
> Converted from [[SOURCE_TITLE]] on YYYY-MM-DD.
```

- [ ] **Step 2: Add source page reference properties**

Ensure `propertiesJson.conversion.sourcePageId` is written for every conversion.

- [ ] **Step 3: Refresh relations**

After creating converted page copies, call relation refreshes already used by page create/save flows:

```ts
await refreshSelectedRelations();
await refreshGraph();
await refreshOrphanPages();
```

- [ ] **Step 4: Verify**

Manual:

- Convert page.
- Confirm graph/backlinks refresh after selecting source and converted page.

- [ ] **Step 5: Commit Task 5**

```bash
git add desktop/src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts desktop/src/windows/main/stores/knowledge_store.ts
git commit -m "feat(knowledge): record conversion provenance" -m "Store source page metadata and visible notes so converted copies remain understandable in graph and search workflows."
```

## Final Verification

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

Manual smoke:

- Markdown -> Block copy.
- Block -> Markdown copy.
- Markdown -> Canvas copy.
- Canvas -> Markdown summary.
- Confirm original pages are unchanged.
- Confirm converted pages are searchable and have provenance metadata.

## Deferred

- Lossless rich-text conversion.
- Deduplication UI for repeated conversions.
- Conversion preview diff.
- Full Canvas spatial layout reconstruction from Markdown/Block.
