import { defineStore } from "pinia";
import { ref } from "vue";

interface TabPageInfo {
    id: number;
    name: string;
    url: string;
    icon?: string;
    active: boolean;
}

export const useBarStore = defineStore('bar', () => {
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
            name: 'Home',
            url: '/home',
            icon: 'home',
            active: true
        },
        {
            id: 2,
            name: 'Settings',
            url: '/settings',
            icon: 'settings',
            active: false
        },
        {
            id: 3,
            name: 'About',
            url: '/about',
            icon: 'info',
            active: false
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