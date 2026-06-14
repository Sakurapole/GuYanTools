# Knowledge Canvas Inline Card Editing Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining OneNote-like usability gap by making canvas cards directly editable on the canvas instead of requiring the right inspector for most text changes.

**Architecture:** Keep the existing SVG canvas and `KnowledgeCanvasElementRenderer` boundary. Add a single inline editing branch that covers rich text, annotation rectangles, file cards, page cards, Todo cards, and group cards, while preserving current side-panel editing and lock protections.

**Tech Stack:** Electron renderer, Vue 3 Composition API, TypeScript, existing GuYanTools UI components, SVG `foreignObject`, existing `verify:knowledge-editor` verifier.

---

## Current Evidence

- `KnowledgeCanvasToolbar.vue` already exposes `file`, `page_card`, `todo_card`, and `group` tools.
- `KnowledgeCanvasEditor.vue` already supports move, resize, marquee select, locking, image/file asset payloads, and inspector editing.
- `KnowledgeCanvasElementRenderer.vue` only renders the inline `UiTextarea` for `rich_text`; `rect`, `file`, `page_card`, `todo_card`, and `group` stay static on double-click.
- The editing textarea does not stop pointerdown propagation, so text editing can be interrupted by the parent drag handler.
- `verify:knowledge-editor` checks canvas tools and resize/lock basics, but it does not yet assert that card-like elements can be edited directly on the canvas.

## File Structure

- Modify `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - Add static checks for a shared inline-editable canvas element predicate and pointerdown isolation while editing.
- Modify `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`
  - Add `isInlineTextEditable()`.
  - Use one textarea branch for `rich_text`, `rect`, `file`, `page_card`, `todo_card`, and `group`.
  - Stop pointerdown propagation inside the editor so editing does not start dragging.
- Modify `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`
  - Let the inspector text field cover the same inline-editable element set for consistency.

## Task 1: Lock the Canvas Direct-Editing Contract

**Files:**
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [x] **Step 1: Add verifier checks**

Assert that:

- `KnowledgeCanvasElementRenderer.vue` has an `isInlineTextEditable` helper.
- That helper includes `rich_text`, `rect`, `file`, `page_card`, `todo_card`, and `group`.
- The inline canvas editor stops pointerdown propagation with `@pointerdown.stop`.
- `KnowledgeCanvasEditor.vue` uses a shared inline-editable element list for its inspector text field.

- [x] **Step 2: Run verifier and confirm RED**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected before implementation: FAIL on the new canvas inline editing contract.

## Task 2: Implement Inline Editing for Canvas Cards

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`

- [x] **Step 1: Add renderer predicate**

Create:

```ts
function isInlineTextEditable() {
  return ['rich_text', 'rect', 'file', 'page_card', 'todo_card', 'group'].includes(props.element.type);
}
```

- [x] **Step 2: Reuse the inline textarea**

Render the same `UiTextarea` when `editing && isInlineTextEditable()`, then keep the existing card shell for read mode.

- [x] **Step 3: Prevent drag while editing**

Add `@pointerdown.stop` to the inline editor.

- [x] **Step 4: Align inspector text editing**

In `KnowledgeCanvasEditor.vue`, replace the hard-coded `rich_text || rect` condition with an `inlineTextEditableElementTypes` list that also covers cards and groups.

## Task 3: Verify and Record

**Files:**
- Modify: `docs/superpowers/plans/2026-06-11-knowledge-canvas-inline-card-editing-followup-plan.md`

- [x] **Step 1: Run focused verifier**

```bash
pnpm --dir desktop run verify:knowledge-editor
```

- [x] **Step 2: Run valid lint and build checks**

```bash
pnpm --dir desktop run lint
pnpm --dir desktop run build:renderer
```

- [x] **Step 3: Update this plan with results**

Record pass/fail evidence and any unrelated failures under `Verification Results`.

## Verification Results

- `pnpm --dir desktop run verify:knowledge-editor`: passed after the expected RED failure on missing `isInlineTextEditable`.
- `pnpm --dir desktop exec eslint src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue`: not a valid project lint command for direct `.vue` files in this repo; it fails at `<script setup>` parsing before checking code semantics.
- `pnpm --dir desktop run lint`: passed.
- `pnpm --dir desktop run build:renderer`: passed with existing chunk-size warnings.
- `pnpm --dir desktop exec tsc -p tsconfig.json --noEmit`: failed only on existing quick-launch provider `TS2677` type predicate errors in `ftp_provider.ts`, `internal_route_provider.ts`, `ssh_provider.ts`, `terminal_provider.ts`, and `todo_provider.ts`.
