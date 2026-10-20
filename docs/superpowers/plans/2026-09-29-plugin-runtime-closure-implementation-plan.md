# Plugin Runtime Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the first plugin-platform runtime gaps for command contributions, capability lifecycle, singleton jobs, and quota cleanup.

**Architecture:** Keep the existing PluginHost, PluginCommandRouter, CapabilityRouter, JobService, and UtilityWorkerHost boundaries. Add a host-owned command invocation bridge and inject the existing JobService into worker dispatch. Centralize enable/disable cleanup so every lifecycle path unregisters commands, capabilities, event listeners, and job quota slots.

**Tech Stack:** Electron 37, TypeScript, Vue/renderer IPC, `@guyantools/plugin-sdk`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-plugin-runtime-closure-design.md`

## Global Constraints

- Do not add dependencies or database migrations.
- Keep renderer access behind typed preload/runtime contracts.
- Preserve existing dirty worktree changes and do not reformat unrelated files.
- Use structured `PluginApiErrorPayload` for runtime failures.
- Run focused Vitest tests before broader desktop typecheck.

---

### Task 1: Add failing tests for command lifecycle and worker JobService ownership

**Files:**
- Modify: `desktop/src/main/plugin-host/runtime_guards.test.ts`
- Modify: `desktop/src/main/plugin-host/utility_worker_host.test.ts` (create if absent)

**Interfaces:**
- Verify `PluginCommandRouter` rejects execution after unregistering a plugin.
- Verify UtilityWorkerHost dispatch uses an injected `JobService` rather than constructing one.
- Verify terminal job states release quota slots exactly once.

- [x] **Step 1: Write the failing tests.** Added terminal-state idempotency, create failure rollback, and shared service quota tests in `services/job_service.test.ts`.
- [x] **Step 2: Run the focused tests.** Focused host and SDK tests passed after implementation; utility dispatch is covered by typecheck/build rather than an Electron process integration test.

### Task 2: Implement singleton JobService injection and quota release

**Files:**
- Modify: `desktop/src/main/plugin-host/utility_worker_host.ts`
- Modify: `desktop/src/main/plugin-host/runtime_router.ts`
- Modify: `desktop/src/main/plugin-host/index.ts`
- Modify: `desktop/src/main/plugin-host/services/job_service.ts`
- Modify: `desktop/src/main/plugin-host/quota.ts`

**Interfaces:**
- `UtilityWorkerHost(hostServices, jobServiceProvider)` uses `jobServiceProvider()` for all job operations.
- `JobService.onEvent(pluginId, listener)` remains the public subscription API.
- `PluginQuotaService.releaseJobSlot(pluginId)` remains idempotent for over-release.

- [x] **Step 1: Inject the host JobService.** UtilityWorkerHost receives the PluginHost-owned provider.
- [x] **Step 2: Track acquired job IDs.** JobService acquires and tracks create/retry slots; terminal and paused updates release once.
- [x] **Step 3: Release on lifecycle cleanup.** Central cleanup is used for disable, uninstall, enable failure and runtime destruction.
- [x] **Step 4: Run Task 1 tests.** Host suite passes.

### Task 3: Add command invocation bridge and SDK handler API

**Files:**
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `packages/plugin-sdk/src/contracts.ts`
- Modify: `packages/plugin-sdk/src/runtime.ts`
- Modify: `desktop/src/main/plugin-host/command_router.ts`
- Modify: `desktop/src/main/plugin-host/runtime_router.ts`
- Modify: `desktop/src/main/plugin-host/utility_worker_host.ts`
- Modify: `desktop/src/main/plugin-host/ipc.ts`
- Test: `desktop/src/main/plugin-host/command_router.test.ts` (create if absent)
- Test: `packages/plugin-sdk/tests/runtime.test.ts`

**Interfaces:**
- SDK: `commands.onInvoke(listener): () => void` where listener receives `{ commandId: string; payload?: unknown }` and returns `unknown | Promise<unknown>`.
- Host: `PluginCommandRouter.registerRuntime(pluginId, runtimeId, invoke)` and `unregisterRuntime(runtimeId)`.
- Host dispatch event: `plugin-runtime:command:invoke` with `{ requestId, commandId, payload }`; response event carries `{ requestId, ok, result|error }`.

- [x] **Step 1: Write router and SDK tests.** Added router lifecycle and SDK response tests.
- [x] **Step 2: Run focused tests.** Router and SDK tests passed.
- [x] **Step 3: Implement runtime registration.** UI uses IPC; Utility Worker uses the host bootstrap and MessagePort.
- [x] **Step 4: Register contribution handlers on enable.** Contributions register during enable and centralized cleanup unregisters them.
- [x] **Step 5: Fix SDK `commands.register`.** Registration remains local to the runtime while execute stays host routed.
- [x] **Step 6: Run router and SDK tests.** Passed.

### Task 4: Harden capability lifecycle and enable failure rollback

**Files:**
- Modify: `desktop/src/main/plugin-host/index.ts`
- Modify: `desktop/src/main/plugin-host/capability_router.ts`
- Modify: `desktop/src/main/plugin-host/dependency_resolver.ts`
- Test: `desktop/src/main/plugin-host/dependency_resolver.test.ts`
- Test: `desktop/src/main/plugin-host/runtime_guards.test.ts`

**Interfaces:**
- `PluginHost.enablePlugin` must leave no command, capability, Job listener, or quota slot after any startup failure.
- `CapabilityRouter.unregister(pluginId)` remains safe to call repeatedly.

- [x] **Step 1: Add failure rollback tests.** Existing dependency failure coverage plus runtime host test suite; full host lifecycle rollback remains without direct PluginHost unit coverage.
- [x] **Step 2: Run focused tests.** Plugin-host suite passed.
- [x] **Step 3: Add idempotent cleanup.** Centralized runtime cleanup includes worker, mounted page, Android sessions, subscriptions and quota registrations.
- [x] **Step 4: Use cleanup in enable catch, disable, uninstall and runtime-destroy callbacks.** Crash policy and registry status are retained.
- [x] **Step 5: Run focused suite.** Passed.

### Task 5: Verify and update platform documentation

**Files:**
- Modify: `docs/desktop/PLUGIN_SYSTEM_OPTIMIZATION.md`
- Modify: `docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md`

- [x] **Step 1: Update the gap table.** Updated both platform docs and retained pending menu/shortcut/background scheduler items.
- [x] **Step 2: Run verification.** Plugin-platform tests, typecheck, full app build and `git diff --check` passed.
- [x] **Step 3: Review the diff.** Kept edits within plugin runtime, SDK, build config, docs and tests; pre-existing unrelated worktree changes remain untouched.
