# Knowledge Canvas Editor V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current SVG Knowledge canvas into a OneNote-like spatial editor with pan/zoom, multi-select, richer element schema, image paste, text editing, and stable export/search derivation.

**Architecture:** Keep the current SVG-based renderer for this phase and add focused composables/utilities around it. Introduce Canvas Document V2 as a normalized schema while keeping V1 read compatibility through migration in renderer utilities and the document codec.

**Tech Stack:** Vue 3, TypeScript, SVG, current GuYanTools UI components, existing Knowledge asset upload pipeline, no new runtime dependency.

---

## Foundation Readiness Gate

- `pnpm --dir desktop run verify:knowledge-editor` must pass.
- `pnpm --dir desktop run lint` must pass.
- `pnpm --dir desktop run build:renderer` must pass.
- Confirm generated fixtures under `desktop/tmp` remain untracked and are not staged.

## File Structure

- Create `desktop/src/windows/main/utils/knowledge_canvas_v2.ts`
  - V2 schema, V1 migration, normalize, serialize, Markdown/plain-text derivation.
- Create `desktop/src/windows/main/pages/Knowledge/composables/useCanvasViewport.ts`
  - Pan/zoom transform, pointer-to-canvas coordinates, wheel zoom.
- Create `desktop/src/windows/main/pages/Knowledge/composables/useCanvasSelection.ts`
  - Single select, multi-select, marquee rectangle, move selected elements.
- Create `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`
  - Element renderer for text/image/rect/arrow/path/page_card/todo_card/file/group.
- Create `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasToolbar.vue`
  - Tools, zoom controls, alignment, delete/duplicate.
- Modify `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`
  - Use V2 composables/components and remove oversized inline logic.
- Modify `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`
  - Save canvas pages through V2 normalization and derivation.
- Modify `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - Add V2 migration/serialization/derivation checks.

## Task 1: Add Canvas V2 Schema and Migration

**Files:**
- Create: `desktop/src/windows/main/utils/knowledge_canvas_v2.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add failing verification**

Append before final `console.log`:

```js
const {
  createDefaultCanvasDocumentV2,
  migrateCanvasDocumentToV2,
  serializeCanvasDocumentV2,
  parseKnowledgeCanvasDocumentV2,
  canvasDocumentV2ToMarkdown,
  canvasDocumentV2ToPlainText,
} = require('../src/windows/main/utils/knowledge_canvas_v2.ts');

function testCanvasV2DefaultDocument() {
  const document = createDefaultCanvasDocumentV2('Canvas V2');
  assert.equal(document.type, 'guyantools.canvas-page');
  assert.equal(document.version, 2);
  assert.equal(document.elements[0].type, 'rich_text');
}

function testCanvasV1MigratesToV2() {
  const v1 = createDefaultCanvasDocument('Migrated canvas');
  const v2 = migrateCanvasDocumentToV2(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.elements[0].text, 'Migrated canvas');
}

function testCanvasV2RoundTripAndDerivedText() {
  const document = createDefaultCanvasDocumentV2('Round trip canvas');
  const parsed = parseKnowledgeCanvasDocumentV2(serializeCanvasDocumentV2(document), 'Fallback');
  assert.match(canvasDocumentV2ToPlainText(parsed), /Round trip canvas/);
  assert.match(canvasDocumentV2ToMarkdown(parsed), /Round trip canvas/);
}

testCanvasV2DefaultDocument();
testCanvasV1MigratesToV2();
testCanvasV2RoundTripAndDerivedText();
```

- [ ] **Step 2: Confirm expected failure**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
Cannot find module '../src/windows/main/utils/knowledge_canvas_v2.ts'
```

- [ ] **Step 3: Implement V2 schema utility**

Create `knowledge_canvas_v2.ts` with these exports:

```ts
import type { KnowledgeCanvasDocument, KnowledgeCanvasElement, KnowledgeCanvasPoint } from '@/contracts/knowledge';
import { createCanvasElement, normalizeCanvasDocument } from './knowledge_canvas';

export type KnowledgeCanvasElementV2Type =
  | 'rich_text'
  | 'image'
  | 'rect'
  | 'arrow'
  | 'path'
  | 'file'
  | 'page_card'
  | 'todo_card'
  | 'group';

