import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  SyncCenterState,
  SyncConflictResolution,
  SyncConflictSummary,
  SyncPendingItemSummary,
  SyncProfileSummary,
  SyncProviderConfig,
  SyncServerLoginPayload,
  SyncServerLoginResult,
  UpdateSyncServerConfigPayload,
  UpdateSyncWebDavConfigPayload,
} from '@/contracts/sync';

export const useSyncStore = defineStore('sync', () => {
  const state = ref<SyncCenterState | null>(null);
  const profiles = ref<SyncProfileSummary[]>([]);
  const conflicts = ref<SyncConflictSummary[]>([]);
  const pendingItems = ref<SyncPendingItemSummary[]>([]);
  const providerConfig = ref<SyncProviderConfig | null>(null);
  const loading = ref(false);
  const error = ref('');

  async function refresh() {
    if (!window.syncApi) {
      return;
    }

    loading.value = true;
    error.value = '';
    try {
      const [nextState, nextProfiles, nextConflicts, nextPendingItems] = await Promise.all([
        window.syncApi.getState(),
        window.syncApi.listProfiles(),
        window.syncApi.listConflicts(),
        window.syncApi.listPendingItems(),
      ]);
      state.value = nextState;
      profiles.value = nextProfiles;
      conflicts.value = nextConflicts;
      pendingItems.value = nextPendingItems;
      providerConfig.value = await window.syncApi.getProviderConfig();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function syncNow() {
    if (!window.syncApi) {
      return null;
    }

    loading.value = true;
    error.value = '';
    try {
      const summary = await window.syncApi.syncNow();
      await refresh();
      return summary;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      await refresh();
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function updateWebDavConfig(payload: UpdateSyncWebDavConfigPayload) {
    if (!window.syncApi) {
      return null;
    }

    providerConfig.value = await window.syncApi.updateWebDavConfig(payload);
    return providerConfig.value;
  }

  async function updateSyncServerConfig(payload: UpdateSyncServerConfigPayload) {
    if (!window.syncApi) {
      return null;
    }

    providerConfig.value = await window.syncApi.updateSyncServerConfig(payload);
    return providerConfig.value;
  }

  async function loginSyncServer(payload: SyncServerLoginPayload): Promise<SyncServerLoginResult | null> {
    if (!window.syncApi) {
      return null;
    }

    const result = await window.syncApi.loginSyncServer(payload);
    providerConfig.value = await window.syncApi.getProviderConfig();
    return result;
  }

  async function logoutSyncServer() {
    if (!window.syncApi) {
      return null;
    }

    const config = await window.syncApi.logoutSyncServer();
    providerConfig.value = config;
    await refresh();
    return config;
  }

  async function testConnection() {
    if (!window.syncApi) {
      return null;
    }

    return window.syncApi.testConnection();
  }

  async function applyProfile(profileId: string) {
    if (!window.syncApi) {
      return;
    }

    await window.syncApi.applyProfile(profileId);
    await refresh();
  }

  async function setDefaultProfile(profileId: string) {
    if (!window.syncApi) {
      return;
    }

    await window.syncApi.setDefaultProfile(profileId);
    await refresh();
  }

  async function resolveConflict(conflictId: string, resolution: SyncConflictResolution) {
    if (!window.syncApi) {
      return;
    }

    await window.syncApi.resolveConflict(conflictId, resolution);
    await refresh();
  }

  function bindEvents() {
    return window.syncApi?.onEvent((event) => {
      if (event.type === 'state-changed') {
        state.value = event.state;
      } else {
        void refresh();
      }
    }) ?? (() => undefined);
  }

  return {
    state,
    profiles,
    conflicts,
    pendingItems,
    providerConfig,
    loading,
    error,
    refresh,
    syncNow,
    updateWebDavConfig,
    updateSyncServerConfig,
    loginSyncServer,
    logoutSyncServer,
    testConnection,
    applyProfile,
    setDefaultProfile,
    resolveConflict,
    bindEvents,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSyncStore, import.meta.hot));
}
