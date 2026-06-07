<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { AiCanvasFile, AiCanvasMode } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import { useAiCanvasStore } from '@/windows/main/stores/ai_canvas_store';
import AiCanvasPreview from './AiCanvasPreview.vue';

const props = defineProps<{
  conversationId: string;
  canvasEnabled: boolean;
}>();

const emit = defineEmits<{
  'update:canvasEnabled': [value: boolean];
}>();

const canvasStore = useAiCanvasStore();
const viewMode = ref<'edit' | 'preview'>('edit');
const selectedFilePath = ref('');
const draftContent = ref('');
const newTitle = ref('Canvas');
const newMode = ref<AiCanvasMode>('markdown');

const modeOptions: { label: string; value: AiCanvasMode }[] = [
  { label: 'Markdown', value: 'markdown' },
  { label: 'HTML', value: 'html' },
  { label: 'React', value: 'react' },
];
const workspaceOptions = computed(() => (canvasStore.workspacesByConversation[props.conversationId] ?? []).map((workspace) => ({
  label: workspace.title,
  value: workspace.id,
})));
const activeWorkspace = computed(() => canvasStore.activeWorkspace);
const activeFiles = computed(() => canvasStore.activeFiles);
const selectedFile = computed(() =>
  activeFiles.value.find((file) => file.path === selectedFilePath.value) ?? activeFiles.value[0] ?? null,
);
const canSave = computed(() => Boolean(activeWorkspace.value && selectedFile.value && draftContent.value !== selectedFile.value.content));
const operations = computed(() => canvasStore.activeOperations.slice(0, 8));
const versions = computed(() => canvasStore.activeVersions.slice(0, 8));

watch(
  () => props.conversationId,
  async (conversationId) => {
    if (conversationId) {
      await canvasStore.loadForConversation(conversationId);
      syncSelectedFile();
    }
  },
  { immediate: true },
);

watch(
  () => canvasStore.activeWorkspaceId,
  () => syncSelectedFile(),
);

watch(
  () => activeFiles.value.map((file) => `${file.path}:${file.updatedAt}`).join('|'),
  () => syncSelectedFile(),
);

watch(
  () => selectedFile.value?.id,
  () => {
    draftContent.value = selectedFile.value?.content ?? '';
  },
);

async function createWorkspace() {
  if (!props.conversationId) {
    return;
  }
  const result = await canvasStore.createWorkspace({
    conversationId: props.conversationId,
    title: newTitle.value,
    mode: newMode.value,
  });
  selectedFilePath.value = result.files[0]?.path ?? '';
  draftContent.value = result.files[0]?.content ?? '';
  emit('update:canvasEnabled', true);
}

async function selectWorkspace(value: string | number) {
  if (!props.conversationId) {
    return;
  }
  await canvasStore.setActiveWorkspace(props.conversationId, String(value));
  syncSelectedFile();
}

function selectFile(file: AiCanvasFile) {
  selectedFilePath.value = file.path;
  draftContent.value = file.content;
}

async function saveFile() {
  if (!activeWorkspace.value || !selectedFile.value) {
    return;
  }
  await canvasStore.upsertFile({
    workspaceId: activeWorkspace.value.id,
    path: selectedFile.value.path,
    language: selectedFile.value.language,
    content: draftContent.value,
  });
}

async function renameWorkspace(value: string) {
  if (!activeWorkspace.value || !value.trim()) {
    return;
  }
  await canvasStore.updateWorkspace(activeWorkspace.value.id, { title: value.trim() });
}

function syncSelectedFile() {
  const files = activeFiles.value;
  if (!files.length) {
    selectedFilePath.value = '';
    draftContent.value = '';
    return;
  }
  const selected = files.find((file) => file.path === selectedFilePath.value) ?? files[0];
  selectedFilePath.value = selected.path;
  draftContent.value = selected.content;
}

function operationLabel(type: string) {
  switch (type) {
    case 'create': return '创建';
    case 'replace_file': return '替换';
    case 'append_file': return '追加';
    case 'delete_file': return '删除';
    case 'patch_file': return '局部修改';
    default: return type;
  }
}

function operationPayload(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    return typeof payload.path === 'string'
      ? payload.path
      : Object.keys(payload).slice(0, 3).join(', ');
  } catch {
    return payloadJson;
  }
}
</script>

