# Knowledge Notion-like and OneNote-like Formats Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing block and canvas V2 foundations into two basically usable Knowledge formats: a Notion-like structured block page and a OneNote-like spatial canvas page.

**Architecture:** Keep the current Vue 3 + TypeScript implementation and avoid new editor dependencies in this pass. Harden the existing V2 schemas, align editor toolbars with supported element/block types, add missing editing operations, and keep persistence/search/export derivation flowing through `knowledge_document_codec.ts`.

**Tech Stack:** Electron renderer, Vue 3 Composition API, TypeScript, existing GuYanTools UI components, SVG, existing Knowledge asset pipeline, no new runtime dependencies.

---

## Current Findings

The repository already contains the important base pieces:

- `desktop/src/windows/main/utils/knowledge_blocks_v2.ts` defines `KnowledgeBlockDocumentV2`, migration from V1, Markdown/text derivation, and pure tree operations.
- `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue` uses V2 state, slash insertion, recursive block rendering, file attachment events, and save emission.
- `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue` renders headings, tasks, code, tables, assets, nested children, and block handle actions.
- `desktop/src/windows/main/utils/knowledge_canvas_v2.ts` defines `KnowledgeCanvasDocumentV2`, migration from V1, viewport, z-index, refs, asset attachment, duplication, Markdown/text derivation.
- `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue` supports pan/zoom, marquee select, multi-drag, text/image/rect/arrow/path insertion, paste image, inline text edit, inspector, export SVG/PNG, and save emission.
- `desktop/scripts/verify-knowledge-editor-foundation.cjs` already checks V2 schema, codec, conversion, table renderer anchors, and Markdown editor foundation.

Main gaps preventing "basically usable" status:

- Block toolbar and slash menu are inconsistent: the renderer supports `toggle`, `table`, `todo_reference`, and `page_reference`, but the top insert menu omits several of them.
- `toggle`, `page_reference`, and `todo_reference` render as generic text areas instead of useful structured blocks.
- Block Markdown/text derivation does not give `toggle` and `table` first-class output semantics.
- Canvas toolbar only exposes `select`, `text`, `rect`, `arrow`, `path`, `image`; schema already supports `file`, `page_card`, `todo_card`, and `group`.
- Canvas elements can be moved but not resized directly on the canvas, which makes free spatial layout feel unfinished.
- Canvas locking exists in schema but is not represented in editor operations or inspector controls.
- Verification does not yet assert the newly required usability markers.

## File Structure

- Modify `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - Add static and behavior checks for complete block/canvas V2 usability.
- Modify `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
  - Add first-class Markdown/plain-text derivation for table and toggle.
  - Preserve child text under toggles and table content.
