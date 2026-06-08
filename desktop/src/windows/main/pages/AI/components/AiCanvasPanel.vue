<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { AiCanvasFile, AiCanvasMode } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTabs, { type UiTabItem } from '@/windows/main/components/ui/UiTabs.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import UiToolbar from '@/windows/main/components/ui/UiToolbar.vue';
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
const viewModeOptions: UiTabItem[] = [
  { key: 'edit', label: '编辑' },
  { key: 'preview', label: '预览' },
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
      <UiPanelHeader
        title="Canvas"
        :subtitle="activeWorkspace ? `${activeWorkspace.mode} / ${activeFiles.length} 文件` : '创建或等待 AI 生成工作区'"
      >
        <template #actions>
          <UiCheckbox
            :model-value="canvasEnabled"
            size="sm"
            @update:modelValue="emit('update:canvasEnabled', $event)"
          >
            启用
          </UiCheckbox>
        </template>
      </UiPanelHeader>
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
        <UiButton
          v-for="file in activeFiles"
          :key="file.id"
          class="ai-canvas-panel__file"
          size="sm"
          variant="ghost"
          block
          :active="file.path === selectedFilePath"
          @click="selectFile(file)"
        >
          <span>{{ file.path }}</span>
          <small>{{ file.language }}</small>
        </UiButton>
      </nav>

      <main class="ai-canvas-panel__workbench">
        <UiToolbar class="ai-canvas-panel__toolbar" density="compact">
          <UiTabs
            v-model="viewMode"
            :items="viewModeOptions"
            variant="segmented"
            size="sm"
          />
          <template #trailing>
          <UiButton size="sm" variant="secondary" :disabled="!canSave || canvasStore.saving" @click="saveFile">
            保存
          </UiButton>
          </template>
        </UiToolbar>

        <UiTextarea
          v-if="viewMode === 'edit'"
          v-model="draftContent"
          class="ai-canvas-panel__editor"
          resize="none"
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

    <UiEmptyState
      v-else
      class="ai-canvas-panel__empty"
      icon="iconify:lucide:panel-top"
      title="等待 Canvas 工作区"
      description="启用 Canvas 后，AI 可以在这里生成 Markdown、HTML 或 React 页面。"
    />

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
  padding: 12px;
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

.ai-canvas-panel__file.ui-button {
  justify-content: flex-start;
  gap: 2px;
  min-height: 48px;
  padding: 8px;
  text-align: left;

  :deep(.ui-button__label) {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

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
}

.ai-canvas-panel__workbench {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.ai-canvas-panel__toolbar {
  padding: 8px;
}

.ai-canvas-panel__editor.ui-textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  font-family: var(--ui-font-family-mono);
  font-size: 0.78rem;
  line-height: 1.55;
}

.ai-canvas-panel__empty {
  min-height: 0;
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
