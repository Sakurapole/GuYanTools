# AI Non-Agent Capability Development Plan

> Date: 2026-06-10
> Scope: AI Chat, provider/model configuration, knowledge/RAG, web search, Canvas, memory, multimodal input, and AI workspace UX.
> Excluded: General Agent, Code Agent, autonomous tool loops, shell/file-write agents, and approval-driven agent execution.

## 1. Current Baseline

Repository evidence:

- `desktop/src/main/ai/chat_service.ts` already routes chat through Vercel AI SDK `generateText` / `streamText`, persists user and assistant messages, supports aborts, regeneration, reasoning metadata, grounding context, and Canvas tools.
- `desktop/src/contracts/ai.ts` already defines provider/model capabilities, assistants, conversations, citations, grounding options, Canvas workspaces, embedding rebuild payloads, MCP configuration, and safe renderer-facing config.
- `multi_platform_core/migrations/024_add_ai_chat.sql` persists conversations, messages, citations, and Canvas state. `multi_platform_core/migrations/021_add_knowledge.sql` and `023_add_knowledge_search_fts.sql` provide knowledge chunks, embeddings, and search indexes.
- `desktop/src/main/ai/tools/grounding_service.ts` can assemble web and knowledge citations, but web search depends on a user-configured `webSearchEndpoint`.
- `desktop/src/main/ai/embedding_service.ts` supports embedding rebuild and vector search over knowledge chunks.
- `desktop/src/main/ai/tools/canvas_tools.ts` supports AI-created Canvas workspaces and file mutations.
- `desktop/src/windows/main/pages/AI/components/AiAssistantSettingsDialog.vue` exposes memory preferences, but the UI explicitly says memory is not connected to the current chat flow.
- `desktop/src/main/ai/mcp_service.ts` can import and start MCP servers, but chat currently passes only Canvas tools into `streamText`.

## 2. Competitive Capability Baseline

Modern AI workspaces commonly include:

- Chat with multiple models, streaming, regeneration, stop, model-specific settings, custom assistants, and conversation organization.
- Project/workspace context: grouped chats, files, instructions, reusable source material, and scoped memory.
- Source-grounded answers over uploaded/local content with inline citations and clear source navigation.
- Web search and deep research: plan, source discovery, reading, synthesis, citation checking, cancellation, and saved reports.
- Canvas/artifacts: editable long-form content or app/code outputs beside chat, with preview, versioning, diff, and export.
- File and multimodal input: PDFs, Markdown, text, spreadsheets, images, screenshots, audio, and pasted rich content.
- Data analysis: structured file ingestion, code-backed calculation, tables/charts, and downloadable outputs.
- Memory: explicit user/project preferences with view/edit/delete controls.
- Connectors: workspace apps, web, cloud drives, issue trackers, and MCP-like tool integrations with source attribution.

## 3. Gap Assessment

### P0 Gaps

- Provider onboarding is still manual-heavy. Users need a first-run path that can configure a provider, fetch models, test connectivity, choose default chat and embedding models, and explain capability badges.
- Knowledge-grounded answers can be requested, but the chat flow does not yet fail or downgrade when forced knowledge search returns no knowledge citations.
- Static verification checks integration markers but not trust-boundary guarantees such as "forced knowledge QA cannot silently answer without sources".

### P1 Gaps

- Chat payloads accept only text content. There is no first-class attachment model for files, images, tables, or audio.
- Model `vision` capability is configurable, but no renderer/main message path sends image inputs to providers.
- Uploaded files are not yet reusable as conversation/project sources.

### P2 Gaps

- Knowledge retrieval is hybrid text + vector, but lacks reranking, citation coverage checks, source freshness scoring, and visible retrieval diagnostics.
- Knowledge Inspector AI tab is documented but not fully implemented as an in-place Q&A surface.
- "Save answer/report to knowledge" is not part of the non-Agent chat flow.

### P3 Gaps

- Deep Research is documented but not implemented. There are no research job tables, progress events, source-reading stages, citation-check stage, or cancellable report pipeline.
- Web search is a single endpoint call, not a multi-query research flow.

