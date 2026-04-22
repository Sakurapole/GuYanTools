export type DomainCheckResult = 'whitelist' | 'blacklist' | 'unknown';

/** 脚本权限类型 */
export type WebScriptPermission = 'network' | 'storage' | 'dom' | 'clipboard';

/** 脚本注入时机 */
export type WebScriptRunAt = 'document-start' | 'document-end' | 'document-idle';

export interface WebScriptRule {
  id: string;
  /** 脚本/规则名称 */
  name: string;
  /** 域名匹配模式 e.g. "*.bilibili.com", "github.com" */
  domainPattern: string;
  /** 注入类型 */
  type: 'js' | 'css' | 'html';
  /** 注入内容（内联代码） */
  content: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否为内置脚本 */
  builtin: boolean;
  /** 注入时机（默认 document-end） */
  runAt?: WebScriptRunAt;
  /** 脚本权限列表 */
  permissions?: WebScriptPermission[];
  /** 排除域名模式列表 */
  excludePatterns?: string[];
}

export interface WebSecurityConfig {
  whitelist: string[];
  blacklist: string[];
}

/** Chrome 扩展安装记录 */
export interface ChromeExtensionRecord {
  /** Electron 分配的扩展 ID */
  id: string;
  /** 扩展名称（来自 manifest.json） */
  name: string;
  /** 扩展版本 */
  version: string;
  /** 扩展描述 */
  description: string;
  /** 解压后的本地目录路径 */
  path: string;
  /** 是否启用 */
  enabled: boolean;
  /** 安装时间戳 */
  installedAt: number;
}

export interface AppWebConfig {
  security: WebSecurityConfig;
  scripts: WebScriptRule[];
  /** 保活域名列表：匹配的 webview 页面切换时保留状态不销毁 */
  keepAliveDomains: string[];
  /** 已安装的 Chrome 扩展 */
  chromeExtensions: ChromeExtensionRecord[];
}

export interface WebviewApi {
  checkDomain: (domain: string) => Promise<DomainCheckResult>;
  getInjectedScripts: (domain: string) => Promise<WebScriptRule[]>;
  openNewWindow: (url: string) => Promise<void>;
  clearSession: () => Promise<void>;
  /** Chrome 扩展管理 */
  installExtension: (sourcePath: string) => Promise<ChromeExtensionRecord>;
  removeExtension: (id: string) => Promise<void>;
  toggleExtension: (id: string, enabled: boolean) => Promise<void>;
  getExtensions: () => Promise<ChromeExtensionRecord[]>;
  /** 打开脚本编辑器（新窗口） */
  openScriptEditor: (scriptId?: string, domain?: string) => Promise<void>;
}

declare global {
  interface Window {
    webviewApi: WebviewApi;
  }
}
