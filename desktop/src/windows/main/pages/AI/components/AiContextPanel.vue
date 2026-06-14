<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { AiMemory, AiMemoryScope } from '@/contracts/ai';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCard from '@/windows/main/components/ui/UiCard.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiSwitch from '@/windows/main/components/ui/UiSwitch.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { useAiContextStore } from '@/windows/main/stores/ai_context_store';

const props = defineProps<{
  activeAssistantId: string;
  activeConversationProjectId?: string;
}>();

const emit = defineEmits<{
  close: [];
  projectChange: [projectId: string];
}>();

const contextStore = useAiContextStore();
const newProjectName = ref('新项目');
const projectNameDraft = ref('');
const projectInstructionsDraft = ref('');
const memoryScope = ref<AiMemoryScope>('global');
const memoryContent = ref('');
const memoryDrafts = ref<Record<string, string>>({});

const projectOptions = computed(() => [
  { label: '无项目', value: '' },
  ...contextStore.projects.map((project) => ({ label: project.name, value: project.id })),
]);
const memoryScopeOptions = computed(() => [
  { label: '全局', value: 'global' },
  { label: '当前项目', value: 'project', disabled: !contextStore.activeProject },
  { label: '当前助手', value: 'assistant', disabled: !props.activeAssistantId },
]);
const visibleMemories = computed(() => contextStore.memories);

watch(
  () => props.activeConversationProjectId,
  (projectId) => {
    contextStore.activeProjectId = projectId ?? '';
  },
  { immediate: true },
);

watch(
  () => contextStore.activeProject,
  (project) => {
    projectNameDraft.value = project?.name ?? '';
    projectInstructionsDraft.value = project?.instructions ?? '';
    if (!project && memoryScope.value === 'project') {
      memoryScope.value = 'global';
    }
  },
  { immediate: true },
);

watch(
  () => contextStore.memories,
  (memories) => {
    memoryDrafts.value = Object.fromEntries(memories.map((memory) => [memory.id, memory.content]));
  },
  { immediate: true },
);

async function createProject() {
  const project = await contextStore.createProject({
    name: newProjectName.value,
    includeGlobalMemory: true,
  });
  emit('projectChange', project.id);
}

async function selectProject(value: string | number) {
  const projectId = String(value);
  contextStore.activeProjectId = projectId;
  emit('projectChange', projectId);
}

async function saveProject() {
  const project = contextStore.activeProject;
  if (!project) {
    return;
  }
  await contextStore.updateProject(project.id, {
    name: projectNameDraft.value,
    instructions: projectInstructionsDraft.value,
  });
}

async function toggleGlobalMemory(value: boolean) {
  const project = contextStore.activeProject;
  if (!project) {
    return;
  }
  await contextStore.updateProject(project.id, { includeGlobalMemory: value });
}

async function createMemory() {
  const content = memoryContent.value.trim();
  if (!content) {
    return;
  }
  const scope = memoryScope.value;
  await contextStore.createMemory({
    scope,
    scopeId: scope === 'project'
      ? contextStore.activeProject?.id
      : scope === 'assistant'
        ? props.activeAssistantId
        : undefined,
    content,
  });
  memoryContent.value = '';
}

async function updateMemory(memory: AiMemory) {
  const content = memoryDrafts.value[memory.id]?.trim();
  if (!content || content === memory.content) {
    return;
  }
  await contextStore.updateMemory(memory.id, { content });
}

async function toggleMemory(memory: AiMemory, enabled: boolean) {
  await contextStore.updateMemory(memory.id, { enabled });
}

function memoryScopeLabel(memory: AiMemory) {
  if (memory.scope === 'project') {
    return contextStore.projects.find((project) => project.id === memory.scopeId)?.name ?? '项目';
  }
  if (memory.scope === 'assistant') {
    return '助手';
  }
  return '全局';
}
</script>

