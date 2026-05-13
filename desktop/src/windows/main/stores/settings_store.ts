import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';

export type SettingsTabKey = 'general' | 'file-transfer' | 'web-security' | 'ai-agent' | 'plugins' | 'terminal' | 'multi-device-clipboard' | 'shortcuts';

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
