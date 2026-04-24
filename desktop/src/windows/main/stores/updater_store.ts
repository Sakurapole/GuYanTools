import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { UpdateInfo, UpdateProgress, UpdateStatus } from '@/contracts/updater';

function defaultState(): UpdateInfo {
  return {
    status: 'idle',
    supported: false,
    platform: 'win32',
    currentVersion: '0.0.0',
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    manualUrl: 'https://github.com/Sakurapole/GuYanTools/releases/latest',
    progress: null,
    error: null,
  };
}

export const useUpdaterStore = defineStore('updater', () => {
  const info = ref<UpdateInfo>(defaultState());
  const initialized = ref(false);
  const isBusy = ref(false);
  const notifiedVersion = ref('');
  let removeListener: (() => void) | null = null;

  const status = computed<UpdateStatus>(() => info.value.status);
  const progress = computed<UpdateProgress | null>(() => info.value.progress ?? null);
  const releaseNotesSummary = computed(() => info.value.releaseNotes ?? '暂无更新说明。');

  function applyInfo(nextInfo: UpdateInfo) {
    info.value = {
      ...defaultState(),
      ...nextInfo,
    };

    if (
      info.value.status === 'available'
      && info.value.latestVersion
      && info.value.latestVersion !== notifiedVersion.value
      && window.notificationApi
    ) {
      notifiedVersion.value = info.value.latestVersion;
      void window.notificationApi.show({
        type: 'text',
        size: 'md',
        title: '发现新版本',
        message: `GuYanTools ${info.value.latestVersion} 已可下载`,
        duration: 5000,
        clickRoute: '/settings',
      });
    }
  }

  async function initialize() {
    if (initialized.value) {
      return;
    }

    initialized.value = true;
    removeListener = window.updateApi.onEvent((payload) => {
      applyInfo(payload);
      isBusy.value = payload.status === 'checking' || payload.status === 'downloading';
    });

    applyInfo(await window.updateApi.getStatus());
  }

  async function checkForUpdates() {
    isBusy.value = true;
    try {
      applyInfo(await window.updateApi.check());
    } finally {
      isBusy.value = status.value === 'checking' || status.value === 'downloading';
    }
  }

  async function downloadUpdate() {
    isBusy.value = true;
    try {
      applyInfo(await window.updateApi.download());
    } finally {
      isBusy.value = status.value === 'checking' || status.value === 'downloading';
    }
  }

  async function installUpdate() {
    await window.updateApi.install();
  }

  async function openReleasePage() {
    await window.updateApi.openReleasePage();
  }

  function dispose() {
    removeListener?.();
    removeListener = null;
    initialized.value = false;
  }

  return {
    info,
    status,
    progress,
    releaseNotesSummary,
    isBusy,
    initialized,
    initialize,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    openReleasePage,
    dispose,
  };
});
