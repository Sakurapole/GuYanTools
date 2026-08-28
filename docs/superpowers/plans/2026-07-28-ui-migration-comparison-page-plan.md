# UI Migration Comparison Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建开发模式专用的组件迁移双栏对比页面。

**Architecture:** 页面使用桌面 legacy `Ui*.vue` 和 `gt-*` Custom Elements 的同 props 示例。仅页面 mounted 时注册 Custom Elements；router 和 Vite 只增加必要的开发态路由/编译支持。

**Tech Stack:** Vue 3、TypeScript、SCSS、Stencil、Vitest、Vite。

---

### Task 1: 锁定路由和对比页契约

**Files:**
- Create: `desktop/src/windows/main/pages/UiMigrationComparison.test.ts`
- Modify: `desktop/src/windows/main/routes/router.ts`
- Modify: `desktop/vite.renderer.config.ts`
- Create: `desktop/src/windows/main/pages/UiMigrationComparison.vue`

- [x] **Step 1: 写失败测试，断言开发态路由、`gt-*` 编译规则、双栏标题和 StateCard 对齐状态。**

```ts
expect(routerSource).toContain("path: '/devtools/ui-migration'");
expect(viteSource).toContain("tag.startsWith('gt-')");
expect(pageSource).toContain('Vue Legacy');
expect(pageSource).toContain('Stencil');
expect(pageSource).toContain("status: 'aligned'");
```

- [x] **Step 2: 运行测试，确认在页面实现前失败。**

Run: `pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/pages/UiMigrationComparison.test.ts`

Expected: FAIL，页面文件不存在且路由未注册。

- [x] **Step 3: 增加开发态路由、Vite custom-element 规则和对比页面。**

- [x] **Step 4: 重新运行测试，确认通过。**

### Task 2: 实现组件目录与双栏样例

**Files:**
- Modify: `desktop/src/windows/main/pages/UiMigrationComparison.vue`
- Test: `desktop/src/windows/main/pages/UiMigrationComparison.test.ts`

- [x] **Step 1: 写失败测试，要求页面目录包含 12 个首批组件并注册 Stencil elements。**

```ts
expect(pageSource).toContain("id: 'state-card'");
expect(pageSource).toContain("id: 'textarea'");
expect(pageSource).toContain('defineCustomElements()');
```

- [x] **Step 2: 将组件目录、选择状态、示例 props 和两栏分支写入页面。**

- [x] **Step 3: 运行页面测试，确认通过。**

### Task 3: 构建与视觉边界验证

**Files:**
- Verify: `desktop/src/windows/main/pages/UiMigrationComparison.vue`

- [x] **Step 1: 执行页面测试和 StateCard legacy 契约测试。**

Run: `pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/pages/UiMigrationComparison.test.ts src/windows/main/components/ui/legacy_dom_compatibility.test.ts`

Expected: PASS。

- [x] **Step 2: 构建桌面 renderer。**

Run: `pnpm --dir desktop run build:renderer`

Expected: PASS。

- [x] **Step 3: 检查差异格式。**

Run: `git diff --check`

Expected: 本次页面改动无格式错误。
