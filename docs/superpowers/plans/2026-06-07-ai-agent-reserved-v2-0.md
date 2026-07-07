# AI Agent Reserved V2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the V2.0 Agent reserved skeleton so the AI module has stable mode, configuration, and UI boundaries before real Code Agent / General Agent execution is connected.

**Architecture:** Keep Agent inside the existing `features.aiAgent` config container and the existing `/ai` desktop page. The implementation exposes typed reserved settings for Code Agent and General Agent, persists them through the current app-config manager, and renders a disabled but concrete Agent workspace that makes the future execution boundary explicit.

**Tech Stack:** Vue 3 Composition API, Pinia, Electron preload/main config IPC, TypeScript contracts, existing GuYanTools UI components. No new runtime dependency is introduced in this version.

---

### Task 1: Extend Agent Contracts

**Files:**
- Modify: `desktop/src/contracts/ai.ts`
- Modify: `desktop/src/contracts/app_config.ts`
- Modify: `desktop/src/main/app-config/manager.ts`

- [ ] Add shared Agent mode types: `AiInteractionMode`, `AiAgentMode`.
- [ ] Replace the minimal `AiAgentReservedSettings` shape with nested reserved settings for:
  - Code Agent: enabled state, last working directory, git repo check flag, reserved config JSON.
  - General Agent: enabled state, default agent id, agent templates with system prompt and enabled tool ids.
- [ ] Update `createDefaultAiAgentFeatureConfig()` so existing configs still default to safe disabled Agent behavior.
- [ ] Update `normalizeAiAgentFeature()` to preserve old `agent.enabled`, `maxSteps`, and `requireApprovalForWriteTools` values while filling missing nested Agent defaults.

### Task 2: Add Agent Reserved Workspace UI

**Files:**
- Create: `desktop/src/windows/main/pages/AI/components/AiAgentReservedPanel.vue`
- Modify: `desktop/src/windows/main/pages/AI/AiChatPage.vue`

- [ ] Create a focused panel that shows Code Agent and General Agent as reserved modes.
- [ ] Wire controls to `useAiConfigStore().updateConfig()` for Agent enablement, default mode, max steps, approval policy, and per-mode enablement.
- [ ] Add a Chat / Agent segmented mode switch to the AI page.
- [ ] Keep existing chat, grounding, reasoning, and Canvas behavior unchanged when Chat mode is active.
- [ ] In Agent mode, render the reserved panel instead of the chat message list and composer.

### Task 3: Replace Settings Placeholder

**Files:**
- Modify: `desktop/src/windows/main/pages/Settings.vue`

- [ ] Replace the AI Agent placeholder cards with real controls backed by `features.aiAgent`.
- [ ] Persist feature enablement, default entry mode, Agent enablement, max steps, write-tool approval, and Code/General Agent reserved switches.
- [ ] Keep settings labels Chinese and consistent with existing Settings page component patterns.

### Task 4: Static Verification Coverage

**Files:**
- Modify: `desktop/scripts/verify-ai-chat.cjs`

- [ ] Add markers for Agent reserved contract types.
- [ ] Add markers for the Agent reserved panel and AI page Agent switch.
- [ ] Keep existing V1.0-V1.3 checks intact.

### Task 5: Verify

**Commands:**
- [ ] `pnpm --dir desktop exec tsc --noEmit -p tsconfig.json`
- [ ] `pnpm --dir desktop run verify:ai-chat`
- [ ] `pnpm --dir desktop run build:renderer`
- [ ] `pnpm --dir desktop run lint`

**Expected:** Typecheck, static AI integration checks, renderer build, and lint complete without new errors. Existing lint warnings may remain if unchanged.
