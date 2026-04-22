import { defineStore } from "pinia";
import { ref } from "vue";

export interface AppTabDefinition {
    id: string;
    name: string;
    url: string;
    icon?: string;
    active: boolean;
    closable: boolean;
}

const FIXED_TABS: AppTabDefinition[] = [
    {
        id: 'home',
        name: '首页',
        url: '/home',
        icon: 'home',
        active: true,
        closable: false,
    },
    {
        id: 'terminal',
        name: '终端',
        url: '/terminal',
        icon: 'terminal',
        active: false,
        closable: false,
    },
    {
        id: 'settings',
        name: '设置',
        url: '/settings',
        icon: 'settings',
        active: false,
        closable: false,
    },
    {
        id: 'ftp',
        name: '传输',
        url: '/ftp',
        icon: 'ftp',
        active: false,
        closable: false,
    }
];

// 开发模式下添加调试工具标签
if (import.meta.env.DEV) {
    FIXED_TABS.push({
        id: 'devtools',
        name: '🛠 调试',
        url: '/devtools',
        icon: 'devtools',
        active: false,
        closable: false,
    });
}

function cloneFixedTabs() {
    return FIXED_TABS.map(tab => ({ ...tab }));
}

export const useBarStore = defineStore('bar', () => {
    const sidebarVisible = ref(false);
    const toggleSidebar = () => {
        sidebarVisible.value = !sidebarVisible.value;
    }
    const setSidebarVisible = (visible: boolean) => {
        sidebarVisible.value = visible;
    }

    const tabPages = ref<AppTabDefinition[]>(cloneFixedTabs());

    const ensureFixedTabs = () => {
        const existingMap = new Map(tabPages.value.map(tab => [tab.id, tab]));
        tabPages.value = FIXED_TABS.map(tab => ({
            ...tab,
            active: existingMap.get(tab.id)?.active ?? tab.active,
        })).concat(tabPages.value.filter(tab => !FIXED_TABS.some(fixed => fixed.id === tab.id)));
    };

    const activateTabByUrl = (url: string) => {
        ensureFixedTabs();

        // 第一阶段：尝试精确匹配 fullPath
        const exactMatch = tabPages.value.some(tab => tab.url === url);

        if (exactMatch) {
            tabPages.value = tabPages.value.map(tab => ({
                ...tab,
                active: tab.url === url,
            }));
            return;
        }

        // 第二阶段：fallback — 按 path 部分匹配（去掉 query 参数）
        const urlPath = url.split('?')[0];
        const pathMatch = tabPages.value.some(tab => tab.url.split('?')[0] === urlPath);

        if (pathMatch) {
            // 只激活第一个 path 匹配的 tab（避免多 webview tab 同时 active）
            let activated = false;
            tabPages.value = tabPages.value.map(tab => {
                const tabPath = tab.url.split('?')[0];
                const shouldActivate = !activated && tabPath === urlPath;
                if (shouldActivate) activated = true;
                return { ...tab, active: shouldActivate };
            });
            return;
        }

        // 无匹配 → 全部取消 active
        tabPages.value = tabPages.value.map(tab => ({
            ...tab,
            active: false,
        }));
    };

    const closeTab = (id: string) => {
        const target = tabPages.value.find(tab => tab.id === id);
        if (!target || !target.closable) {
            return '/home';
        }

        const wasActive = target.active;
        tabPages.value = tabPages.value.filter(tab => tab.id !== id);

        if (wasActive) {
            const fallback = tabPages.value.find(tab => !tab.closable) ?? tabPages.value[0];
            if (fallback) {
                activateTabByUrl(fallback.url);
                return fallback.url;
            }
        }

        return null;
    };

    const getActiveTab = () => {
        return tabPages.value.find(tab => tab.active);
    };

    /** 打开一个页面 Tab：已存在则激活，不存在则添加（可关闭） */
    const openTab = (url: string, name: string, icon?: string) => {
        const existing = tabPages.value.find(tab => tab.url === url);
        if (existing) {
            activateTabByUrl(url);
            return;
        }
        // 添加新的可关闭 Tab
        const newTab: AppTabDefinition = {
            id: `tab-${Date.now()}`,
            name,
            url,
            icon,
            active: false,
            closable: true,
        };
        tabPages.value.push(newTab);
        activateTabByUrl(url);
    };

    /** 更新匹配 URL 的 Tab 名称（用于 webview 页面标题动态更新） */
    const updateTabName = (tabUrl: string, newName: string) => {
        // 优先精确匹配，fallback 到 startsWith 前缀匹配
        const tab = tabPages.value.find(t => t.url === tabUrl)
            ?? tabPages.value.find(t => t.url.startsWith(tabUrl));
        if (tab && newName) {
            tab.name = newName;
        }
    };

    return {
        sidebarVisible,
        toggleSidebar,
        setSidebarVisible,
        tabPages,
        ensureFixedTabs,
        activateTabByUrl,
        openTab,
        updateTabName,
        closeTab,
        getActiveTab,
    }
})
