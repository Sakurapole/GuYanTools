import { defineStore } from "pinia";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

interface TabPageInfo {
    id: number;
    name: string;
    url: string;
    icon?: string;
    active: boolean;
    closable?: boolean; // 是否可关闭，默认为 true
}

export const useBarStore = defineStore('bar', () => {
    const { t } = useI18n()

    const sidebarVisible = ref(false);
    const toggleSidebar = () => {
        sidebarVisible.value = !sidebarVisible.value;
    }
    const setSidebarVisible = (visible: boolean) => {
        sidebarVisible.value = visible;
    }

    const tabPages = ref<TabPageInfo[]>([
        {
            id: 1,
            name: t('tab.home'),
            url: '/home',
            icon: 'home',
            active: true,
            closable: false // 首页不可关闭
        }
    ]);

    const getActiveTab = () => {
        return tabPages.value.find(tab => tab.active);
    };

    return {
        sidebarVisible,
        toggleSidebar,
        setSidebarVisible,
        tabPages,
        getActiveTab,
    }
})