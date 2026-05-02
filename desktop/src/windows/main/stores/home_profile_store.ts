import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { HomeProfileDto } from '@/contracts/home_profile';

function getHomeProfileApi() {
  if (!window.homeProfileApi) {
    throw new Error('homeProfileApi is not available in renderer process');
  }
  return window.homeProfileApi;
}

export const useHomeProfileStore = defineStore('home-profile', () => {
  const profiles = ref<HomeProfileDto[]>([]);
  const activeProfileKey = ref('default');
  const loading = ref(false);
  const switching = ref(false);
  const error = ref('');

  const activeProfile = computed(() =>
    profiles.value.find(profile => profile.key === activeProfileKey.value) ?? profiles.value[0] ?? null
  );
  const canDeleteActiveProfile = computed(() => profiles.value.length > 1);

  async function loadProfiles() {
    loading.value = true;
    error.value = '';
    try {
      const api = getHomeProfileApi();
      const [nextProfiles, nextActiveKey] = await Promise.all([
        api.listProfiles(),
        api.getActiveProfileKey(),
      ]);
      profiles.value = nextProfiles;
      activeProfileKey.value = nextActiveKey;
    } catch (err) {
      console.error('[HomeProfile] 加载首页配置文件失败:', err);
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function switchProfile(key: string) {
    if (key === activeProfileKey.value || switching.value) {
      return;
    }

    switching.value = true;
    error.value = '';
    try {
      const profile = await getHomeProfileApi().setActiveProfile(key);
      activeProfileKey.value = profile.key;
      const existingIndex = profiles.value.findIndex(item => item.key === profile.key);
      if (existingIndex >= 0) {
        profiles.value.splice(existingIndex, 1, profile);
      }
    } catch (err) {
      console.error('[HomeProfile] 切换首页配置文件失败:', err);
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      switching.value = false;
    }
  }

  async function createProfile(name: string) {
    switching.value = true;
    error.value = '';
    try {
      const api = getHomeProfileApi();
      const profile = await api.createProfile({ name });
      profiles.value.push(profile);
      const active = await api.setActiveProfile(profile.key);
      activeProfileKey.value = active.key;
      return active;
    } catch (err) {
      console.error('[HomeProfile] 创建首页配置文件失败:', err);
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      switching.value = false;
    }
  }

  async function renameProfile(key: string, name: string) {
    error.value = '';
    try {
      const profile = await getHomeProfileApi().renameProfile(key, name);
      const index = profiles.value.findIndex(item => item.key === key);
      if (index >= 0) {
        profiles.value.splice(index, 1, profile);
      }
      return profile;
    } catch (err) {
      console.error('[HomeProfile] 重命名首页配置文件失败:', err);
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function deleteProfile(key: string) {
    error.value = '';
    try {
      const result = await getHomeProfileApi().deleteProfile(key);
      profiles.value = result.profiles;
      activeProfileKey.value = result.activeProfileKey;
      return result;
    } catch (err) {
      console.error('[HomeProfile] 删除首页配置文件失败:', err);
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  return {
    profiles,
    activeProfileKey,
    activeProfile,
    canDeleteActiveProfile,
    loading,
    switching,
    error,
    loadProfiles,
    switchProfile,
    createProfile,
    renameProfile,
    deleteProfile,
  };
});