export interface KnowledgeCanvasElementV2 {
  id: string;
  type: KnowledgeCanvasElementV2Type;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation?: number;
  locked?: boolean;
  text?: string;
  title?: string;
  points?: KnowledgeCanvasPoint[];
  style?: Record<string, unknown>;
  refs?: {
    assetId?: string;
    pageId?: string;
    todoId?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeCanvasViewportV2 {
  x: number;
  y: number;
  zoom: number;
}

export interface KnowledgeCanvasDocumentV2 {
  type: 'guyantools.canvas-page';
  version: 2;
  width: number;
  height: number;
  viewport: KnowledgeCanvasViewportV2;
  elements: KnowledgeCanvasElementV2[];
  updatedAt: string;
}

export function createDefaultCanvasDocumentV2(title = '画布页面'): KnowledgeCanvasDocumentV2 {
  return normalizeCanvasDocumentV2({
    type: 'guyantools.canvas-page',
    version: 2,
    width: 1800,
    height: 1200,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    updatedAt: new Date().toISOString(),
    elements: [createCanvasElementV2('rich_text', { text: title, title: '标题', width: 360, height: 90 })],
  });
}

export function createCanvasElementV2(
  type: KnowledgeCanvasElementV2Type,
  input: Partial<KnowledgeCanvasElementV2> = {},
): KnowledgeCanvasElementV2 {
  const now = new Date().toISOString();
  return {
    id: input.id || createCanvasElement(type === 'rich_text' ? 'text' : type === 'file' || type === 'page_card' || type === 'todo_card' || type === 'group' ? 'rect' : type).id,
    type,
    x: input.x ?? 120,
    y: input.y ?? 120,
    width: input.width ?? 260,
    height: input.height ?? 96,
    zIndex: input.zIndex ?? 0,
    rotation: input.rotation,
    locked: input.locked,
    text: input.text ?? '',
    title: input.title,
    points: input.points,
    style: input.style,
    refs: input.refs,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function migrateCanvasDocumentToV2(document: KnowledgeCanvasDocument): KnowledgeCanvasDocumentV2 {
  const normalized = normalizeCanvasDocument(document);
  return normalizeCanvasDocumentV2({
    type: 'guyantools.canvas-page',
    version: 2,
    width: normalized.width,
    height: normalized.height,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    updatedAt: normalized.updatedAt,
    elements: normalized.elements.map((element, index) => migrateElement(element, index)),
  });
}

export function parseKnowledgeCanvasDocumentV2(value?: string | null, fallbackTitle?: string): KnowledgeCanvasDocumentV2 {
  if (!value) return createDefaultCanvasDocumentV2(fallbackTitle);
  try {
    return normalizeCanvasDocumentV2(JSON.parse(value) as unknown, fallbackTitle);
  } catch {
    return createDefaultCanvasDocumentV2(fallbackTitle);
  }
}

export function normalizeCanvasDocumentV2(value: unknown, fallbackTitle?: string): KnowledgeCanvasDocumentV2 {
  const source = isRecord(value) ? value : {};
  if (source.version !== 2) return migrateCanvasDocumentToV2(normalizeCanvasDocument(value, fallbackTitle));
  const elements = Array.isArray(source.elements)
    ? source.elements.map(normalizeCanvasElementV2).filter((element): element is KnowledgeCanvasElementV2 => Boolean(element))
    : [];
  return {
    type: 'guyantools.canvas-page',
    version: 2,
    width: normalizeNumber(source.width, 1800, 640, 6000),
    height: normalizeNumber(source.height, 1200, 480, 6000),
    viewport: normalizeViewport(source.viewport),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    elements: elements.length ? elements : createDefaultCanvasDocumentV2(fallbackTitle).elements,
  };
}

export function serializeCanvasDocumentV2(document: KnowledgeCanvasDocumentV2): string {
  return JSON.stringify({ ...normalizeCanvasDocumentV2(document), updatedAt: new Date().toISOString() });
}

export function canvasDocumentV2ToPlainText(document: KnowledgeCanvasDocumentV2): string {
  return normalizeCanvasDocumentV2(document).elements
    .map((element) => [element.text, element.title, element.refs?.assetId, element.refs?.pageId, element.refs?.todoId].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

export function canvasDocumentV2ToMarkdown(document: KnowledgeCanvasDocumentV2): string {
  return normalizeCanvasDocumentV2(document).elements
    .map((element) => `- [${element.type}] ${[element.title, element.text].filter(Boolean).join(' ')}`.trim())
    .filter(Boolean)
    .join('\n');
}

function migrateElement(element: KnowledgeCanvasElement, index: number): KnowledgeCanvasElementV2 {
  return createCanvasElementV2(element.type === 'text' ? 'rich_text' : element.type, {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width ?? 260,
    height: element.height ?? 96,
    zIndex: index,
    text: element.text,
    title: element.title,
    points: element.points,
    style: {
      stroke: element.stroke,
      fill: element.fill,
      strokeWidth: element.strokeWidth,
      assetName: element.assetName,
      assetMimeType: element.assetMimeType,
      assetUrl: element.assetUrl,
    },
    refs: {
      assetId: element.assetId,
      pageId: element.pageId,
      todoId: element.todoId,
    },
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  });
}

function normalizeCanvasElementV2(value: unknown): KnowledgeCanvasElementV2 | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return null;
  return createCanvasElementV2(value.type as KnowledgeCanvasElementV2Type, {
    ...value,
    x: normalizeNumber(value.x, 120, -10000, 10000),
    y: normalizeNumber(value.y, 120, -10000, 10000),
    width: normalizeNumber(value.width, 260, 1, 4000),
    height: normalizeNumber(value.height, 96, 1, 4000),
    zIndex: normalizeNumber(value.zIndex, 0, -100000, 100000),
  });
}

function normalizeViewport(value: unknown): KnowledgeCanvasViewportV2 {
  const source = isRecord(value) ? value : {};
  return {
    x: normalizeNumber(source.x, 0, -10000, 10000),
    y: normalizeNumber(source.y, 0, -10000, 10000),
    zoom: normalizeNumber(source.zoom, 0.85, 0.1, 4),
  };
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(number, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec eslint src/windows/main/utils/knowledge_canvas_v2.ts
```

- [ ] **Step 5: Commit Task 1**

```bash
git add desktop/src/windows/main/utils/knowledge_canvas_v2.ts desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "feat(knowledge): introduce canvas document v2 schema" -m "Add a richer canvas schema that can migrate existing SVG canvas pages and preserve search/export derivation."
```

## Task 2: Route Canvas Codec Through V2

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`
- Modify: `desktop/src/windows/main/stores/knowledge_store.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add codec verification**

Add:

```js
function testCanvasCodecWritesVersionTwoJson() {
  const document = createDefaultCanvasDocumentV2('Codec canvas');
  const payload = createCanvasSavePayload(document, undefined);
  assert.equal(JSON.parse(payload.contentJson).version, 2);
  assert.match(payload.contentMarkdown, /Codec canvas/);
  assert.match(payload.contentText, /Codec canvas/);
}

testCanvasCodecWritesVersionTwoJson();
```

- [ ] **Step 2: Update codec**

Import and use:

```ts
import type { KnowledgeCanvasDocumentV2 } from '../../../utils/knowledge_canvas_v2';
import {
  canvasDocumentV2ToMarkdown,
  canvasDocumentV2ToPlainText,
  normalizeCanvasDocumentV2,
  serializeCanvasDocumentV2,
} from '../../../utils/knowledge_canvas_v2';
```

Change `createCanvasSavePayload` to normalize V1/V2 input and serialize V2.

- [ ] **Step 3: Update store draft**

Use `KnowledgeCanvasDocumentV2`, `createDefaultCanvasDocumentV2`, and `parseKnowledgeCanvasDocumentV2` in `knowledge_store.ts`.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

- [ ] **Step 5: Commit Task 2**

```bash
git add desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts desktop/src/windows/main/stores/knowledge_store.ts desktop/scripts/verify-knowledge-editor-foundation.cjs
git commit -m "refactor(knowledge): save canvas pages through v2 codec" -m "Route canvas persistence through V2 normalization while keeping existing canvas JSON readable."
```

## Task 3: Add Pan and Zoom Viewport

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/composables/useCanvasViewport.ts`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`

- [ ] **Step 1: Create viewport composable**

Implement:

```ts
import { computed, ref } from 'vue';

export function useCanvasViewport(initial = { x: 0, y: 0, zoom: 0.85 }) {
  const viewport = ref(initial);
  const transform = computed(() => `translate(${viewport.value.x} ${viewport.value.y}) scale(${viewport.value.zoom})`);

  function zoomAt(delta: number) {
    viewport.value = {
      ...viewport.value,
      zoom: Math.min(Math.max(viewport.value.zoom + delta, 0.1), 4),
    };
  }

  function panBy(dx: number, dy: number) {
    viewport.value = { ...viewport.value, x: viewport.value.x + dx, y: viewport.value.y + dy };
  }

  function clientToCanvas(rect: DOMRect, clientX: number, clientY: number) {
    return {
      x: (clientX - rect.left - viewport.value.x) / viewport.value.zoom,
      y: (clientY - rect.top - viewport.value.y) / viewport.value.zoom,
    };
  }

  return { viewport, transform, zoomAt, panBy, clientToCanvas };
}
```

- [ ] **Step 2: Wire wheel zoom and space/middle pan**

Update the SVG root in `KnowledgeCanvasEditor.vue` so wheel changes zoom and pointer drag pans only when spacebar or middle mouse is active.

- [ ] **Step 3: Persist viewport in document**

On viewport changes, emit an updated `KnowledgeCanvasDocumentV2` with `viewport`.

- [ ] **Step 4: Verify**

```bash
pnpm --dir desktop run build:renderer
```

- [ ] **Step 5: Commit Task 3**

```bash
git add desktop/src/windows/main/pages/Knowledge/composables/useCanvasViewport.ts desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue
git commit -m "feat(knowledge): add canvas pan and zoom viewport" -m "Make canvas navigation spatial and persist viewport state in the V2 document."
```

## Task 4: Add Selection and Multi-Element Move

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/composables/useCanvasSelection.ts`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`

- [ ] **Step 1: Create selection composable**

Support `selectedIds`, `toggleSelection`, `replaceSelection`, `clearSelection`, and `moveSelected(elements, dx, dy)`.

- [ ] **Step 2: Add marquee selection**

When select tool drags on empty canvas, draw a translucent selection rectangle and select intersecting elements on pointer up.

- [ ] **Step 3: Move selected elements**

Dragging any selected element moves all selected elements together.

- [ ] **Step 4: Verify manually**

Create three elements, marquee select two, drag them, save, reopen.

- [ ] **Step 5: Commit Task 4**

```bash
git add desktop/src/windows/main/pages/Knowledge/composables/useCanvasSelection.ts desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue
git commit -m "feat(knowledge): support canvas multi-select" -m "Add marquee selection and grouped movement for OneNote-like spatial editing."
```

## Task 5: Split Canvas Element Renderer and Toolbar

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`
- Create: `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasToolbar.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`

- [ ] **Step 1: Move element rendering**

Create one component that renders `rich_text`, `image`, `rect`, `arrow`, `path`, `file`, `page_card`, `todo_card`, and `group` from V2 elements.

- [ ] **Step 2: Move toolbar**

Create a toolbar component with select/text/rect/arrow/path/image tools, zoom, delete, duplicate, bring front, send back.

- [ ] **Step 3: Verify no visual regression**

```bash
pnpm --dir desktop run build:renderer
pnpm --dir desktop run lint
```

- [ ] **Step 4: Commit Task 5**

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue desktop/src/windows/main/pages/Knowledge/components/canvas
git commit -m "refactor(knowledge): split canvas renderer components" -m "Keep canvas interaction logic readable before adding richer OneNote-like element behavior."
```

## Task 6: Add Inline Text Editing and Image Paste Placement

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`

- [ ] **Step 1: Add rich text editing state**

Double-click `rich_text` enters an inline textarea/foreignObject editor. Escape or blur commits text and exits.

- [ ] **Step 2: Place pasted images at cursor/canvas center**

When clipboard contains an image, emit `asset-file` and create/update an image element positioned at the current pointer location or viewport center.

- [ ] **Step 3: Verify**

Manual checks:

- Double-click text, edit, save, reopen.
- Paste screenshot, confirm an asset-backed image appears.
- Export SVG/PNG still works if those actions exist in current UI.

- [ ] **Step 4: Commit Task 6**

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue
git commit -m "feat(knowledge): add canvas text editing and image paste" -m "Support the first OneNote-like capture workflows for text boxes and screenshots."
```

## Final Verification

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
pnpm --dir desktop run build:renderer
```

Manual smoke:

- Create canvas page.
- Pan/zoom, add text/rect/path/image.
- Multi-select and move.
- Paste screenshot.
- Save/reopen and confirm viewport plus element positions persist.

## Deferred

- tldraw migration.
- High-volume path performance optimization.
- Advanced alignment/distribution guides.
- Handwriting smoothing beyond simple path capture.