- Modify `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
  - Use one complete block-type catalog for toolbar and slash menu.
  - Include table/toggle/page/Todo reference in insertion surface.
- Modify `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`
  - Render toggle/page/Todo references as structured controls.
  - Keep table cells editable and safe for Markdown export.
- Modify `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasToolbar.vue`
  - Add tools for file card, page card, Todo card, and group.
  - Keep labels compact and icon-led.
- Modify `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`
  - Add the new canvas tools, locked-element protections, resize handles, inspector lock toggle, and better card defaults.
- Modify `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`
  - Render card variants distinctly enough to be readable.
  - Emit resize handle events.

## Task 1: Lock Completion Requirements With Verification

**Files:**
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Add failing static checks**

Add checks that assert:

- Block editor insertion catalog contains `toggle`, `table`, `page_reference`, and `todo_reference`.
- Block renderer has explicit branches for `toggle`, `page_reference`, and `todo_reference`.
- Block V2 Markdown derivation branches on `table` and `toggle`.
- Canvas toolbar `CanvasTool` includes `file`, `page_card`, `todo_card`, and `group`.
- Canvas editor has a resize flow and checks `locked`.
- Canvas renderer emits a resize start event and renders type-specific card labels.

- [ ] **Step 2: Run verification and confirm it fails**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected before implementation: at least one assertion fails for missing block/canvas usability markers.

## Task 2: Complete Notion-like Block Format

**Files:**
- Modify: `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`

- [ ] **Step 1: Complete block type catalog**

Create one catalog in `KnowledgeBlockEditor.vue` that includes:

`paragraph`, `heading`, `bullet_list`, `ordered_list`, `task_list`, `toggle`, `code`, `quote`, `callout`, `table`, `divider`, `image`, `attachment`, `todo_reference`, `page_reference`.

Use it for both toolbar insertion and slash menu options.

- [ ] **Step 2: Give special blocks real renderers**

In `KnowledgeBlockRenderer.vue`:

- `toggle`: show a disclosure control, title input, and nested child area.
- `page_reference`: show page ref input plus a visible page-card shell.
- `todo_reference`: show Todo id/title input plus a Todo-card shell.

Keep existing generic text editing for paragraph/list/quote/callout.

- [ ] **Step 3: Derive useful Markdown and text**

In `knowledge_blocks_v2.ts`:

- `table`: preserve Markdown table source when present.
- `toggle`: export as a `<details><summary>...</summary>...</details>` block with child Markdown.
- `page_reference`: export as `[[title-or-id]]`.
- `todo_reference`: export as task-like Markdown.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec eslint src/windows/main/utils/knowledge_blocks_v2.ts src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue
```

## Task 3: Complete OneNote-like Canvas Format

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasToolbar.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`

- [ ] **Step 1: Add missing schema-backed tools**

Extend `CanvasTool` with:

`file`, `page_card`, `todo_card`, `group`.

Add toolbar buttons with lucide icons and short Chinese labels.

- [ ] **Step 2: Add good defaults**

When creating:

- `page_card`: title `页面卡片`, text `输入页面标题或选择已有页面`.
- `todo_card`: title `Todo 卡片`, text `记录待办或关联 Todo ID`.
- `file`: title `文件卡片`, text `关联附件后显示文件信息`.
- `group`: title `分组`, text `用于框住一组画布元素`.

- [ ] **Step 3: Add lock-aware editing**

Locked elements:

- cannot be dragged.
- cannot be resized.
- cannot be deleted.
- show locked state in inspector.

The inspector gets a checkbox for `locked`.

- [ ] **Step 4: Add resize handles**

For selected unlocked elements, render a bottom-right resize handle. Dragging it updates width/height with minimum dimensions and keeps the element selected.

- [ ] **Step 5: Improve card rendering**

Render `page_card`, `todo_card`, `file`, and `group` with readable labels inside the existing product UI token system.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop exec eslint src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasToolbar.vue src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue
```

## Task 4: Integrated Validation

**Files:**
- No additional planned files.

- [ ] **Step 1: Run focused verification**

```bash
pnpm --dir desktop run verify:knowledge-editor
```

- [ ] **Step 2: Run desktop lint**

```bash
pnpm --dir desktop run lint
```

- [ ] **Step 3: Run TypeScript compile check if lint is not enough**

```bash
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
```

- [ ] **Step 4: Manual smoke matrix**

- Create a block page.
- Insert every block type from the top toolbar and slash menu.
- Edit table cells, toggle title/body, page reference, Todo reference.
- Save/reopen and confirm JSON version remains `2`.
- Create a canvas page.
- Insert text, rect, arrow, path, image, file, page card, Todo card, and group.
- Drag, multi-select, resize, lock, attempt delete while locked, unlock, delete.
- Save/reopen and confirm positions, sizes, viewport, and refs persist.

## Deferred

- Tiptap/ProseMirror migration.
- True rich inline marks toolbar for block pages.
- Drag-and-drop block reorder.
- Canvas alignment/distribution guides.
- Advanced handwriting smoothing and eraser.
- tldraw migration.