### P4 Gaps

- Canvas writes are applied by AI tools immediately. There is no proposal/diff/apply/reject gate.
- Canvas preview exists, but React preview uses CDN React/Babel and should be treated as a preview prototype, not a production-grade sandbox.
- Canvas lacks export, version restore UI, inline edit commands, and "save to knowledge".

### P5 Gaps

- Memory is only a saved assistant preference. There is no memory table, memory extraction, memory retrieval, or view/edit/delete UI.
- There is no project/workspace layer that groups chats, files, instructions, Canvas artifacts, memory, and knowledge scopes.

### P6 Gaps

- MCP import/start exists, but MCP tools are not discoverable or callable from normal chat.
- There is no connector result normalization into citations.
- There is no permission model for non-Agent connector calls.

## 4. Delivery Principles

- Keep Agent boundaries closed. No autonomous shell, project-file writes, or long-running tool loops in this plan.
- Every source-grounded answer must expose sources. If forced source search yields no source, the model response must not look like a trusted grounded answer.
- Prefer proposal-first for generated edits. AI can draft and suggest; user applies changes.
- Reuse existing knowledge chunks, embeddings, IPC contracts, Pinia stores, and UI components before adding new subsystems.
- Keep each phase independently shippable and verifiable.

## 5. Phased Implementation Plan

### Phase 0: Trust Guardrails And Setup Hardening

Goal: make current AI chat safer and easier to configure before adding larger features.

Tasks:

- Add a forced-knowledge citation guard in `desktop/src/main/ai/chat_service.ts`.
- Extend `desktop/scripts/verify-ai-chat.cjs` to check the guard exists.
- Improve Provider setup copy and defaults in `AiProviderDrawer.vue` / `AiSettingsPanel.vue`.
- Add a "first usable AI" checklist to settings: provider configured, chat model selected, embedding model selected, research enabled, web endpoint optional.

Acceptance criteria:

- When `grounding.knowledgeSearchMode === 'force'` and no `knowledge-*` citation is returned, the assistant message ends in `error` and emits `run-error`.
- Existing normal chat, web-only chat, and knowledge chat with citations remain unaffected.
- `pnpm --dir desktop run verify:ai-chat` passes.

### Phase 1: Attachments And Multimodal Input

Goal: allow users to ask about local files and images without first manually importing everything into knowledge.

Tasks:

- Add `AiChatAttachment` contract with `id`, `kind`, `name`, `mimeType`, `size`, `source`, `textContent?`, `dataUrl?`, `assetId?`, and `metadata`.
- Add preload/main IPC for staging chat attachments in app data.
- For text-like files, reuse knowledge text extraction utilities to produce text snippets and citations.
- For images, route to vision-capable models as provider-supported message parts; block or warn for models without `vision`.
- Update `AiComposer.vue` with file/image attach controls and visible attachment chips.
- Persist message attachment metadata in `metadata_json` first; add dedicated table only if metadata becomes insufficient.

Acceptance criteria:

- User can attach `.txt`, `.md`, and common image files to one chat message.
- Text attachments are cited as local sources.
- Image attachments are rejected with a clear message when the selected model lacks `vision`.
- No renderer code directly reads arbitrary filesystem paths after selection; main/preload own file access.

### Phase 2: Knowledge Q&A Inside Knowledge Inspector

Goal: make local knowledge Q&A feel like NotebookLM-style source-grounded chat.

Tasks:

- Add AI tab UI in `KnowledgePage.vue` if not already fully wired.
- Let users choose scope: current page, current space, current library, selected text.
- Use `window.aiApi.sendMessage` with `knowledgeSearchMode: 'force'` and scope fields.
- Display citations with jump-to-source actions for pages, blocks, assets, and quick notes.
- Add "continue in AI page" to transfer context to the full AI workspace.
- Add answer actions: copy, save as knowledge page, create quick note.

Acceptance criteria:

- Current page and current space questions produce cited answers when sources exist.
- Source cards navigate to the correct knowledge item.
- Source-empty questions return a clear "no source" state rather than an uncited answer.

### Phase 3: Deep Research Without Agent

