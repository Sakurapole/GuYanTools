# Knowledge Notion-like Editor Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Knowledge block page editor from a form-like block renderer into a Notion-like continuous block writing surface with keyboard-first editing, hover handles, slash command flow, drag reorder, and persistent inline marks.

**Architecture:** Keep the existing `KnowledgeBlockDocumentV2` persistence model and Vue renderer boundary, but replace text-entry blocks that currently use `UiInput`/`UiTextarea` with contenteditable block bodies. Introduce focused DOM helpers for inline content serialization, block splitting/merging, drag movement, and slash command keyboard control instead of adding a new editor dependency.

**Tech Stack:** Electron renderer, Vue 3 Composition API, TypeScript, existing GuYanTools UI tokens/components, DOM `contenteditable`, existing `desktop/scripts/verify-knowledge-editor-foundation.cjs` verifier.

---

## Current Evidence

- `KnowledgeBlockRenderer.vue` renders primary block text with `UiInput` and `UiTextarea`, so blocks behave like isolated form fields instead of a continuous document.
- `updateText()` rewrites content as a single `{ type: 'text', text }` node, so existing `marks` in `KnowledgeBlockDocumentV2` are not preserved through editing.
- `KnowledgeBlockHandle.vue` exposes a permanent icon-button strip with up/down buttons instead of a hover block handle with plus, grip, drag, and a compact command menu.
- `KnowledgeSlashMenu.vue` filters block types but has no active item, arrow-key navigation, Enter selection, Escape close, or grouped Notion-style commands.
- The previous completion plan explicitly deferred Tiptap/ProseMirror, true rich inline marks, and drag-and-drop block reorder. Those are the exact reasons the page does not feel Notion-like.

## Target Experience

The first useful Notion-like milestone is not a pixel-perfect clone. It is a writing surface where the user can:

- Click into a page and type directly into blocks without seeing normal form-field chrome.
- Press `Enter` to split/create blocks, `Backspace` on an empty block to remove or merge backward, and `Tab` / `Shift+Tab` to indent or outdent.
- Type Markdown shortcuts such as `# `, `## `, `- `, `1. `, `[] `, `> `, and ``` to convert the current block.
- Type `/`, use arrow keys to move through block commands, press `Enter` to select, and press `Escape` to close.
- Hover a block to reveal a left-side plus button and drag grip; drag the grip to reorder blocks.
- Select text and use a small inline toolbar, or keyboard shortcuts, to persist bold, italic, strike, and inline code marks.
- Keep special blocks such as toggle, table, image, attachment, page reference, and Todo reference functional inside the same document surface.

## File Structure

- Modify `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - Add red tests for contenteditable editing, inline marks, slash keyboard flow, hover handle, and drag reorder.
- Create `desktop/src/windows/main/pages/Knowledge/utils/knowledge_block_editing.ts`
  - Convert inline V2 content to editable HTML and DOM back to inline V2 content.
  - Provide plain-text helpers used by the renderer and tests.
- Modify `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
  - Add block split, merge-backward, and arbitrary block move helpers.
  - Expand inline mark model with optional links only if needed by the renderer.
- Modify `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
  - Remove the always-visible block insertion toolbar.
  - Add editor-level drag/drop state, split/merge handlers, command selection, and focus restoration.
- Modify `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`
  - Replace primary `UiInput`/`UiTextarea` editing with contenteditable body nodes.
  - Keep `UiInput` only for secondary metadata fields such as code language and reference IDs.
  - Add selection toolbar, beforeinput/input handling, keyboard shortcut handling, and drag events.
- Modify `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockHandle.vue`
  - Replace the permanent multi-button strip with a compact hover handle containing plus and draggable grip.
- Modify `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeSlashMenu.vue`
  - Add active-item state, keyboard navigation, command grouping metadata, and Enter/Escape behavior.

## Task 1: Lock Notion-like Contract With Failing Verification

**Files:**
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [x] **Step 1: Add static checks**

Assert that:

- `KnowledgeBlockRenderer.vue` uses `contenteditable`.
- Primary generic block editing no longer relies on `UiTextarea`.
- `KnowledgeBlockRenderer.vue` emits `split-block`, `merge-backward`, and `apply-inline-mark`.
- `KnowledgeBlockRenderer.vue` handles `beforeinput`, `compositionstart`, and `compositionend`.
- `KnowledgeBlockHandle.vue` exposes a draggable grip and a plus insertion control.
- `KnowledgeSlashMenu.vue` has `activeIndex`, `ArrowDown`, `ArrowUp`, `Enter`, and `Escape` handling.
- `KnowledgeBlockEditor.vue` handles `dragstart`, `drop`, and an arbitrary block move helper.
- `knowledge_block_editing.ts` exports inline HTML serialization/parsing helpers.

- [x] **Step 2: Run verifier and confirm RED**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected: FAIL on at least one newly added Notion-like contract assertion.

