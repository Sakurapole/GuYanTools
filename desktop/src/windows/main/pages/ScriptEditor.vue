<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { WebScriptRule } from '@/contracts/webview';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiField from '../components/ui/UiField.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiInput from '../components/ui/UiInput.vue';
import UiScrollbar from '../components/ui/UiScrollbar.vue';
import UiSelect from '../components/ui/UiSelect.vue';
import { useAppConfigStore } from '../stores/app_config_store';

const route = useRoute();
const appConfigStore = useAppConfigStore();

// ─── 脚本列表 ───
const allScripts = computed(() => appConfigStore.config.web?.scripts ?? []);
const searchQuery = ref('');
const selectedScriptId = ref<string | null>(null);
const filterDomain = ref('');

const filteredScripts = computed(() => {
  let list = allScripts.value;
  if (filterDomain.value) {
    list = list.filter((s: WebScriptRule) => s.domainPattern.includes(filterDomain.value));
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((s: WebScriptRule) => s.name.toLowerCase().includes(q) || s.domainPattern.toLowerCase().includes(q));
  }
  return list;
});

const selectedScript = computed(() =>
  allScripts.value.find((s: WebScriptRule) => s.id === selectedScriptId.value) ?? null
);

// ─── 编辑表单 ───
const editName = ref('');
const editDomain = ref('');
const editType = ref<'js' | 'css' | 'html'>('js');
const editRunAt = ref<'document-start' | 'document-end' | 'document-idle'>('document-end');
const editPermissions = ref<string[]>([]);
const editContent = ref('');
const editEnabled = ref(true);
const isDirty = ref(false);
const saveMessage = ref('');

function loadScript(script: WebScriptRule) {
  editName.value = script.name;
  editDomain.value = script.domainPattern;
  editType.value = script.type;
  editRunAt.value = script.runAt ?? 'document-end';
  editPermissions.value = [...(script.permissions ?? [])];
  editContent.value = script.content;
  editEnabled.value = script.enabled;
  isDirty.value = false;
  saveMessage.value = '';
}

function selectScript(id: string) {
  if (isDirty.value && selectedScriptId.value) {
    if (!confirm('当前脚本有未保存的修改，是否放弃？')) return;
  }
  selectedScriptId.value = id;
  const script = allScripts.value.find((s: WebScriptRule) => s.id === id);
  if (script) loadScript(script);
}

watch([editName, editDomain, editType, editRunAt, editPermissions, editContent, editEnabled], () => {
  isDirty.value = true;
  saveMessage.value = '';
}, { deep: true });

// ─── CRUD ───
async function saveScript() {
  if (!selectedScriptId.value) return;
  const scripts = allScripts.value.map((s: WebScriptRule) => {
    if (s.id !== selectedScriptId.value) return { ...s };
    return {
      ...s,
      name: editName.value.trim(),
      domainPattern: editDomain.value.trim(),
      type: editType.value,
      runAt: editRunAt.value,
      permissions: editPermissions.value.length > 0 ? [...editPermissions.value] as any : undefined,
      content: editContent.value,
      enabled: editEnabled.value,
    };
  });
  await appConfigStore.updateConfig({ web: { scripts } });
  isDirty.value = false;
  saveMessage.value = '已保存';
  setTimeout(() => saveMessage.value = '', 2000);
}

