import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AiMemory,
  AiProject,
  CreateAiMemoryPayload,
  CreateAiProjectPayload,
  ListAiMemoriesPayload,
  UpdateAiMemoryPayload,
  UpdateAiProjectPayload,
} from '@/contracts/ai';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useAiContextStore = defineStore('ai-context', () => {
  const projects = ref<AiProject[]>([]);
  const memories = ref<AiMemory[]>([]);
  const activeProjectId = ref('');
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');

  const activeProject = computed(() =>
    projects.value.find((project) => project.id === activeProjectId.value) ?? null,
  );
  const enabledMemories = computed(() => memories.value.filter((memory) => memory.enabled));

  async function refresh() {
    if (!window.aiApi) {
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const [nextProjects, nextMemories] = await Promise.all([
        window.aiApi.listProjects(),
        window.aiApi.listMemories({ limit: 200 }),
      ]);
      projects.value = nextProjects;
      memories.value = nextMemories;
      if (activeProjectId.value && !nextProjects.some((project) => project.id === activeProjectId.value)) {
        activeProjectId.value = '';
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  async function listMemories(input?: ListAiMemoriesPayload) {
    if (!window.aiApi) {
      return [];
    }
    const nextMemories = await window.aiApi.listMemories(input ? clone(input) : undefined);
    if (!input || (!input.scope && !input.scopeId)) {
      memories.value = nextMemories;
    }
    return nextMemories;
  }

  async function createProject(input: CreateAiProjectPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    saving.value = true;
    error.value = '';
    try {
      const project = await window.aiApi.createProject(clone(input));
      upsertProject(project);
      activeProjectId.value = project.id;
      return project;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function updateProject(id: string, input: UpdateAiProjectPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    const project = await window.aiApi.updateProject(id, clone(input));
    upsertProject(project);
    return project;
  }

  async function deleteProject(id: string) {
    if (!window.aiApi) {
      return;
    }
    await window.aiApi.deleteProject(id);
    projects.value = projects.value.filter((project) => project.id !== id);
    if (activeProjectId.value === id) {
      activeProjectId.value = '';
    }
  }

  async function createMemory(input: CreateAiMemoryPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    saving.value = true;
    error.value = '';
    try {
      const memory = await window.aiApi.createMemory(clone(input));
      upsertMemory(memory);
      return memory;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function updateMemory(id: string, input: UpdateAiMemoryPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    const memory = await window.aiApi.updateMemory(id, clone(input));
    upsertMemory(memory);
    return memory;
  }

  async function deleteMemory(id: string) {
    if (!window.aiApi) {
      return;
    }
    await window.aiApi.deleteMemory(id);
    memories.value = memories.value.filter((memory) => memory.id !== id);
  }

  function upsertProject(project: AiProject) {
    projects.value = [project, ...projects.value.filter((item) => item.id !== project.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  function upsertMemory(memory: AiMemory) {
    memories.value = [memory, ...memories.value.filter((item) => item.id !== memory.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  return {
    projects,
    memories,
    activeProjectId,
    activeProject,
    enabledMemories,
    loading,
    saving,
    error,
    refresh,
    listMemories,
    createProject,
    updateProject,
    deleteProject,
    createMemory,
    updateMemory,
    deleteMemory,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAiContextStore, import.meta.hot));
}
