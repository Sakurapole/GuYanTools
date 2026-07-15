import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
    APP_INTERNAL_FUNCTIONS,
    type AppBottomBarConfig,
    type AppBottomBarCollection,
    type AppBottomBarPinnedWebviewTab,
    type AppBottomBarTabId,
} from '@/contracts/app_config';
import { useAppConfigStore } from './app_config_store';

export type AppTabKind = 'internal' | 'pinned-webview' | 'runtime';

export interface AppTabDefinition {
    id: string;
    name: string;
    url: string;
    icon?: string;
    faviconUrl?: string;
    active: boolean;
    closable: boolean;
    iconOnly: boolean;
    collectionId: string;
    kind: AppTabKind;
    pinnedWebviewId?: string;
}

export interface AppTabCollectionView {
    id: string;
    name: string;
    icon: string;
    tabs: AppTabDefinition[];
    active: boolean;
}

const TAB_ORDER_STORAGE_KEY = 'guyantools.bottombar.tab-order';
const PINNED_WEBVIEW_TAB_PREFIX = 'pinned-webview:';

const INTERNAL_TABS: AppTabDefinition[] = APP_INTERNAL_FUNCTIONS
    .filter(item => !item.devOnly || import.meta.env.DEV)
    .map(item => ({
        id: item.id,
        name: item.label,
        url: item.route,
        icon: item.icon,
        faviconUrl: '',
        active: item.id === 'home',
        closable: false,
        iconOnly: false,
        collectionId: '',
        kind: 'internal',
    }));

function cloneTab(tab: AppTabDefinition) {
    return { ...tab };
}

function clonePinnedWebview(tab: AppBottomBarPinnedWebviewTab): AppBottomBarPinnedWebviewTab {
    return { ...tab };
}

function cloneCollection(collection: AppBottomBarCollection): AppBottomBarCollection {
    return { ...collection };
}

function isFixedTabId(id: string): id is AppBottomBarTabId {
    return INTERNAL_TABS.some(tab => tab.id === id);
}

function pinnedWebviewTabId(id: string) {
    return `${PINNED_WEBVIEW_TAB_PREFIX}${id}`;
}

function routeForWebviewUrl(url: string) {
    return `/webview?url=${encodeURIComponent(url)}`;
}

function resolveWebviewUrlFromRoute(routePath: string): string {
    const [path, query = ''] = routePath.split('?');
    if (path !== '/webview') return '';

    const rawUrl = new URLSearchParams(query).get('url');
    if (!rawUrl) return '';

    try {
        return decodeURIComponent(rawUrl);
    } catch {
        return rawUrl;
    }
}

