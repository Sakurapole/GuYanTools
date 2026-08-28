# UiStateCard Style Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使 Stencil `gt-state-card` 在桌面首页的 loading、empty、error 三个实际状态下具备与 Vue legacy `UiStateCard` 相同的可配置视觉结构，为后续仅替换该组件入口建立样式门禁。

**Architecture:** 保留桌面 legacy 组件和首页现有渲染不变。将 state-card 的尺寸、间距、卡片表面、文字颜色和 actions 间距暴露为稳定 `--gt-state-card-*` variables；legacy 与 Stencil 同时消费这些变量，Stencil 默认值继续复用既有 `--ui-*` token。首页样式以同一组变量表达既有视觉参数，因此当前视觉不会改变，未来把入口切到 `gt-state-card` 时可复用同一份局部样式。

**Tech Stack:** Stencil 4、Vue 3、SCSS、Vitest、pnpm workspace。

---

### Task 1: 为 StateCard 样式契约补齐失败回归测试

**Files:**
- Modify: `packages/ui-core/src/components/action-feedback.spec.tsx`
- Modify: `packages/ui-core/src/components/gt-state-card/gt-state-card.contract.ts`
- Test: `packages/ui-core/src/components/action-feedback.spec.tsx`

- [x] **Step 1: 写入失败测试，要求 StateCard 公开所有首页对齐变量和稳定 parts。**

```tsx
it('exposes the desktop state-card surface and typography override contract', () => {
  const css = readFileSync(new URL('./gt-state-card/gt-state-card.css', import.meta.url), 'utf8');
  const contract = readFileSync(new URL('./gt-state-card/gt-state-card.contract.ts', import.meta.url), 'utf8');

  for (const variable of [
    '--gt-state-card-min-width', '--gt-state-card-padding', '--gt-state-card-radius',
    '--gt-state-card-shadow', '--gt-state-card-title-color',
    '--gt-state-card-description-color', '--gt-state-card-eyebrow-color',
    '--gt-state-card-actions-gap',
  ]) expect(contract).toContain(`'${variable}'`);

  expect(css).toContain('part="title"');
  expect(css).toContain('var(--gt-state-card-padding, 0)');
});
```

- [x] **Step 2: 运行测试，确认在添加契约前失败。**

Run: `pnpm --dir packages/ui-core exec vitest run src/components/action-feedback.spec.tsx --pool=forks --maxWorkers=1`

Expected: FAIL，缺少 `--gt-state-card-padding` 等新变量。

### Task 2: 让 Stencil StateCard 复用 legacy 视觉默认值

**Files:**
- Modify: `packages/ui-core/src/components/gt-state-card/gt-state-card.css`
- Modify: `packages/ui-core/src/components/gt-state-card/gt-state-card.contract.ts`
- Test: `packages/ui-core/src/components/action-feedback.spec.tsx`

- [x] **Step 1: 将 StateCard 的 surface、排版和 compact 规则改为公开变量优先、legacy token fallback。**

```css
article {
  min-width: var(--gt-state-card-min-width, min(100%, 360px));
  gap: var(--gt-state-card-gap, 8px);
  padding: var(--gt-state-card-padding, 0);
  border-radius: var(--gt-state-card-radius, var(--ui-radius-md, var(--gt-radius-md)));
  box-shadow: var(--gt-state-card-shadow, var(--ui-card-shadow, var(--gt-shadow-sm)));
}

strong { color: var(--gt-state-card-title-color, var(--ui-state-title, var(--gt-color-text))); }
p { color: var(--gt-state-card-description-color, var(--ui-state-muted, var(--gt-color-text-muted))); }
.eyebrow { color: var(--gt-state-card-eyebrow-color, var(--ui-state-muted, var(--gt-color-text-muted))); }
.actions { gap: var(--gt-state-card-actions-gap, 12px); }
```

- [x] **Step 2: 给标题、正文、icon、actions 保留现有 `part` 名称，并让 error 标题只覆盖 title token。**

- [x] **Step 3: 运行 Task 1 测试，确认通过。**

Run: `pnpm --dir packages/ui-core exec vitest run src/components/action-feedback.spec.tsx --pool=forks --maxWorkers=1`

Expected: PASS。

### Task 3: 预置首页 future-host 覆盖且不改变 legacy 渲染

**Files:**
- Modify: `desktop/src/windows/main/pages/Home/home.scss`
- Test: `desktop/src/windows/main/components/ui/legacy_dom_compatibility.test.ts`

- [x] **Step 1: 写失败断言，要求 `.home-state-card` 同时提供 StateCard 的公开 variables。**

```ts
expect(readDesktop('pages/Home/home.scss')).toContain('--gt-state-card-padding: 32px 34px;');
expect(readDesktop('pages/Home/home.scss')).toContain('--gt-state-card-radius: var(--ui-radius-lg);');
expect(readDesktop('pages/Home/home.scss')).toContain('--gt-state-card-shadow: none;');
```

- [x] **Step 2: 在 `.home-state-card` 中增加对应 variables，并由 legacy 与 Stencil 共同消费。**

- [x] **Step 3: 运行桌面 legacy 测试，确认当前 Vue DOM 和首页样式仍存在。**

Run: `pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/legacy_dom_compatibility.test.ts`

Expected: PASS。

### Task 4: 验证产物和边界

**Files:**
- Verify: `packages/ui-core/src/components/gt-state-card/*`
- Verify: `desktop/src/windows/main/pages/Home/home.scss`

- [x] **Step 1: 运行组件库完整测试和 style contract 门禁。**

Run: `pnpm --dir packages/ui-core run test && pnpm --dir packages/ui-core run verify:style-contract`

Expected: PASS。

- [x] **Step 2: 构建 Stencil 包与桌面 renderer。**

Run: `pnpm --dir packages/ui-core run build && pnpm --dir desktop run build:renderer`

Expected: PASS。

- [x] **Step 3: 检查工作区差异。**

Run: `git diff --check`

Expected: 本次 StateCard 改动无新增格式错误。当前工作区仍有既存的 `packages/ui-vue/src/generated/stencil-proxies.ts` 末尾空行告警，未在本任务中改写该生成文件。

> 本计划完成的是样式变量、Shadow DOM parts 和首页 legacy 样式的代码级契约对齐；桌面端 `UiStateCard` 入口仍未切换到 Stencil，固定 Electron 环境下的最终截图回归应在下一步入口切换时执行。
