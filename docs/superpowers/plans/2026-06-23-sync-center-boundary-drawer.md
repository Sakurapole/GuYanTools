# Sync Center Boundary Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sync Center drawer in `Settings.vue` that clearly explains what syncs, what does not sync, and the shared rules for WebDAV and the self-hosted backend.

**Architecture:** Keep the feature entirely inside the existing Settings page. Reuse `UiDrawer` and the current sync store state so the drawer is read-only and follows the existing product UI vocabulary. Keep the boundary text aligned with the current sync contract and user guide so both providers share one explanation.

**Tech Stack:** Vue 3, TypeScript, Pinia, existing `UiDrawer` / `UiPanelHeader` / `UiButton` / `IconRenderer` components, existing sync contract and user-guide wording.

---

### Task 1: Add drawer state and boundary content model

**Files:**
- Modify: `D:\LaityHCode\DesktopProjects\GuYanTools\desktop\src\windows\main\pages\Settings.vue`

- [ ] **Step 1: Add the drawer toggle state and section data**

```ts
const syncBoundaryDrawerVisible = ref(false);

type SyncBoundarySection = {
  title: string;
  hint?: string;
  items: string[];
};

const syncBoundarySections: SyncBoundarySection[] = [
  {
    title: '会同步的内容',
    hint: 'WebDAV 和自建后端都使用同一套同步对象。',
    items: [
      '应用配置：外观、底栏、快捷键、功能配置和配置档案。',
      '知识库：库、空间、文件夹、页面、附件元数据、标签和链接。',
      'AI 元数据：助手、服务商和模型配置。',
      '知识库附件文件：通过内容哈希同步文件本身。',
    ],
  },
  {
    title: '不会同步的内容',
    hint: '敏感值和本机环境数据保留在本机。',
    items: [
      'AI API Key、服务商密钥、MCP token、password 和 secret。',
      'SSH / FTP 密码、私钥口令和插件密钥。',
      '本机路径、运行缓存和其他依赖当前设备环境的数据。',
    ],
  },
  {
    title: '同步规则',
    hint: '这些规则对 WebDAV 和自建后端都成立。',
    items: [
      '同步以对象为单位，身份以 collection + objectId 为准，名称只用于展示。',
      'WebDAV 适合个人多设备同步，自建后端适合长期公网或团队部署。',
      '当前运行时只会使用一个 provider；保存 WebDAV 配置会切换到 WebDAV，保存或登录自建后端会切换到自建后端。',
      '第一次配置后或第二台设备接入后，建议手动点击一次立即同步。',
    ],
  },
];
```

- [ ] **Step 2: Add the drawer open helper**

```ts
function openSyncBoundaryDrawer() {
  syncBoundaryDrawerVisible.value = true;
}
```

- [ ] **Step 3: Keep the implementation read-only**

```ts
// No sync behavior changes. The drawer only explains the existing contract.
```

### Task 2: Wire the drawer into the Sync Center tab UI

**Files:**
- Modify: `D:\LaityHCode\DesktopProjects\GuYanTools\desktop\src\windows\main\pages\Settings.vue`

- [ ] **Step 1: Add the drawer trigger to the Sync Center header or status row**

```vue
<UiButton size="sm" variant="ghost" @click="openSyncBoundaryDrawer">
  <template #prefix>
    <IconRenderer icon="iconify:lucide:book-open-text" :size="14" />
  </template>
  查看同步边界
</UiButton>
```

- [ ] **Step 2: Add the drawer markup near the existing sync section**

```vue
<UiDrawer
  v-model="syncBoundaryDrawerVisible"
  class="sync-boundary-drawer"
  width="520px"
>
  <template #header>
    <UiPanelHeader
      title="同步边界"
      subtitle="WebDAV 和自建后端共用同一套同步内容与规则"
    />
  </template>

  <div class="sync-boundary-drawer__body">
    <section v-for="section in syncBoundarySections" :key="section.title" class="sync-boundary-drawer__section">
      <div class="sync-boundary-drawer__section-head">
        <h3>{{ section.title }}</h3>
        <p v-if="section.hint">{{ section.hint }}</p>
      </div>
      <ul class="sync-boundary-drawer__list">
        <li v-for="item in section.items" :key="item">{{ item }}</li>
      </ul>
    </section>
  </div>
</UiDrawer>
```

- [ ] **Step 3: Keep the drawer detached from sync logic**

```vue
<!-- The drawer is informational only and does not mutate sync state. -->
```

### Task 3: Add drawer-specific styling and verify the page still builds

**Files:**
- Modify: `D:\LaityHCode\DesktopProjects\GuYanTools\desktop\src\windows\main\pages\Settings.vue`

- [ ] **Step 1: Add scoped drawer styles**

```scss
.sync-boundary-drawer__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 20px;
}

.sync-boundary-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sync-boundary-drawer__section-head h3 {
  margin: 0;
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-sm);
  font-weight: 700;
}

.sync-boundary-drawer__section-head p {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
}

.sync-boundary-drawer__list {
  margin: 0;
  padding-left: 18px;
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-sm);
  line-height: 1.6;
}
```

- [ ] **Step 2: Run the focused desktop lint/build check**

Run: `pnpm --dir desktop run lint`
Expected: pass with no new errors from `Settings.vue`

- [ ] **Step 3: Smoke-check the sync tab behavior**

Run: `pnpm --dir desktop run build:app`
Expected: build completes and the Sync Center page still compiles
```

## Self-check
- Sync boundary text is covered by Task 1 and Task 2.
- Only one file is modified.
- No placeholders remain.
- The plan keeps the drawer informational and avoids sync behavior changes.