function iconForWebview(faviconUrl: string | undefined) {
    return faviconUrl ? `image:${faviconUrl}` : 'iconify:lucide:globe-2';
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

export const useBarStore = defineStore('bar', () => {
    const appConfigStore = useAppConfigStore();
    const sidebarVisible = ref(false);
    const runtimeTabCollections = ref<Record<string, string>>({});

    const toggleSidebar = () => {
        sidebarVisible.value = !sidebarVisible.value;
    }
    const setSidebarVisible = (visible: boolean) => {
        sidebarVisible.value = visible;
    }

    const resolveVisibleFixedTabs = (visibleTabIds: string[]) => {
        const visibleSet = new Set(visibleTabIds);

        return visibleTabIds
            .map(tabId => INTERNAL_TABS.find(tab => tab.id === tabId))
            .filter((tab): tab is AppTabDefinition => Boolean(tab) && visibleSet.has(tab.id))
            .map(tab => {
                const display = appConfigStore.config.bottomBar.tabDisplay[tab.id as AppBottomBarTabId];
                return {
                    ...tab,
                    iconOnly: display?.iconOnly === true,
                    collectionId: display?.collectionId ?? '',
                };
            });
    };

    const resolvePinnedWebviewTabs = () => appConfigStore.config.bottomBar.pinnedWebviews.map(item => ({
        id: pinnedWebviewTabId(item.id),
        name: item.title,
        url: routeForWebviewUrl(item.url),
        icon: iconForWebview(item.faviconUrl),
        faviconUrl: item.faviconUrl,
        active: false,
        closable: false,
        iconOnly: item.iconOnly,
        collectionId: item.collectionId,
        kind: 'pinned-webview' as const,
        pinnedWebviewId: item.id,
    }));

    const getConfiguredTabs = () => resolveVisibleFixedTabs(appConfigStore.config.bottomBar.defaultVisibleTabIds)
        .concat(resolvePinnedWebviewTabs());

    const tabPages = ref<AppTabDefinition[]>(orderTabs(getConfiguredTabs()));

    const applyLocalBottomBarPatch = (patch: Partial<AppBottomBarConfig>) => {
        appConfigStore.config.bottomBar = {
            ...appConfigStore.config.bottomBar,
            ...patch,
        };
    };

    const persistBottomBarPatch = async (patch: Partial<AppBottomBarConfig>) => {
        applyLocalBottomBarPatch(patch);
        await appConfigStore.persistConfigPatch({
            bottomBar: patch,
        });
    };

    const ensureFixedTabs = () => {
        const existingMap = new Map(tabPages.value.map(tab => [tab.id, tab]));
        const existingUrlMap = new Map(tabPages.value.map(tab => [tab.url, tab]));
        const configuredTabs = getConfiguredTabs().map(tab => ({
            ...tab,
            active: existingMap.get(tab.id)?.active ?? existingUrlMap.get(tab.url)?.active ?? tab.active,
        }));
        const configuredUrls = new Set(configuredTabs.map(tab => tab.url));
        const runtimeTabs = tabPages.value
            .filter(tab => tab.kind === 'runtime')
            .filter(tab => !configuredUrls.has(tab.url))
            .map(tab => ({
                ...tab,
                collectionId: runtimeTabCollections.value[tab.id] ?? tab.collectionId,
            }));
        tabPages.value = orderTabs(configuredTabs.concat(runtimeTabs));
    };

    watch(
        () => appConfigStore.config.bottomBar,
        ensureFixedTabs,
        { deep: true },
    );

    const collections = computed<AppTabCollectionView[]>(() => appConfigStore.config.bottomBar.collections
        .map(collection => {
            const tabs = tabPages.value.filter(tab => tab.collectionId === collection.id);
            return {
                id: collection.id,
                name: collection.name,
                icon: collection.icon || 'iconify:lucide:folder',
                tabs,
                active: tabs.some(tab => tab.active),
            };
        })
        .filter(collection => collection.tabs.length > 0));

    const ungroupedTabPages = computed(() => tabPages.value.filter(tab => !tab.collectionId));

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
        if (urlPath === '/webview') {
            tabPages.value = tabPages.value.map(tab => ({
                ...tab,
                active: false,
            }));
            return;
        }

        const pathMatch = tabPages.value.some(tab => tab.url.split('?')[0] === urlPath);

        if (pathMatch) {
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
        delete runtimeTabCollections.value[id];
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

        const webviewUrl = resolveWebviewUrlFromRoute(url);
        const faviconUrl = icon?.startsWith('image:') ? icon.slice(6) : '';
        const newTab: AppTabDefinition = {
            id: `tab-${Date.now()}`,
            name,
            url,
            icon: icon || (webviewUrl ? iconForWebview(faviconUrl) : undefined),
            faviconUrl,
            active: false,
            closable: true,
            iconOnly: false,
            collectionId: '',
            kind: 'runtime',
        };
        tabPages.value.push(newTab);
        persistTabOrder(tabPages.value);
        activateTabByUrl(url);
    };

    const persistFixedOrder = (tabs = tabPages.value) => {
        const fixedOrder = tabs
            .filter(tab => isFixedTabId(tab.id) && !tab.closable)
            .map(tab => tab.id as AppBottomBarTabId);
        void persistBottomBarPatch({
            defaultVisibleTabIds: fixedOrder,
        });
    };

    async function updateVisibleFixedTabs(tabIds: AppBottomBarTabId[]) {
        await persistBottomBarPatch({
            defaultVisibleTabIds: [...tabIds],
        });
    }

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
        persistFixedOrder(nextTabs);
    };

    function createCollectionDraft(name: string): AppBottomBarCollection {
        return {
            id: `collection-${Date.now().toString(36)}`,
            name: name || '集合',
            icon: 'iconify:lucide:folder',
        };
    }

    function buildTabCollectionConfigPatch(tab: AppTabDefinition, collectionId: string) {
        const bottomBar = appConfigStore.config.bottomBar;
        const tabDisplay = { ...bottomBar.tabDisplay };
        const pinnedWebviews = bottomBar.pinnedWebviews.map(clonePinnedWebview);

        if (tab.kind === 'internal' && isFixedTabId(tab.id)) {
            tabDisplay[tab.id] = {
                iconOnly: tabDisplay[tab.id]?.iconOnly === true,
                collectionId,
            };
        } else if (tab.kind === 'pinned-webview' && tab.pinnedWebviewId) {
            const target = pinnedWebviews.find(item => item.id === tab.pinnedWebviewId);
            if (target) {
                target.collectionId = collectionId;
            }
        }

        return { tabDisplay, pinnedWebviews };
    }

    async function createCollectionFromTabs(sourceId: string, targetId: string) {
        if (sourceId === targetId) return;

        const source = tabPages.value.find(tab => tab.id === sourceId);
        const target = tabPages.value.find(tab => tab.id === targetId);
        if (!source || !target) return;

        const bottomBar = appConfigStore.config.bottomBar;
        const existingCollection = target.collectionId
            ? bottomBar.collections.find(collection => collection.id === target.collectionId)
            : null;
        const nextCollection = existingCollection ?? createCollectionDraft(target.name);
        const collections = existingCollection
            ? bottomBar.collections.map(cloneCollection)
            : bottomBar.collections.map(cloneCollection).concat(nextCollection);

        const tabDisplay = { ...bottomBar.tabDisplay };
        const pinnedWebviews = bottomBar.pinnedWebviews.map(clonePinnedWebview);
        const runtimeCollections = { ...runtimeTabCollections.value };
        const assignCollection = (tab: AppTabDefinition) => {
            if (tab.kind === 'internal' && isFixedTabId(tab.id)) {
                tabDisplay[tab.id] = {
                    iconOnly: tabDisplay[tab.id]?.iconOnly === true,
                    collectionId: nextCollection.id,
                };
            } else if (tab.kind === 'pinned-webview' && tab.pinnedWebviewId) {
                const pinned = pinnedWebviews.find(item => item.id === tab.pinnedWebviewId);
                if (pinned) {
                    pinned.collectionId = nextCollection.id;
                }
            } else {
                runtimeCollections[tab.id] = nextCollection.id;
            }
        };
        assignCollection(target);
        assignCollection(source);
        runtimeTabCollections.value = runtimeCollections;

        tabPages.value = tabPages.value.map(tab => {
            if (tab.id === target.id || tab.id === source.id) {
                return { ...tab, collectionId: nextCollection.id };
            }
            return tab;
        });

        await persistBottomBarPatch({
            collections,
            tabDisplay,
            pinnedWebviews,
        });
    }

    async function removeTabFromCollection(tabId: string) {
        const tab = tabPages.value.find(item => item.id === tabId);
        if (!tab) return;

        const nextConfig = buildTabCollectionConfigPatch(tab, '');
        if (tab.kind === 'runtime') {
            const nextRuntimeCollections = { ...runtimeTabCollections.value };
            delete nextRuntimeCollections[tab.id];
            runtimeTabCollections.value = nextRuntimeCollections;
        }

        tabPages.value = tabPages.value.map(item => item.id === tab.id ? { ...item, collectionId: '' } : item);
        await persistBottomBarPatch({
            tabDisplay: nextConfig.tabDisplay,
            pinnedWebviews: nextConfig.pinnedWebviews,
        });
    }

    async function updateCollectionName(collectionId: string, name: string) {
        const trimmed = name.trim();
        if (!trimmed) return;

        const current = appConfigStore.config.bottomBar.collections.find(collection => collection.id === collectionId);
        if (!current || current.name === trimmed) return;

        await persistBottomBarPatch({
            collections: appConfigStore.config.bottomBar.collections.map(collection => (
                collection.id === collectionId ? { ...collection, name: trimmed } : { ...collection }
            )),
        });
    }

    async function deleteCollection(collectionId: string) {
        const tabDisplay = { ...appConfigStore.config.bottomBar.tabDisplay };
        for (const [tabId, display] of Object.entries(tabDisplay)) {
            if (display?.collectionId === collectionId) {
                tabDisplay[tabId as AppBottomBarTabId] = {
                    ...display,
                    collectionId: '',
                };
            }
        }

        const pinnedWebviews = appConfigStore.config.bottomBar.pinnedWebviews.map(item => (
            item.collectionId === collectionId ? { ...item, collectionId: '' } : { ...item }
        ));
        const nextRuntimeCollections = { ...runtimeTabCollections.value };
        for (const [tabId, currentCollectionId] of Object.entries(nextRuntimeCollections)) {
            if (currentCollectionId === collectionId) {
                delete nextRuntimeCollections[tabId];
            }
        }
        runtimeTabCollections.value = nextRuntimeCollections;

        await persistBottomBarPatch({
            collections: appConfigStore.config.bottomBar.collections
                .filter(collection => collection.id !== collectionId)
                .map(cloneCollection),
            tabDisplay,
            pinnedWebviews,
        });
    }

    async function updateTabCollection(tabId: string, collectionId: string) {
        const tab = tabPages.value.find(item => item.id === tabId);
        if (!tab || tab.collectionId === collectionId) return;

        const nextConfig = buildTabCollectionConfigPatch(tab, collectionId);
        if (tab.kind === 'runtime') {
            const nextRuntimeCollections = { ...runtimeTabCollections.value };
            if (collectionId) {
                nextRuntimeCollections[tab.id] = collectionId;
            } else {
                delete nextRuntimeCollections[tab.id];
            }
            runtimeTabCollections.value = nextRuntimeCollections;
        }

        tabPages.value = tabPages.value.map(item => item.id === tab.id ? { ...item, collectionId } : item);
        await persistBottomBarPatch({
            tabDisplay: nextConfig.tabDisplay,
            pinnedWebviews: nextConfig.pinnedWebviews,
        });
    }

    async function updateTabIconOnly(tabId: string, iconOnly: boolean) {
        const tab = tabPages.value.find(item => item.id === tabId);
        if (!tab || tab.iconOnly === iconOnly) return;

        tabPages.value = tabPages.value.map(item => (
            item.id === tab.id ? { ...item, iconOnly } : item
        ));

        if (tab.kind === 'internal' && isFixedTabId(tab.id)) {
            await persistBottomBarPatch({
                tabDisplay: {
                    ...appConfigStore.config.bottomBar.tabDisplay,
                    [tab.id]: {
                        iconOnly,
                        collectionId: appConfigStore.config.bottomBar.tabDisplay[tab.id]?.collectionId ?? '',
                    },
                },
            });
            return;
        }

        if (tab.kind === 'pinned-webview' && tab.pinnedWebviewId) {
            await persistBottomBarPatch({
                pinnedWebviews: appConfigStore.config.bottomBar.pinnedWebviews.map(item => (
                    item.id === tab.pinnedWebviewId ? { ...item, iconOnly } : { ...item }
                )),
            });
            return;
        }
    }

    async function updatePinnedWebviewTab(pinnedWebviewId: string, patch: Partial<AppBottomBarPinnedWebviewTab>) {
        const current = appConfigStore.config.bottomBar.pinnedWebviews.find(item => item.id === pinnedWebviewId);
        if (!current) return;

        const nextPinned = {
            ...current,
            ...patch,
        };
        const hasChanged = Object.entries(patch).some(([key, value]) => (
            current[key as keyof AppBottomBarPinnedWebviewTab] !== value
        ));
        if (!hasChanged) return;

        await persistBottomBarPatch({
            pinnedWebviews: appConfigStore.config.bottomBar.pinnedWebviews.map(item => (
                item.id === pinnedWebviewId ? { ...nextPinned } : { ...item }
            )),
        });
        tabPages.value = tabPages.value.map(item => (
            item.pinnedWebviewId === pinnedWebviewId
                ? {
                    ...item,
                    name: nextPinned.title,
                    icon: iconForWebview(nextPinned.faviconUrl),
                    faviconUrl: nextPinned.faviconUrl,
                    iconOnly: nextPinned.iconOnly,
                    collectionId: nextPinned.collectionId,
                }
                : item
        ));
    }

    async function pinWebviewTab(url: string, title: string, faviconUrl?: string) {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return;

        const bottomBar = appConfigStore.config.bottomBar;
        const existing = bottomBar.pinnedWebviews.find(item => item.url === trimmedUrl);
        const nextPinnedWebviews = existing
            ? bottomBar.pinnedWebviews.map(item => (
                item.id === existing.id
                    ? {
                        ...item,
                        title: title.trim() || item.title || trimmedUrl,
                        faviconUrl: faviconUrl ?? item.faviconUrl,
                    }
                    : { ...item }
            ))
            : bottomBar.pinnedWebviews.map(clonePinnedWebview).concat({
                id: `webview-${Date.now().toString(36)}`,
                title: title.trim() || trimmedUrl,
                url: trimmedUrl,
                faviconUrl: faviconUrl ?? '',
                iconOnly: true,
                collectionId: '',
            });

        await persistBottomBarPatch({
            pinnedWebviews: nextPinnedWebviews,
        });
    }

    async function unpinWebviewTab(pinnedWebviewId: string) {
        tabPages.value = tabPages.value.filter(tab => tab.pinnedWebviewId !== pinnedWebviewId);
        await persistBottomBarPatch({
            pinnedWebviews: appConfigStore.config.bottomBar.pinnedWebviews
                .filter(item => item.id !== pinnedWebviewId)
                .map(clonePinnedWebview),
        });
    }

    function isWebviewPinned(url: string) {
        return appConfigStore.config.bottomBar.pinnedWebviews.some(item => item.url === url);
    }

    /** 更新匹配 URL 的 Tab 名称（用于 webview 页面标题动态更新） */
    const updateTabName = (tabUrl: string, newName: string) => {
        const tab = tabPages.value.find(t => t.url === tabUrl)
            ?? tabPages.value.find(t => t.url.startsWith(tabUrl));
        if (tab && newName) {
            tab.name = newName;
        }
    };

    const updateTabIcon = (tabUrl: string, faviconUrl: string) => {
        if (!faviconUrl) return;

        const icon = iconForWebview(faviconUrl);
        const tab = tabPages.value.find(t => t.url === tabUrl)
            ?? tabPages.value.find(t => t.url.startsWith(tabUrl));
        if (tab) {
            tab.icon = icon;
            tab.faviconUrl = faviconUrl;
        }

        const webviewUrl = resolveWebviewUrlFromRoute(tabUrl);
        const pinned = webviewUrl
            ? appConfigStore.config.bottomBar.pinnedWebviews.find(item => item.url === webviewUrl)
            : null;
        if (pinned && pinned.faviconUrl !== faviconUrl) {
            void persistBottomBarPatch({
                pinnedWebviews: appConfigStore.config.bottomBar.pinnedWebviews.map(item => (
                    item.id === pinned.id ? { ...item, faviconUrl } : { ...item }
                )),
            });
        }
    };

    return {
        sidebarVisible,
        toggleSidebar,
        setSidebarVisible,
        tabPages,
        ungroupedTabPages,
        collections,
        ensureFixedTabs,
        activateTabByUrl,
        openTab,
        updateTabName,
        updateTabIcon,
        updateVisibleFixedTabs,
        updateTabIconOnly,
        updateTabCollection,
        updatePinnedWebviewTab,
        moveTabToDragTarget,
        createCollectionFromTabs,
        removeTabFromCollection,
        updateCollectionName,
        deleteCollection,
        pinWebviewTab,
        unpinWebviewTab,
        isWebviewPinned,
        closeTab,
        getActiveTab,
    }
})