async function createScript() {
  const newScript: WebScriptRule = {
    id: `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '新脚本',
    domainPattern: filterDomain.value || '*',
    type: 'js',
    content: '// 在此编写脚本\nconsole.log("Hello from script!");',
    enabled: true,
    builtin: false,
    runAt: 'document-end',
    permissions: [],
  };
  const scripts = [...allScripts.value, newScript];
  await appConfigStore.updateConfig({ web: { scripts } });
  selectedScriptId.value = newScript.id;
  loadScript(newScript);
}

async function deleteScript() {
  if (!selectedScriptId.value) return;
  const name = selectedScript.value?.name ?? '';
  if (!confirm(`确认删除脚本「${name}」？`)) return;
  const scripts = allScripts.value.filter((s: WebScriptRule) => s.id !== selectedScriptId.value);
  await appConfigStore.updateConfig({ web: { scripts } });
  selectedScriptId.value = scripts.length > 0 ? scripts[0].id : null;
  if (selectedScript.value) loadScript(selectedScript.value);
}

function toggleEnabled() {
  editEnabled.value = !editEnabled.value;
}

// ─── 初始化 ───
onMounted(async () => {
  await appConfigStore.refreshConfig();

  const qDomain = route.query.domain as string | undefined;
  const qScriptId = route.query.scriptId as string | undefined;

  if (qDomain) filterDomain.value = qDomain;

  if (qScriptId) {
    const found = allScripts.value.find((s: WebScriptRule) => s.id === qScriptId);
    if (found) {
      selectedScriptId.value = qScriptId;
      loadScript(found);
      return;
    }
  }

  if (allScripts.value.length > 0) {
    const first = filteredScripts.value[0] ?? allScripts.value[0];
    selectedScriptId.value = first.id;
    loadScript(first);
  }
});

const permissionsAll = [
  { key: 'network', label: '网络请求', icon: '🌐' },
  { key: 'storage', label: '本地存储', icon: '💾' },
  { key: 'clipboard', label: '剪贴板', icon: '📋' },
];

const typeOptions = [
  { label: 'JavaScript', value: 'js' },
  { label: 'CSS', value: 'css' },
  { label: 'HTML', value: 'html' },
];

const runAtOptions = [
  { label: 'document-end', value: 'document-end' },
  { label: 'document-start', value: 'document-start' },
  { label: 'document-idle', value: 'document-idle' },
];

const typeLabel: Record<string, string> = { js: 'JavaScript', css: 'CSS', html: 'HTML' };

const editorPlaceholder = computed(() => {
  if (editType.value === 'css') return 'body {\n  background: #1a1a2e !important;\n}';
  if (editType.value === 'html') return '<!-- HTML 内容 -->\n<div>...</div>';
  return '// 在此编写脚本\nconsole.log("Hello!");';
});
</script>

<template>
  <div class="se-root">
    <div class="se-workspace">
      <!-- 左侧：脚本列表 -->
      <aside class="se-sidebar">
        <div class="se-sidebar__brand">
          <div class="se-sidebar__brand-icon">📜</div>
          <div>
            <div class="se-sidebar__brand-title">Scripts</div>
            <div class="se-sidebar__brand-sub">{{ allScripts.length }} 个脚本</div>
          </div>
        </div>

        <div class="se-sidebar__actions">
          <UiButton variant="primary" size="sm" block @click="createScript">
            <template #prefix>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </template>
            新建脚本
          </UiButton>
        </div>

        <div class="se-sidebar__search">
          <UiInput v-model="searchQuery" size="sm" placeholder="搜索脚本..." />
        </div>

        <div v-if="filterDomain" class="se-sidebar__filter">
          <span>🔗 {{ filterDomain }}</span>
          <UiIconButton size="sm" variant="ghost" title="清除筛选" @click="filterDomain = ''">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </UiIconButton>
        </div>

        <UiScrollbar class="se-sidebar__list-wrap" :x="false">
          <div class="se-sidebar__list">
            <div v-for="script in filteredScripts" :key="script.id" class="se-sidebar__item" :class="{
              'se-sidebar__item--active': script.id === selectedScriptId,
              'se-sidebar__item--disabled': !script.enabled,
            }" @click="selectScript(script.id)">
              <div class="se-sidebar__item-title">{{ script.name }}</div>
              <div class="se-sidebar__item-sub">{{ script.domainPattern }}</div>
            </div>
            <div v-if="filteredScripts.length === 0" class="se-sidebar__empty">
              <p>无匹配脚本</p>
            </div>
          </div>
        </UiScrollbar>
      </aside>

      <!-- 中间 + 右侧 编辑区 -->
      <main v-if="selectedScript" class="se-main">
        <!-- 操作栏 -->
        <div class="se-action-bar">
          <div class="se-action-bar__status">
            <span v-if="saveMessage" class="se-status se-status--saved">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                  stroke-linejoin="round" />
              </svg>
              {{ saveMessage }}
            </span>
            <span v-else-if="isDirty" class="se-status se-status--dirty">● 未保存</span>
          </div>
          <div class="se-action-bar__buttons">
            <UiButton v-if="!selectedScript.builtin" variant="danger" size="sm" @click="deleteScript">删除</UiButton>
            <UiButton variant="primary" size="sm" :disabled="!isDirty" @click="saveScript">保存</UiButton>
          </div>
        </div>

        <!-- 元数据区 -->
        <div class="se-meta-bar">
          <UiField label="脚本名称" class="se-meta-bar__name-field">
            <UiInput v-model="editName" placeholder="脚本名称" size="sm" />
          </UiField>
          <UiField label="匹配域名">
            <UiInput v-model="editDomain" placeholder="*.example.com" size="sm" />
          </UiField>
          <UiField label="类型">
            <UiSelect v-model="editType" :options="typeOptions" size="sm" />
          </UiField>
          <UiField label="注入时机">
            <UiSelect v-model="editRunAt" :options="runAtOptions" size="sm" />
          </UiField>
        </div>

        <!-- 编辑器 + 权限侧栏 -->
        <div class="se-editor-area">
          <!-- 代码编辑器 -->
          <UiCard class="se-editor-pane" radius="sm" :padding="'none'" :bordered="true">
            <template #header>
              <div class="se-editor-pane__topbar">
                <div class="se-editor-pane__dots">
                  <span class="se-dot se-dot--red"></span>
                  <span class="se-dot se-dot--yellow"></span>
                  <span class="se-dot se-dot--green"></span>
                </div>
                <span class="se-editor-pane__filename">{{ editName || 'untitled' }}.{{ editType }}</span>
                <span class="se-editor-pane__lang">{{ typeLabel[editType] || editType.toUpperCase() }}</span>
              </div>
            </template>
            <textarea v-model="editContent" class="se-editor-pane__textarea" spellcheck="false"
              :placeholder="editorPlaceholder" />
            <template #footer>
              <div class="se-editor-pane__footer">
                <div class="se-editor-pane__footer-left">
                  <span class="se-status" :class="isDirty ? 'se-status--dirty' : 'se-status--saved'">
                    {{ isDirty ? '● 待保存' : '✓ 已同步' }}
                  </span>
                </div>
                <button class="se-editor-pane__toggle" @click.prevent="toggleEnabled">
                  <span :class="editEnabled ? 'se-enabled--on' : 'se-enabled--off'">{{ editEnabled ? '已启用' : '已禁用'
                    }}</span>
                </button>
              </div>
            </template>
          </UiCard>

          <!-- 右侧权限面板 -->
          <div v-if="editType === 'js'" class="se-perms-panel">
            <h4 class="se-perms-panel__title">权限管理</h4>
            <div class="se-perms-panel__list">
              <label v-for="perm in permissionsAll" :key="perm.key" class="se-perms-panel__item"
                :class="{ 'se-perms-panel__item--active': editPermissions.includes(perm.key) }">
                <div class="se-perms-panel__item-info">
                  <span class="se-perms-panel__item-icon">{{ perm.icon }}</span>
                  <span>{{ perm.label }}</span>
                </div>
                <input type="checkbox" :value="perm.key" v-model="editPermissions" class="se-perms-check" />
              </label>
            </div>
          </div>
        </div>
      </main>

      <!-- 无选中状态 -->
      <main v-else class="se-main se-main--empty">
        <div class="se-empty-state">
          <div class="se-empty-state__icon">📜</div>
          <h3>选择或新建一个脚本</h3>
          <p>从左侧列表选择已有脚本，或点击 "新建脚本" 创建。</p>
          <UiButton variant="primary" @click="createScript">
            <template #prefix>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </template>
            新建脚本
          </UiButton>
        </div>
      </main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ─── Root ─── */
.se-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: var(--background-color);
  color: var(--ui-text-primary);
  overflow: hidden;
  font-family: var(--app-font-family, var(--app-font-sans));
}

/* ─── Workspace ─── */
.se-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ─── Sidebar ─── */
.se-sidebar {
  width: 260px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg-color);
  border-right: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.se-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 12px;
}

.se-sidebar__brand-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-button-primary-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.se-sidebar__brand-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text-primary);
}

.se-sidebar__brand-sub {
  font-size: 10px;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.se-sidebar__actions {
  padding: 0 12px 12px;
}

.se-sidebar__search {
  padding: 0 12px 10px;
}

.se-sidebar__filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 8px;
  font-size: 11px;
  color: var(--primary-color);
}

.se-sidebar__list-wrap {
  flex: 1;
  min-height: 0;
}

.se-sidebar__list {
  padding: 0 8px;
}

.se-sidebar__item {
  padding: 10px 12px;
  border-radius: var(--ui-radius-xs);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  margin-bottom: 2px;
  border-left: 3px solid transparent;

  &:hover {
    background: var(--surface-hover-color);
  }

  &--active {
    background: var(--ui-tabs-active-bg);
    border-left-color: var(--primary-color);
  }

  &--disabled {
    opacity: 0.4;
  }
}

.se-sidebar__item-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
  color: var(--ui-text-primary);
}

.se-sidebar__item-sub {
  font-size: 10px;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.se-sidebar__empty {
  padding: 32px 12px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 12px;
}

/* ─── Main ─── */
.se-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.se-main--empty {
  align-items: center;
  justify-content: center;
}

.se-empty-state {
  text-align: center;
  color: var(--ui-text-muted);

  &__icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  h3 {
    margin: 0 0 8px;
    color: var(--ui-text-primary);
    font-size: 16px;
  }

  p {
    margin: 0 0 20px;
    font-size: 13px;
  }
}

/* ─── 操作栏 ─── */
.se-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  flex-shrink: 0;
}

.se-action-bar__status {
  display: flex;
  align-items: center;
}

.se-action-bar__buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ─── 状态标签 ─── */
.se-status {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  &--saved {
    color: var(--ui-tabs-active-indicator, #22c55e);
  }

  &--dirty {
    color: var(--ui-field-error, #eab308);
  }
}

/* ─── 元数据栏 ─── */
.se-meta-bar {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  flex-shrink: 0;
}

/* ─── 编辑器区域 ─── */
.se-editor-area {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 16px 20px;
  gap: 16px;
}

.se-editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;

  :deep(.ui-card__header) {
    padding: 0;
  }

  :deep(.ui-card__body) {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  :deep(.ui-card__footer) {
    padding: 0;
  }
}

.se-editor-pane__topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
}

.se-editor-pane__dots {
  display: flex;
  gap: 5px;
}

.se-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &--red {
    background: rgba(255, 95, 87, 0.5);
  }

  &--yellow {
    background: rgba(255, 189, 46, 0.5);
  }

  &--green {
    background: rgba(39, 201, 63, 0.5);
  }
}

.se-editor-pane__filename {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.se-editor-pane__lang {
  margin-left: auto;
  font-size: 10px;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.se-editor-pane__textarea {
  flex: 1;
  width: 100%;
  padding: 16px 20px;
  border: none;
  background: transparent;
  color: var(--ui-input-text);
  resize: none;
  box-sizing: border-box;
  font: 13px/1.7 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', Consolas, monospace;
  tab-size: 2;
  outline: none;
  overflow-y: auto;

  &::placeholder {
    color: var(--ui-text-muted);
    opacity: 0.4;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--ui-radius-full);
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
}

.se-editor-pane__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.se-editor-pane__footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.se-editor-pane__toggle {
  cursor: pointer;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: none;
  border: none;
  color: inherit;
}

.se-enabled--on {
  color: var(--ui-tabs-active-indicator, #22c55e);
}

.se-enabled--off {
  color: var(--ui-button-danger-text, #ef4444);
}

/* ─── 权限面板 ─── */
.se-perms-panel {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.se-perms-panel__title {
  font-size: 10px;
  font-weight: 600;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}

.se-perms-panel__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.se-perms-panel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--ui-radius-xs);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-input-bg);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: var(--ui-border-accent);
  }

  &--active {
    border-color: var(--primary-color);
    background: var(--ui-tabs-active-bg);
  }
}

.se-perms-panel__item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.se-perms-panel__item-icon {
  font-size: 16px;
}

.se-perms-check {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  accent-color: var(--primary-color);
}
</style>
