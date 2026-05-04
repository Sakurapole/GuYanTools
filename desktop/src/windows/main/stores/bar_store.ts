import { defineStore } from "pinia";
import { ref, watch } from "vue";
import {
    APP_INTERNAL_FUNCTIONS,
    type AppBottomBarTabId,
} from '@/contracts/app_config';
import { useAppConfigStore } from './app_config_store';

export interface AppTabDefinition {
    id: string;
    name: string;
    url: string;
    icon?: string;
    active: boolean;
    closable: boolean;
}

const INTERNAL_TABS: AppTabDefinition[] = APP_INTERNAL_FUNCTIONS
    .filter(item => !item.devOnly || import.meta.env.DEV)
    .map(item => ({
        id: item.id,
        name: item.label,
        url: item.route,
        icon: item.icon,
        active: item.id === 'home',
        closable: false,
    }));

const TAB_ORDER_STORAGE_KEY = 'guyantools.bottombar.tab-order';

function cloneTab(tab: AppTabDefinition) {
    return { ...tab };
}

function isFixedTabId(id: string): id is AppBottomBarTabId {
    return INTERNAL_TABS.some(tab => tab.id === id);
}

function readSavedTabOrder(): string[] {
    try {
        const raw = window.localStorage.getItem(TAB_ORDER_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];

        const seen = new Set<string>();
        return parsed.filter((id): id is string => {
            if (typeof id !== 'string' || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    } catch {
        return [];
    }
}

function persistTabOrder(tabs: AppTabDefinition[]) {
    try {
        window.localStorage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(tabs.map(tab => tab.id)));
    } catch {
        // localStorage can fail in restricted contexts; runtime order still remains valid.
    }
}

function orderTabs(tabs: AppTabDefinition[], savedOrder = readSavedTabOrder()) {
    if (!savedOrder.length) {
        return tabs.map(cloneTab);
    }

    const indexById = new Map(savedOrder.map((id, index) => [id, index]));
    return tabs
        .map((tab, index) => ({ tab: cloneTab(tab), index }))
        .sort((left, right) => {
            if (isFixedTabId(left.tab.id) && isFixedTabId(right.tab.id)) {
                return left.index - right.index;
            }

            const leftIndex = indexById.get(left.tab.id);
            const rightIndex = indexById.get(right.tab.id);
            if (leftIndex !== undefined && rightIndex !== undefined) {
                return leftIndex - rightIndex;
            }
            if (leftIndex !== undefined) return -1;
            if (rightIndex !== undefined) return 1;
            return left.index - right.index;
        })
        .map(item => item.tab);
}

function resolveVisibleFixedTabs(visibleTabIds: string[]) {
    const visibleSet = new Set(visibleTabIds);

    return visibleTabIds
        .map(tabId => INTERNAL_TABS.find(tab => tab.id === tabId))
        .filter((tab): tab is AppTabDefinition => Boolean(tab) && visibleSet.has(tab.id));
}

export const useBarStore = defineStore('bar', () => {
    const appConfigStore = useAppConfigStore();
    const sidebarVisible = ref(false);
    const toggleSidebar = () => {
        sidebarVisible.value = !sidebarVisible.value;
    }
    const setSidebarVisible = (visible: boolean) => {
        sidebarVisible.value = visible;
    }

    const getConfiguredFixedTabs = () => resolveVisibleFixedTabs(appConfigStore.config.bottomBar.defaultVisibleTabIds);
    const tabPages = ref<AppTabDefinition[]>(orderTabs(getConfiguredFixedTabs()));

    const ensureFixedTabs = () => {
        const existingMap = new Map(tabPages.value.map(tab => [tab.id, tab]));
        const fixedTabs = getConfiguredFixedTabs().map(tab => ({
            ...tab,
            active: existingMap.get(tab.id)?.active ?? tab.active,
        }));
        const runtimeTabs = tabPages.value.filter(tab => !isFixedTabId(tab.id));
        tabPages.value = orderTabs(fixedTabs.concat(runtimeTabs));
    };

    watch(
        () => appConfigStore.config.bottomBar.defaultVisibleTabIds.slice(),
        ensureFixedTabs,
    );

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
        persistTabOrder(tabPages.value);

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
        persistTabOrder(tabPages.value);
        activateTabByUrl(url);
    };

    const moveTabToDragTarget = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;

        const sourceIdx = tabPages.value.findIndex(tab => tab.id === sourceId);
        const targetIdx = tabPages.value.findIndex(tab => tab.id === targetId);
        if (sourceIdx === -1 || targetIdx === -1) return;

        const nextTabs = tabPages.value.slice();
        const [moved] = nextTabs.splice(sourceIdx, 1);
        nextTabs.splice(targetIdx, 0, moved);
        tabPages.value = nextTabs;
        persistTabOrder(tabPages.value);

        const fixedOrder = nextTabs
            .filter(tab => isFixedTabId(tab.id) && !tab.closable)
            .map(tab => tab.id as AppBottomBarTabId);
        void appConfigStore.updateConfig({
            bottomBar: {
                defaultVisibleTabIds: fixedOrder,
            },
        });
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
        moveTabToDragTarget,
        closeTab,
        getActiveTab,
    }
})
