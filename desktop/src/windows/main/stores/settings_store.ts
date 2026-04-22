import { defineStore } from "pinia";
import { ref } from "vue";

export const useSettingStore = defineStore('settings', () => {
    const activeSettingsTab = ref<'general' | 'ai-agent' | 'plugins' | 'web-security'>('general');
    const activePluginConfigId = ref<string>('');

    const setActiveSettingsTab = (value: 'general' | 'ai-agent' | 'plugins' | 'web-security') => {
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
    }
})