<template>
  <aside class="ai-canvas-panel">
    <header class="ai-canvas-panel__header">
      <div>
        <h3>Canvas</h3>
        <p>{{ activeWorkspace ? `${activeWorkspace.mode} / ${activeFiles.length} 文件` : '创建或等待 AI 生成工作区' }}</p>
      </div>
      <label class="ai-canvas-panel__toggle">
        <input
          type="checkbox"
          :checked="canvasEnabled"
          @change="emit('update:canvasEnabled', ($event.target as HTMLInputElement).checked)"
        >
        <span>启用</span>
      </label>
    </header>

    <section class="ai-canvas-panel__create">
      <UiInput v-model="newTitle" size="sm" placeholder="Canvas 名称" />
      <UiSelect v-model="newMode" size="sm" :options="modeOptions" />
      <UiButton size="sm" variant="primary" :disabled="!conversationId || canvasStore.saving" @click="createWorkspace">
        新建
      </UiButton>
    </section>

    <section v-if="activeWorkspace" class="ai-canvas-panel__workspace">
      <UiSelect
        :model-value="activeWorkspace.id"
        size="sm"
        :options="workspaceOptions"
        @change="selectWorkspace"
      />
      <UiInput
        :model-value="activeWorkspace.title"
        size="sm"
        placeholder="标题"
        @change="renameWorkspace"
      />
    </section>

    <div v-if="activeWorkspace" class="ai-canvas-panel__body">
      <nav class="ai-canvas-panel__files">
        <button
          v-for="file in activeFiles"
          :key="file.id"
          type="button"
          class="ai-canvas-panel__file"
          :class="{ 'ai-canvas-panel__file--active': file.path === selectedFilePath }"
          @click="selectFile(file)"
        >
          <span>{{ file.path }}</span>
          <small>{{ file.language }}</small>
        </button>
      </nav>

      <main class="ai-canvas-panel__workbench">
        <div class="ai-canvas-panel__toolbar">
          <div class="ai-canvas-panel__tabs">
            <button type="button" :class="{ active: viewMode === 'edit' }" @click="viewMode = 'edit'">编辑</button>
            <button type="button" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">预览</button>
          </div>
          <UiButton size="sm" variant="secondary" :disabled="!canSave || canvasStore.saving" @click="saveFile">
            保存
          </UiButton>
        </div>

        <textarea
          v-if="viewMode === 'edit'"
          v-model="draftContent"
          class="ai-canvas-panel__editor"
          spellcheck="false"
        />
        <AiCanvasPreview
          v-else
          :mode="activeWorkspace.mode"
          :files="activeFiles"
          :active-path="selectedFilePath"
        />
      </main>
    </div>

    <section v-else class="ai-canvas-panel__empty">
      <p>启用 Canvas 后，AI 可以在这里生成 Markdown、HTML 或 React 页面。</p>
    </section>

    <footer class="ai-canvas-panel__history">
      <div class="ai-canvas-panel__history-block">
        <h4>AI 操作</h4>
        <p v-if="operations.length === 0">暂无操作</p>
        <ul v-else>
          <li v-for="operation in operations" :key="operation.id">
            <span>{{ operationLabel(operation.operationType) }}</span>
            <small>{{ operationPayload(operation.payloadJson) }}</small>
          </li>
        </ul>
      </div>
      <div class="ai-canvas-panel__history-block">
        <h4>版本</h4>
        <p v-if="versions.length === 0">暂无版本</p>
        <ul v-else>
          <li v-for="version in versions" :key="version.id">
            <span>v{{ version.versionNo }}</span>
            <small>{{ version.createdAt }}</small>
          </li>
        </ul>
      </div>
    </footer>
  </aside>
</template>

<style lang="scss" scoped>
.ai-canvas-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  border-left: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-canvas-panel__header,
.ai-canvas-panel__create,
.ai-canvas-panel__workspace,
.ai-canvas-panel__toolbar {
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-canvas-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  p {
    margin: 3px 0 0;
    color: var(--ui-text-muted);
    font-size: 0.74rem;
  }
}

.ai-canvas-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-secondary);
  font-size: 0.78rem;
}

.ai-canvas-panel__create {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px auto;
  gap: 8px;
  padding: 10px 12px;
}

.ai-canvas-panel__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px 12px;
}

.ai-canvas-panel__body {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  min-height: 0;
}

.ai-canvas-panel__files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
  border-right: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-muted);
}

.ai-canvas-panel__file {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 48px;
  padding: 8px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;

  span {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.78rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--ui-text-muted);
    font-size: 0.68rem;
  }

  &--active {
    color: var(--ui-text-primary);
    background: var(--ui-surface-base);
    border-color: var(--ui-border-accent);
  }
}

.ai-canvas-panel__workbench {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.ai-canvas-panel__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
}

.ai-canvas-panel__tabs {
  display: inline-flex;
  gap: 4px;

  button {
    min-width: 48px;
    padding: 5px 8px;
    border: var(--ui-border-width-thin) solid transparent;
    border-radius: var(--ui-radius-sm);
    color: var(--ui-text-muted);
    background: transparent;
    cursor: pointer;

    &.active {
      color: var(--ui-text-primary);
      background: var(--ui-surface-muted);
      border-color: var(--ui-border-subtle);
    }
  }
}

.ai-canvas-panel__editor {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 12px;
  border: 0;
  resize: none;
  outline: none;
  color: var(--ui-text-primary);
  background: var(--ui-surface-base);
  font-family: var(--ui-font-family-mono);
  font-size: 0.78rem;
  line-height: 1.55;
}

.ai-canvas-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 20px;
  color: var(--ui-text-muted);
  text-align: center;
  font-size: 0.82rem;
  line-height: 1.6;
}

.ai-canvas-panel__history {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-top: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-muted);
}

.ai-canvas-panel__history-block {
  min-width: 0;

  h4 {
    margin: 0 0 6px;
    color: var(--ui-text-secondary);
    font-size: 0.72rem;
  }

  p,
  li {
    color: var(--ui-text-muted);
    font-size: 0.7rem;
  }

  p,
  ul {
    margin: 0;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px;
    min-width: 0;
  }

  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
