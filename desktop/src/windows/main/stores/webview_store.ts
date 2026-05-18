import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAppConfigStore } from './app_config_store';

/**
 * 域名匹配：支持 *.example.com 通配和精确匹配（与 webview_manager.ts 逻辑一致）
 */
function matchDomain(pattern: string, domain: string): boolean {
  const p = pattern.toLowerCase().trim();
  const d = domain.toLowerCase().trim();

  if (p === d) return true;

  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return d === suffix || d.endsWith('.' + suffix);
  }

  return false;
}

export interface WebviewInstance {
  /** 唯一标识：使用原始 URL */
  url: string;
  /** 域名 */
  domain: string;
  /** 保活来源：配置域名或本次运行内的临时保活 */
  keepAliveMode: 'configured' | 'temporary';
  /** 是否处于激活（可见）状态 */
  active: boolean;
  /** 最近一次页面标题，用于后台列表恢复展示 */
  title?: string;
  /** 创建时间 */
  createdAt: number;
  /** 最近一次转入后台的时间 */
  hiddenAt?: number;
}

export const useWebviewStore = defineStore('webview', () => {
  const appConfigStore = useAppConfigStore();

  /** 所有已创建的保活 webview 实例 */
  const instances = ref<WebviewInstance[]>([]);

  /** 本次运行临时加入保活的 URL，不写入应用配置 */
  const temporaryKeepAliveUrls = ref<string[]>([]);

  /** 当前激活的保活 webview URL（null 表示无保活 webview 激活） */
  const activeUrl = ref<string | null>(null);

  /** 保活域名列表（从配置读取） */
  const keepAliveDomains = computed(() =>
    appConfigStore.config.web?.keepAliveDomains ?? [],
  );

  /** 判断域名是否在保活列表中 */
  function isKeepAliveDomain(domain: string): boolean {
    if (!domain) return false;
    return keepAliveDomains.value.some(pattern => matchDomain(pattern, domain));
  }

  function isTemporaryKeepAliveUrl(url: string): boolean {
    return temporaryKeepAliveUrls.value.includes(url);
  }

  /** 从 URL 提取域名 */
  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  function resolveKeepAliveMode(url: string): 'configured' | 'temporary' | null {
    if (isTemporaryKeepAliveUrl(url)) return 'temporary';
    const domain = extractDomain(url);
    return isKeepAliveDomain(domain) ? 'configured' : null;
  }

  function isManagedKeepAliveUrl(url: string): boolean {
    return Boolean(resolveKeepAliveMode(url)) || instances.value.some(inst => inst.url === url);
  }

  /**
   * 激活一个保活 webview。
   * 如果不存在则创建新实例，如果已存在则激活。
   * 返回 true 表示保活接管，返回 false 表示非保活域名。
   */
  function activate(url: string): boolean {
    const domain = extractDomain(url);
    const keepAliveMode = resolveKeepAliveMode(url);
    const existing = instances.value.find(inst => inst.url === url);

    if (!keepAliveMode && !existing) {
      // 非保活域名，取消所有激活
      deactivateAll();
      return false;
    }

    // 取消当前激活
    for (const inst of instances.value) {
      inst.active = false;
    }

    if (existing) {
      existing.active = true;
      existing.hiddenAt = undefined;
      existing.keepAliveMode = keepAliveMode ?? existing.keepAliveMode;
      activeUrl.value = url;
      return true;
    }

    // 创建新实例
    instances.value.push({
      url,
      domain,
      keepAliveMode: keepAliveMode ?? 'temporary',
      active: true,
      createdAt: Date.now(),
    });
    activeUrl.value = url;
    return true;
  }

  /** 取消所有保活 webview 的激活状态 */
  function deactivateAll() {
    for (const inst of instances.value) {
      if (inst.active) {
        inst.active = false;
        inst.hiddenAt = Date.now();
      }
    }
    activeUrl.value = null;
  }

  /** 隐藏一个保活实例，并保留在后台列表中以便后续恢复 */
  function hideInstance(url: string) {
    const inst = instances.value.find(item => item.url === url);
    if (!inst) return;

    inst.active = false;
    inst.hiddenAt = Date.now();
    if (activeUrl.value === url) {
      activeUrl.value = null;
    }
  }

  /** 移除一个保活实例（关闭 tab 时调用） */
  function removeInstance(url: string) {
    const idx = instances.value.findIndex(inst => inst.url === url);
    if (idx !== -1) {
      instances.value.splice(idx, 1);
    }
    temporaryKeepAliveUrls.value = temporaryKeepAliveUrls.value.filter(item => item !== url);
    if (activeUrl.value === url) {
      activeUrl.value = null;
    }
  }

  /** 将当前 URL 临时加入保活并立刻交给保活容器接管 */
  function keepAliveTemporary(url: string, title?: string): boolean {
    if (!url) return false;

    if (!temporaryKeepAliveUrls.value.includes(url)) {
      temporaryKeepAliveUrls.value.push(url);
    }

    const activated = activate(url);
    if (activated && title) {
      updateInstanceTitle(url, title);
    }
    return activated;
  }

  /** 更新实例标题，供后台列表恢复入口展示 */
  function updateInstanceTitle(url: string, title: string) {
    const inst = instances.value.find(item => item.url === url);
    if (!inst || !title) return;
    inst.title = title;
  }

  /** 是否有保活 webview 处于激活状态 */
  const hasActiveInstance = computed(() => activeUrl.value !== null);

  /** 已隐藏但仍保留加载状态的网页列表，后续恢复入口可直接使用 */
  const backgroundInstances = computed(() =>
    instances.value.filter(inst => !inst.active),
  );

  return {
    instances,
    backgroundInstances,
    temporaryKeepAliveUrls,
    activeUrl,
    keepAliveDomains,
    hasActiveInstance,
    isKeepAliveDomain,
    isTemporaryKeepAliveUrl,
    isManagedKeepAliveUrl,
    extractDomain,
    activate,
    deactivateAll,
    hideInstance,
    removeInstance,
    keepAliveTemporary,
    updateInstanceTitle,
  };
});