<template>
  <aside class="ai-context-panel">
    <UiPanelHeader title="项目与记忆" subtitle="显式上下文，可查看、编辑、停用或删除">
      <template #actions>
        <UiIconButton size="sm" variant="ghost" title="关闭" @click="emit('close')">
          <IconRenderer icon="iconify:lucide:x" :size="15" />
        </UiIconButton>
      </template>
    </UiPanelHeader>

    <section class="ai-context-panel__section">
      <div class="ai-context-panel__row">
        <UiSelect
          :model-value="contextStore.activeProjectId"
          size="sm"
          :options="projectOptions"
          @change="selectProject"
        />
        <UiInput v-model="newProjectName" size="sm" placeholder="项目名称" />
        <UiButton size="sm" variant="primary" :disabled="contextStore.saving" @click="createProject">新建</UiButton>
      </div>

      <UiCard v-if="contextStore.activeProject" class="ai-context-panel__card" padding="sm" radius="sm">
        <UiInput v-model="projectNameDraft" size="sm" placeholder="项目名称" @change="saveProject" />
        <UiTextarea
          v-model="projectInstructionsDraft"
          :rows="5"
          resize="vertical"
          placeholder="项目说明会注入到本项目聊天上下文"
          @blur="saveProject"
        />
        <label class="ai-context-panel__switch">
          <span>使用全局记忆</span>
          <UiSwitch
            :model-value="contextStore.activeProject.includeGlobalMemory"
            aria-label="使用全局记忆"
            @update:modelValue="toggleGlobalMemory"
          />
        </label>
      </UiCard>
    </section>

    <section class="ai-context-panel__section ai-context-panel__section--fill">
      <div class="ai-context-panel__memory-create">
        <UiSelect v-model="memoryScope" size="sm" :options="memoryScopeOptions" />
        <UiTextarea v-model="memoryContent" :rows="3" resize="vertical" placeholder="输入一条明确、可复用的记忆" />
        <UiButton size="sm" variant="primary" :disabled="!memoryContent.trim() || contextStore.saving" @click="createMemory">
          记住
        </UiButton>
      </div>

      <div class="ai-context-panel__memory-list">
        <UiCard
          v-for="memory in visibleMemories"
          :key="memory.id"
          class="ai-context-panel__memory"
          padding="sm"
          radius="sm"
        >
          <div class="ai-context-panel__memory-head">
            <span>{{ memoryScopeLabel(memory) }}</span>
            <UiSwitch
              :model-value="memory.enabled"
              aria-label="启用记忆"
              @update:modelValue="toggleMemory(memory, $event)"
            />
          </div>
          <UiTextarea
            v-model="memoryDrafts[memory.id]"
            :rows="3"
            resize="vertical"
            @blur="updateMemory(memory)"
          />
          <div class="ai-context-panel__memory-actions">
            <small>{{ memory.updatedAt }}</small>
            <UiButton size="sm" variant="danger" @click="contextStore.deleteMemory(memory.id)">删除</UiButton>
          </div>
        </UiCard>
      </div>
    </section>

    <p v-if="contextStore.error" class="ai-context-panel__error">{{ contextStore.error }}</p>
  </aside>
</template>

<style lang="scss" scoped>
.ai-context-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-surface-base);
}

.ai-context-panel__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  border-top: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-context-panel__section--fill {
  overflow: hidden;
}

.ai-context-panel__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 8px;
}

.ai-context-panel__card,
.ai-context-panel__memory-create,
.ai-context-panel__memory {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-context-panel__switch,
.ai-context-panel__memory-head,
.ai-context-panel__memory-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--ui-text-secondary);
  font-size: 0.78rem;
}

.ai-context-panel__memory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}

.ai-context-panel__memory-head span {
  font-weight: 720;
}

.ai-context-panel__memory-actions small {
  overflow: hidden;
  color: var(--ui-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-context-panel__error {
  margin: 0;
  padding: 8px 12px;
  color: var(--ui-danger-color, #dc2626);
  font-size: 0.78rem;
}
</style>
