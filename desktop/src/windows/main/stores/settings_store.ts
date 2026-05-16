import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppSettingsTabId } from '@/contracts/app_config';

export type SettingsTabKey = AppSettingsTabId;

export const useSettingStore = defineStore('settings', () => {
    const activeSettingsTab = ref<SettingsTabKey>('general');
    const activePluginConfigId = ref<string>('');

    const setActiveSettingsTab = (value: SettingsTabKey) => {
        activeSettingsTab.value = value;
    };

    const setActivePluginConfigId = (value: string) => {
        activePluginConfigId.value = value;
    };

    return {
        activeSettingsTab,
        activePluginConfigId,
        setActiveSettingsTab,
        setActivePluginConfigId,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSettingStore, import.meta.hot));
}