## Task 2: Add Inline Editing Utilities

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_block_editing.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [x] **Step 1: Write tests for inline HTML round trip**

The verifier should import helper functions and assert:

- plain text content renders as escaped HTML.
- bold, italic, strike, and code marks render as semantic tags.
- parsing editable DOM-like HTML returns V2 inline content with marks preserved.
- plain text extraction strips markup without losing text order.

- [x] **Step 2: Implement helpers**

Implement:

- `inlineContentToEditableHtml(content)`
- `editableHtmlToInlineContent(html)`
- `inlineContentToPlainText(content)`
- `normalizeInlineTextNodes(content)`

Use `document` only when available; otherwise parse with small, deterministic HTML token handling suitable for verifier use. Escape user text on output.

## Task 3: Add V2 Tree Editing Primitives

**Files:**
- Modify: `desktop/src/windows/main/utils/knowledge_blocks_v2.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [x] **Step 1: Write tests for tree operations**

Add verifier assertions for:

- splitting a paragraph at an offset creates a sibling paragraph with trailing content.
- merging an empty block backward removes the block and targets the previous block.
- moving a block before another block changes order without losing children.

- [x] **Step 2: Implement tree helpers**

Implement:

- `splitBlockAtTextOffset(document, blockId, offset)`
- `mergeBlockBackward(document, blockId)`
- `moveBlockBefore(document, draggedBlockId, targetBlockId)`

Return both updated document and focus metadata so the editor can restore cursor position.

## Task 4: Refactor Renderer to Contenteditable Blocks

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue`

- [x] **Step 1: Replace primary editable text fields**

Use contenteditable elements for paragraph, heading, bullet, ordered, task, quote, callout, toggle title, page reference title, and Todo reference title.

- [x] **Step 2: Preserve inline marks**

On input, serialize editable HTML back to `KnowledgeInlineContent[]`. On mount/update, render inline content back into the editable surface without clobbering the active composition.

- [x] **Step 3: Add keyboard behavior**

Handle:

- `Enter`: emit split/create block unless inside code/table metadata.
- `Backspace`: emit merge/remove when current block is empty and cursor is at the start.
- `Tab` / `Shift+Tab`: indent/outdent.
- Markdown shortcuts at block start.
- `Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+X`, and `Ctrl+E` for marks.

- [x] **Step 4: Keep special blocks usable**

Tables may keep cell inputs for this milestone, and code blocks may keep a textarea because code editing is a distinct nested editor. The rest of the writing surface should not show form-field chrome.

## Task 5: Refactor Editor Shell and Block Handle

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeBlockHandle.vue`

- [x] **Step 1: Remove always-visible insert toolbar**

Keep save/import/export actions compact, but move block insertion into blank block, plus handle, and slash menu.

- [x] **Step 2: Add drag reorder**

Drag from the grip, show a drop target state, and call `moveBlockBefore()` on drop.

- [x] **Step 3: Add split/merge focus restoration**

Wire renderer events to V2 helpers and focus the correct block after each edit.

## Task 6: Upgrade Slash Menu Interaction

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/block/KnowledgeSlashMenu.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`

- [x] **Step 1: Add keyboard navigation**

The menu owns `activeIndex` and handles ArrowUp, ArrowDown, Enter, and Escape.

- [x] **Step 2: Add command metadata**

Show grouped labels such as basic, media, structure, and reference while keeping the visual surface compact.

- [x] **Step 3: Keep slash text replacement clean**

Selecting a command should remove the `/query` text and convert the current block or insert the selected block after it.

## Task 7: Verification and Manual Audit

**Files:**
- No planned source files beyond the above.

- [x] **Step 1: Run focused verifier**

```bash
pnpm --dir desktop run verify:knowledge-editor
```

- [x] **Step 2: Run desktop lint**

```bash
pnpm --dir desktop run lint
```

- [x] **Step 3: Run renderer build**

```bash
pnpm --dir desktop run build:renderer
```

- [x] **Step 4: Run TypeScript check and classify failures**

```bash
pnpm --dir desktop exec tsc -p tsconfig.json --noEmit
```

Known existing risk: quick-launch provider `TS2677` failures may still exist outside the Knowledge scope. Do not count those as Notion-like editor failures, but report them honestly.

## Verification Results

- `pnpm --dir desktop run verify:knowledge-editor`: passed.
- `pnpm --dir desktop run lint`: passed.
- `pnpm --dir desktop run build:renderer`: passed with existing chunk-size warnings.
- `pnpm --dir desktop exec tsc -p tsconfig.json --noEmit`: failed only on existing quick-launch provider `TS2677` type predicate errors in `ftp_provider.ts`, `internal_route_provider.ts`, `ssh_provider.ts`, `terminal_provider.ts`, and `todo_provider.ts`.

## Deferred

- Full database blocks.
- Multi-column layout.
- Collaborative cursors/comments.
- Page mention auto-complete backed by the real page tree.
- True ProseMirror/Tiptap migration if the custom contenteditable layer becomes too costly.
