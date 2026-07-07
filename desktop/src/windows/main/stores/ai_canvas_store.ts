import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AiCanvasFile,
  AiCanvasMode,
  AiCanvasOperation,
  AiCanvasVersion,
  AiCanvasWorkspace,
  AiStreamEvent,
  CreateAiCanvasWorkspacePayload,
  UpdateAiCanvasOperationPayload,
  UpdateAiCanvasWorkspacePayload,
  UpsertAiCanvasFilePayload,
} from '@/contracts/ai';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useAiCanvasStore = defineStore('ai-canvas', () => {
  const workspacesByConversation = ref<Record<string, AiCanvasWorkspace[]>>({});
  const filesByWorkspace = ref<Record<string, AiCanvasFile[]>>({});
  const versionsByWorkspace = ref<Record<string, AiCanvasVersion[]>>({});
  const operationsByWorkspace = ref<Record<string, AiCanvasOperation[]>>({});
  const activeWorkspaceIdByConversation = ref<Record<string, string>>({});
  const activeConversationId = ref('');
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  let unsubscribeStream: (() => void) | null = null;

  const activeWorkspaceId = computed(() => {
    const conversationId = activeConversationId.value;
    return conversationId ? activeWorkspaceIdByConversation.value[conversationId] ?? '' : '';
  });
  const activeWorkspace = computed(() => {
    const conversationId = activeConversationId.value;
    const workspaceId = activeWorkspaceId.value;
    return (workspacesByConversation.value[conversationId] ?? []).find((workspace) => workspace.id === workspaceId) ?? null;
  });
  const activeFiles = computed(() => activeWorkspaceId.value ? filesByWorkspace.value[activeWorkspaceId.value] ?? [] : []);
  const activeVersions = computed(() => activeWorkspaceId.value ? versionsByWorkspace.value[activeWorkspaceId.value] ?? [] : []);
  const activeOperations = computed(() =>
    activeWorkspaceId.value ? operationsByWorkspace.value[activeWorkspaceId.value] ?? [] : [],
  );

  function ensureStreamSubscription() {
    if (unsubscribeStream || !window.aiApi) {
      return;
    }
    unsubscribeStream = window.aiApi.onStreamEvent(handleStreamEvent);
  }

  async function loadForConversation(conversationId: string) {
    activeConversationId.value = conversationId;
    if (!window.aiApi || !conversationId) {
      return [];
    }

    loading.value = true;
    error.value = '';
    try {
      const workspaces = await window.aiApi.listCanvasWorkspaces(conversationId);
      workspacesByConversation.value = {
        ...workspacesByConversation.value,
        [conversationId]: workspaces,
      };
      const activeWorkspaceId = activeWorkspaceIdByConversation.value[conversationId] || workspaces[0]?.id || '';
      if (activeWorkspaceId) {
        activeWorkspaceIdByConversation.value = {
          ...activeWorkspaceIdByConversation.value,
          [conversationId]: activeWorkspaceId,
        };
        await loadWorkspaceDetails(activeWorkspaceId);
      }
      return workspaces;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  async function setActiveWorkspace(conversationId: string, workspaceId: string) {
    activeConversationId.value = conversationId;
    activeWorkspaceIdByConversation.value = {
      ...activeWorkspaceIdByConversation.value,
      [conversationId]: workspaceId,
    };
    await loadWorkspaceDetails(workspaceId);
  }

  async function loadWorkspaceDetails(workspaceId: string) {
    if (!window.aiApi || !workspaceId) {
      return;
    }

    const [files, versions, operations] = await Promise.all([
      window.aiApi.listCanvasFiles(workspaceId),
      window.aiApi.listCanvasVersions(workspaceId),
      window.aiApi.listCanvasOperations(workspaceId),
    ]);
    filesByWorkspace.value = { ...filesByWorkspace.value, [workspaceId]: files };
    versionsByWorkspace.value = { ...versionsByWorkspace.value, [workspaceId]: versions };
    operationsByWorkspace.value = { ...operationsByWorkspace.value, [workspaceId]: operations };
  }

  async function createWorkspace(input: CreateAiCanvasWorkspacePayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    saving.value = true;
    error.value = '';
    try {
      const result = await window.aiApi.createCanvasWorkspace(clone(input));
      upsertWorkspace(result.workspace);
      filesByWorkspace.value = { ...filesByWorkspace.value, [result.workspace.id]: result.files };
      if (result.version) {
        versionsByWorkspace.value = { ...versionsByWorkspace.value, [result.workspace.id]: [result.version] };
      }
      activeConversationId.value = input.conversationId;
      activeWorkspaceIdByConversation.value = {
        ...activeWorkspaceIdByConversation.value,
        [input.conversationId]: result.workspace.id,
      };
      return result;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function updateWorkspace(id: string, input: UpdateAiCanvasWorkspacePayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    const workspace = await window.aiApi.updateCanvasWorkspace(id, clone(input));
    upsertWorkspace(workspace);
    return workspace;
  }

  async function upsertFile(input: UpsertAiCanvasFilePayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    saving.value = true;
    try {
      const file = await window.aiApi.upsertCanvasFile(clone(input));
      upsertFileState(file);
      await loadWorkspaceDetails(input.workspaceId);
      return file;
    } finally {
      saving.value = false;
    }
  }

  async function updateOperation(id: string, input: UpdateAiCanvasOperationPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    const operation = await window.aiApi.updateCanvasOperation(id, clone(input));
    upsertOperationState(operation);
    return operation;
  }

  async function applyOperation(id: string) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    saving.value = true;
    error.value = '';
    try {
      const result = await window.aiApi.applyCanvasOperation(id);
      upsertOperationState(result.operation);
      filesByWorkspace.value = { ...filesByWorkspace.value, [result.operation.workspaceId]: result.files };
      await loadWorkspaceDetails(result.operation.workspaceId);
      return result;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function rejectOperation(id: string) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }
    saving.value = true;
    error.value = '';
    try {
      const operation = await window.aiApi.rejectCanvasOperation(id);
      upsertOperationState(operation);
      await loadWorkspaceDetails(operation.workspaceId);
      return operation;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function deleteWorkspace(conversationId: string, workspaceId: string) {
    if (!window.aiApi) {
      return;
    }
    await window.aiApi.deleteCanvasWorkspace(workspaceId);
    const workspaces = (workspacesByConversation.value[conversationId] ?? []).filter((workspace) => workspace.id !== workspaceId);
    workspacesByConversation.value = {
      ...workspacesByConversation.value,
      [conversationId]: workspaces,
    };
    delete filesByWorkspace.value[workspaceId];
    delete versionsByWorkspace.value[workspaceId];
    delete operationsByWorkspace.value[workspaceId];
    if (activeWorkspaceIdByConversation.value[conversationId] === workspaceId) {
      activeWorkspaceIdByConversation.value = {
        ...activeWorkspaceIdByConversation.value,
        [conversationId]: workspaces[0]?.id ?? '',
      };
    }
  }

  function preferredModeForPrompt(): AiCanvasMode {
    return activeWorkspace.value?.mode ?? 'markdown';
  }

  function upsertWorkspace(workspace: AiCanvasWorkspace) {
    const current = workspacesByConversation.value[workspace.conversationId] ?? [];
    const next = [workspace, ...current.filter((item) => item.id !== workspace.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    workspacesByConversation.value = {
      ...workspacesByConversation.value,
      [workspace.conversationId]: next,
    };
  }

  function upsertFileState(file: AiCanvasFile) {
    const current = filesByWorkspace.value[file.workspaceId] ?? [];
    const index = current.findIndex((item) => item.id === file.id || item.path === file.path);
    const next = [...current];
    if (index >= 0) {
      next[index] = file;
    } else {
      next.push(file);
    }
    filesByWorkspace.value = {
      ...filesByWorkspace.value,
      [file.workspaceId]: next.sort((left, right) => left.path.localeCompare(right.path)),
    };
  }

  function upsertOperationState(operation: AiCanvasOperation) {
    const current = operationsByWorkspace.value[operation.workspaceId] ?? [];
    operationsByWorkspace.value = {
      ...operationsByWorkspace.value,
      [operation.workspaceId]: [operation, ...current.filter((item) => item.id !== operation.id)].slice(0, 50),
    };
  }

  function handleStreamEvent(event: AiStreamEvent) {
    if (event.type === 'canvas-workspace') {
      upsertWorkspace(event.workspace);
      activeWorkspaceIdByConversation.value = {
        ...activeWorkspaceIdByConversation.value,
        [event.conversationId]: event.workspace.id,
      };
      return;
    }

    if (event.type === 'canvas-file') {
      upsertFileState(event.file);
      return;
    }

    if (event.type === 'canvas-operation') {
      upsertOperationState(event.operation);
    }
  }

  function dispose() {
    unsubscribeStream?.();
    unsubscribeStream = null;
  }

  return {
    workspacesByConversation,
    filesByWorkspace,
    versionsByWorkspace,
    operationsByWorkspace,
    activeWorkspaceIdByConversation,
    activeConversationId,
    activeWorkspaceId,
    activeWorkspace,
    activeFiles,
    activeVersions,
    activeOperations,
    loading,
    saving,
    error,
    ensureStreamSubscription,
    loadForConversation,
    loadWorkspaceDetails,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    upsertFile,
    updateOperation,
    applyOperation,
    rejectOperation,
    deleteWorkspace,
    preferredModeForPrompt,
    dispose,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAiCanvasStore, import.meta.hot));
}
