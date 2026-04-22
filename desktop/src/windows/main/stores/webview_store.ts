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
  /** 是否处于激活（可见）状态 */
  active: boolean;
}

export const useWebviewStore = defineStore('webview', () => {
  const appConfigStore = useAppConfigStore();

  /** 所有已创建的保活 webview 实例 */
  const instances = ref<WebviewInstance[]>([]);

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

  /** 从 URL 提取域名 */
  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * 激活一个保活 webview。
   * 如果不存在则创建新实例，如果已存在则激活。
   * 返回 true 表示保活接管，返回 false 表示非保活域名。
   */
  function activate(url: string): boolean {
    const domain = extractDomain(url);
    if (!isKeepAliveDomain(domain)) {
      // 非保活域名，取消所有激活
      deactivateAll();
      return false;
    }

    // 取消当前激活
    for (const inst of instances.value) {
      inst.active = false;
    }

    // 查找已有实例
    const existing = instances.value.find(inst => inst.url === url);
    if (existing) {
      existing.active = true;
      activeUrl.value = url;
      return true;
    }

    // 创建新实例
    instances.value.push({
      url,
      domain,
      active: true,
    });
    activeUrl.value = url;
    return true;
  }

  /** 取消所有保活 webview 的激活状态 */
  function deactivateAll() {
    for (const inst of instances.value) {
      inst.active = false;
    }
    activeUrl.value = null;
  }

  /** 移除一个保活实例（关闭 tab 时调用） */
  function removeInstance(url: string) {
    const idx = instances.value.findIndex(inst => inst.url === url);
    if (idx !== -1) {
      instances.value.splice(idx, 1);
    }
    if (activeUrl.value === url) {
      activeUrl.value = null;
    }
  }

  /** 是否有保活 webview 处于激活状态 */
  const hasActiveInstance = computed(() => activeUrl.value !== null);

  return {
    instances,
    activeUrl,
    keepAliveDomains,
    hasActiveInstance,
    isKeepAliveDomain,
    extractDomain,
    activate,
    deactivateAll,
    removeInstance,
  };
});
