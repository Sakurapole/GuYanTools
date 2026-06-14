<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { AiCanvasFile, AiCanvasMode, AiCanvasOperation } from '@/contracts/ai';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCard from '@/windows/main/components/ui/UiCard.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import UiToolbar from '@/windows/main/components/ui/UiToolbar.vue';
import { useAiCanvasStore } from '@/windows/main/stores/ai_canvas_store';

const props = defineProps<{
  conversationId: string;
  canvasEnabled: boolean;
}>();

const emit = defineEmits<{
  'update:canvasEnabled': [value: boolean];
  close: [];
}>();

const canvasStore = useAiCanvasStore();
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
const canPreview = computed(() => Boolean(activeWorkspace.value && activeFiles.value.length));
const operations = computed(() => canvasStore.activeOperations.slice(0, 8));
const pendingOperations = computed(() => operations.value.filter((operation) => operation.status === 'pending'));
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

async function openPreviewWindow() {
  if (!activeWorkspace.value || !activeFiles.value.length || !window.aiApi) {
    return;
  }

  const files = activeFiles.value.map((file) => ({
    ...file,
    content: file.path === selectedFilePath.value ? draftContent.value : file.content,
  }));

  await window.aiApi.openCanvasPreview({
    title: activeWorkspace.value.title,
    mode: activeWorkspace.value.mode,
    files,
    activePath: selectedFilePath.value || selectedFile.value?.path,
  });
}

async function renameWorkspace(value: string) {
  if (!activeWorkspace.value || !value.trim()) {
    return;
  }
  await canvasStore.updateWorkspace(activeWorkspace.value.id, { title: value.trim() });
}

async function applyOperation(operationId: string) {
  const result = await canvasStore.applyOperation(operationId);
  const firstFile = result.files[0];
  if (firstFile) {
    selectedFilePath.value = firstFile.path;
    draftContent.value = firstFile.content;
  }
}