Goal: implement a cancellable, auditable research pipeline that uses web and knowledge sources only.

Tasks:

- Add `ai_research_jobs` and `ai_research_sources` migrations.
- Add contracts for `AiResearchJob`, `AiResearchStage`, `AiResearchSource`, and stream events.
- Add `desktop/src/main/ai/research/research_job_service.ts`.
- Add `research_pipeline.ts` stages: plan, search, read/summarize sources, synthesize report, citation check.
- Add `AiResearchPanel.vue` with progress, partial sources, cancel, retry, and save report.
- Reuse `grounding_service.ts` search methods, but support multiple generated search queries and source deduplication.

Acceptance criteria:

- Research jobs survive page reloads and show final/failed/cancelled state.
- Cancelling a job aborts in-flight model/search work and persists `cancelled`.
- Final reports contain citations and can be saved as a new knowledge page.

### Phase 4: Canvas Proposal Workflow

Goal: convert Canvas from direct AI mutation to user-reviewed artifacts.

Tasks:

- Add `pending` Canvas operation support to the UI.
- Change AI Canvas tools to create operations with `pending` status by default for existing workspaces.
- Render a diff or side-by-side preview before applying generated changes.
- Add apply/reject actions that update operation status and write file content only after apply.
- Add version restore and export to knowledge page.

Acceptance criteria:

- AI can create a new Canvas, but edits to existing files require explicit apply.
- Rejected operations remain visible in history and do not change file content.
- Users can restore a previous Canvas version.

### Phase 5: Explicit Memory And Projects

Goal: add continuity without hidden behavior.

Tasks:

- Add `ai_memories` table with scope `global | project | assistant`, editable content, source message, created/updated timestamps, and enabled flag.
- Add explicit "remember this" action on messages.
- Add memory search/injection into chat prompt with visible metadata.
- Add project/workspace table grouping chats, instructions, files, Canvas workspaces, and scoped memories.
- Add project sidebar and project settings.

Acceptance criteria:

- Users can view, edit, disable, and delete every memory.
- Project chats only use project-scoped files/instructions/memories unless global memory is enabled.
- Moving a chat into a project updates its available context predictably.

### Phase 6: Non-Agent Connectors And MCP Tool Use

Goal: let normal chat query external tools as controlled sources, without autonomous Agent behavior.

Tasks:

- Add MCP client capability discovery for running servers.
- Normalize MCP tool outputs into citations or structured source cards.
- Allow assistants to choose `mcpMode`, but restrict normal chat to read-only/source tools first.
- Add per-tool enable/disable toggles and tool result previews.

Acceptance criteria:

- A configured read-only MCP server can be called from chat and its output appears as a cited source.
- Write-like MCP tools are disabled in non-Agent chat.
- Tool errors are visible without corrupting the chat run.

## 6. Verification Strategy

Minimum per phase:

- `pnpm --dir desktop run verify:ai-chat`
- `pnpm --dir desktop exec tsc --noEmit -p tsconfig.json`
- `pnpm --dir desktop run build:app` for UI/IPC phases
- `cargo test --manifest-path multi_platform_core/Cargo.toml ai` when AI persistence changes
- `cargo test --manifest-path multi_platform_core/Cargo.toml knowledge` when knowledge retrieval changes

Manual checks:

- Provider setup from empty config.
- Normal chat without sources.
- Forced knowledge chat with sources.
- Forced knowledge chat without sources.
- Stop/regenerate during streaming.
- Canvas create/edit/preview.
- App restart and persisted conversation reload.

## 7. Initial Development Slice

Start with Phase 0, Task 1:

- It is small, reversible, and directly protects the current user-facing AI behavior.
- It aligns with the knowledge AI design principle that source-grounded answers must show sources.
- It requires no new dependency and does not touch Agent surfaces.

Implementation files:

- `desktop/src/main/ai/chat_service.ts`
- `desktop/scripts/verify-ai-chat.cjs`

Verification:

- `pnpm --dir desktop run verify:ai-chat`
- `pnpm --dir desktop exec tsc --noEmit -p tsconfig.json`