async function rejectOperation(operationId: string) {
  await canvasStore.rejectOperation(operationId);
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

function operationStatusLabel(status: AiCanvasOperation['status']) {
  switch (status) {
    case 'pending': return '待确认';
    case 'applied': return '已应用';
    case 'rejected': return '已拒绝';
    default: return status;
  }
}

function operationPreview(operation: AiCanvasOperation) {
  const payload = parseOperationPayload(operation.payloadJson);
  const path = typeof payload.path === 'string' ? payload.path : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  const current = activeFiles.value.find((file) => file.path === path);
  if (operation.operationType === 'delete_file') {
    return `将删除 ${path || '目标文件'}`;
  }
  if (operation.operationType === 'append_file') {
    return `追加 ${content.length} 字符到 ${path}\n\n${previewText(content)}`;
  }
  if (operation.operationType === 'replace_file' || operation.operationType === 'patch_file') {
    const currentLength = current?.content.length ?? 0;
    return `${path}：当前 ${currentLength} 字符，提议 ${content.length} 字符\n\n${previewText(content)}`;
  }
  return operationPayload(operation.payloadJson);
}

function parseOperationPayload(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson);
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function previewText(value: string) {
  return value.length > 900 ? `${value.slice(0, 900)}\n...` : value;
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
          <UiIconButton
            size="sm"
            variant="ghost"
            title="关闭 Canvas"
            @click="emit('close')"
          >
            <IconRenderer icon="iconify:lucide:x" :size="15" />
          </UiIconButton>
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
          <span class="ai-canvas-panel__edit-label">编辑</span>
          <template #trailing>
            <UiButton size="sm" variant="ghost" :disabled="!canPreview" @click="openPreviewWindow">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:external-link" :size="14" />
              </template>
              预览
            </UiButton>
            <UiButton size="sm" variant="secondary" :disabled="!canSave || canvasStore.saving" @click="saveFile">
              保存
            </UiButton>
          </template>
        </UiToolbar>

        <UiTextarea
          v-model="draftContent"
          class="ai-canvas-panel__editor"
          resize="none"
          spellcheck="false"
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
      <UiCard class="ai-canvas-panel__history-block" padding="sm" radius="sm">
        <h4>AI 操作 <small v-if="pendingOperations.length">{{ pendingOperations.length }} 待确认</small></h4>
        <p v-if="canvasStore.error" class="ai-canvas-panel__error">{{ canvasStore.error }}</p>
        <p v-if="operations.length === 0">暂无操作</p>
        <ul v-else>
          <li v-for="operation in operations" :key="operation.id">
            <div class="ai-canvas-panel__operation-head">
              <span>{{ operationLabel(operation.operationType) }}</span>
              <small :class="`ai-canvas-panel__operation-status ai-canvas-panel__operation-status--${operation.status}`">
                {{ operationStatusLabel(operation.status) }}
              </small>
            </div>
            <small class="ai-canvas-panel__operation-target">{{ operationPayload(operation.payloadJson) }}</small>
            <pre v-if="operation.status === 'pending'" class="ai-canvas-panel__operation-preview">{{ operationPreview(operation) }}</pre>
            <div v-if="operation.status === 'pending'" class="ai-canvas-panel__operation-actions">
              <UiButton size="sm" variant="secondary" :disabled="canvasStore.saving" @click="applyOperation(operation.id)">
                应用
              </UiButton>
              <UiButton size="sm" variant="ghost" :disabled="canvasStore.saving" @click="rejectOperation(operation.id)">
                拒绝
              </UiButton>
            </div>
          </li>
        </ul>
      </UiCard>
      <UiCard class="ai-canvas-panel__history-block" padding="sm" radius="sm">
        <h4>版本</h4>
        <p v-if="versions.length === 0">暂无版本</p>
        <ul v-else>
          <li v-for="version in versions" :key="version.id">
            <span>v{{ version.versionNo }}</span>
            <small>{{ version.createdAt }}</small>
          </li>
        </ul>
      </UiCard>
    </footer>
  </aside>
</template>

<style lang="scss">
.ai-chat-workspace__canvas-popup .ai-canvas-panel,
.ai-canvas-panel {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--ui-surface-base, #f8fbfd);
  color: var(--ui-text-primary, #0f172a);
  font-family: var(--ui-font-family, inherit);
}

.ai-canvas-panel *,
.ai-canvas-panel *::before,
.ai-canvas-panel *::after {
  box-sizing: border-box;
}

.ai-canvas-panel__header,
.ai-canvas-panel__create,
.ai-canvas-panel__workspace,
.ai-canvas-panel__toolbar {
  border-bottom: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
}

.ai-canvas-panel__header {
  padding: 12px;
  background: var(--ui-surface-base, #f8fbfd);
}

.ai-canvas-panel__create {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px auto;
  gap: 8px;
  padding: 10px 12px;
  background: var(--ui-surface-panel, #fff);
}

.ai-canvas-panel__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px 12px;
  background: var(--ui-surface-panel, #fff);
}

.ai-canvas-panel__body {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.ai-canvas-panel__files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
  border-right: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  background: var(--ui-surface-muted, #eef4f8);
}

.ai-canvas-panel__file.ui-button {
  justify-content: flex-start;
  gap: 2px;
  min-height: 48px;
  padding: 8px;
  text-align: left;

  .ui-button__label {
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
    color: var(--ui-text-muted, #64748b);
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
  background: var(--ui-surface-panel, #fff);
}

.ai-canvas-panel__edit-label {
  color: var(--ui-text-secondary, #475569);
  font-size: 0.78rem;
  font-weight: 700;
}

.ai-canvas-panel__editor.ui-textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  font-family: var(--ui-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.78rem;
  line-height: 1.55;
}

.ai-canvas-panel__empty {
  min-height: 0;
  align-self: stretch;
  background: var(--ui-surface-panel, #fff);
}

.ai-canvas-panel__history {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-top: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  background: var(--ui-surface-muted, #eef4f8);
}

.ai-canvas-panel__history-block {
  min-width: 0;
  background: var(--ui-surface-panel, #fff);

  h4 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 6px;
    color: var(--ui-text-secondary, #475569);
    font-size: 0.72rem;

    small {
      color: var(--ui-color-warning, #b45309);
      font-size: 0.68rem;
      font-weight: 700;
    }
  }

  p,
  li {
    color: var(--ui-text-muted, #64748b);
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
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 6px 0;
    border-top: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.08));

    &:first-child {
      border-top: 0;
    }
  }

  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ai-canvas-panel__error {
  margin-bottom: 6px;
  color: var(--ui-color-danger, #dc2626) !important;
}

.ai-canvas-panel__operation-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.ai-canvas-panel__operation-target {
  display: block;
}

.ai-canvas-panel__operation-status {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--ui-surface-muted, #eef4f8);
  color: var(--ui-text-muted, #64748b);

  &--pending {
    background: rgba(245, 158, 11, 0.14);
    color: var(--ui-color-warning, #b45309);
  }

  &--applied {
    background: rgba(22, 163, 74, 0.12);
    color: var(--ui-color-success, #15803d);
  }

  &--rejected {
    background: rgba(100, 116, 139, 0.12);
    color: var(--ui-text-muted, #64748b);
  }
}

.ai-canvas-panel__operation-preview {
  max-height: 94px;
  margin: 0;
  padding: 7px;
  overflow: auto;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-muted, #eef4f8);
  color: var(--ui-text-secondary, #475569);
  font-family: var(--ui-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.68rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

.ai-canvas-panel__operation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
