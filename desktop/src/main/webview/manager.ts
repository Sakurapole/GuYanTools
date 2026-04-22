import { BrowserWindow, session } from 'electron';
import { appConfigManager } from '../app-config/manager';
import path from 'path';
import fs from 'fs-extra';
import { CHROME_EXTENSIONS_DIR } from '../constants/paths';
import type { ChromeExtensionRecord, DomainCheckResult, WebScriptRule } from '@/contracts/webview';

/**
 * 域名匹配：支持 *.example.com 通配和精确匹配
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

/**
 * 从 URL 中提取域名
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export class WebViewManager {
  private sharedSession: Electron.Session | null = null;

  /**
   * 初始化共享 webview session（persist:webview）
   *
   * 核心机制：所有 webview 共享同一个持久化 session 分区，
   * 登录态（cookie / localStorage）自动互通。
   *
   * - 清洗 User-Agent，去除 Electron / 应用名标识
   * - 通过 onBeforeSendHeaders 改写请求头
   * - Google 域名使用原始 UA 以提高兼容性
   * - 加载所有已启用的 Chrome 扩展
   */
  async initSharedSession() {
    const ses = session.fromPartition('persist:webview');
    this.sharedSession = ses;

    // ─── UA 清洗 ───
    const originUA = ses.getUserAgent();
    const cleanUA = originUA
      .replace(/\s*Electron\/\S+/, '')
      .replace(/\s*GuYanTools\/\S+/i, '');
    ses.setUserAgent(cleanUA);

    // ─── 请求头改写 ───
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      const isGoogle = details.url.includes('google.com');

      // Google 域名使用原始 UA（含 Electron 标识反而更可信于某些场景）
      // 其他域名使用清洗后的 UA
      headers['User-Agent'] = isGoogle ? originUA : cleanUA;

      // 补充 Accept-Language
      if (!headers['Accept-Language']) {
        headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
      }

      // 去除可能暴露 Electron 容器的 Client Hints 头
      delete headers['sec-ch-ua'];
      delete headers['sec-ch-ua-platform'];
      delete headers['sec-ch-ua-mobile'];

      callback({ requestHeaders: headers });
    });

    // ─── 加载已安装的 Chrome 扩展 ───
    await this.loadAllExtensions();

    console.log('[WebView] Shared session initialized (partition: persist:webview)');
  }

  /**
   * 清理共享 session 的缓存、cookie 和存储数据
   */
  async clearSessionData() {
    const ses = this.sharedSession ?? session.fromPartition('persist:webview');

    await ses.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'shadercache',
        'serviceworkers',
        'cachestorage',
      ],
    });
    await ses.clearCache();

    console.log('[WebView] Shared session data cleared');
  }

  /**
   * 为共享 session 设置代理
   */
  async setSessionProxy(config: Electron.ProxyConfig) {
    const ses = this.sharedSession ?? session.fromPartition('persist:webview');
    await ses.setProxy(config);
    console.log('[WebView] Shared session proxy updated');
  }

  /**
   * 检查域名安全策略
   */
  checkDomain(domain: string): DomainCheckResult {
    const config = appConfigManager.getCachedConfig();
    const { whitelist, blacklist } = config.web.security;

    for (const pattern of blacklist) {
      if (matchDomain(pattern, domain)) return 'blacklist';
    }

    for (const pattern of whitelist) {
      if (matchDomain(pattern, domain)) return 'whitelist';
    }

    return 'unknown';
  }

  /**
   * 获取匹配指定域名且已启用的注入脚本
   */
  getMatchedScripts(domain: string): WebScriptRule[] {
    const config = appConfigManager.getCachedConfig();
    return config.web.scripts.filter(
      (rule) => rule.enabled && matchDomain(rule.domainPattern, domain),
    );
  }

  // ─── Chrome 扩展管理 ───

  /**
   * 启动时加载所有已启用的 Chrome 扩展
   */
  async loadAllExtensions() {
    const ses = this.sharedSession ?? session.fromPartition('persist:webview');
    const config = appConfigManager.getCachedConfig();
    const extensions = config.web.chromeExtensions || [];

    for (const ext of extensions) {
      if (!ext.enabled) continue;

      try {
        if (await fs.pathExists(ext.path)) {
          await ses.extensions.loadExtension(ext.path);
          console.log(`[WebView:Extension] Loaded: ${ext.name} (${ext.id})`);
        } else {
          console.warn(`[WebView:Extension] Path not found, skipping: ${ext.path}`);
        }
      } catch (err) {
        console.error(`[WebView:Extension] Failed to load ${ext.name}:`, err);
      }
    }
  }

  /**
   * 安装 Chrome 扩展（从本地解压目录）
   */
  async installExtension(sourcePath: string): Promise<ChromeExtensionRecord> {
    const ses = this.sharedSession ?? session.fromPartition('persist:webview');

    // 确保扩展目录存在
    await fs.ensureDir(CHROME_EXTENSIONS_DIR);

    // 读取 manifest.json 获取扩展信息
    const manifestPath = path.join(sourcePath, 'manifest.json');
    if (!await fs.pathExists(manifestPath)) {
      throw new Error('所选目录缺少 manifest.json，不是有效的 Chrome 扩展');
    }

    const manifest = await fs.readJSON(manifestPath);
    const extName = manifest.name || 'Unknown Extension';
    const extVersion = manifest.version || '0.0.0';
    const extDescription = manifest.description || '';

    // 复制到应用扩展目录
    const extId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const destPath = path.join(CHROME_EXTENSIONS_DIR, extId);
    await fs.copy(sourcePath, destPath);

    // 加载扩展
    const loaded = await ses.extensions.loadExtension(destPath);

    const record: ChromeExtensionRecord = {
      id: loaded.id,
      name: extName,
      version: extVersion,
      description: extDescription,
      path: destPath,
      enabled: true,
      installedAt: Date.now(),
    };

    // 更新配置
    const config = appConfigManager.getCachedConfig();
    const extensions = [...(config.web.chromeExtensions || []), record];
    await appConfigManager.updateConfig({ web: { chromeExtensions: extensions } });

    console.log(`[WebView:Extension] Installed: ${extName} (${loaded.id})`);
    return record;
  }

  /**
   * 卸载 Chrome 扩展
   */
  async removeExtension(id: string) {
    const ses = this.sharedSession ?? session.fromPartition('persist:webview');
    const config = appConfigManager.getCachedConfig();
    const ext = (config.web.chromeExtensions || []).find(e => e.id === id);

    if (!ext) throw new Error(`扩展不存在: ${id}`);

    // 从 session 中卸载
    try {
      ses.removeExtension(id);
    } catch (err) {
      console.warn(`[WebView:Extension] Warning during unload:`, err);
    }

    // 删除本地文件
    try {
      if (await fs.pathExists(ext.path)) {
        await fs.remove(ext.path);
      }
    } catch (err) {
      console.warn(`[WebView:Extension] Warning during file cleanup:`, err);
    }

    // 更新配置
    const extensions = (config.web.chromeExtensions || []).filter(e => e.id !== id);
    await appConfigManager.updateConfig({ web: { chromeExtensions: extensions } });

    console.log(`[WebView:Extension] Removed: ${ext.name} (${id})`);
  }

  /**
   * 启用/禁用 Chrome 扩展
   */
  async toggleExtension(id: string, enabled: boolean) {
    const ses = this.sharedSession ?? session.fromPartition('persist:webview');
    const config = appConfigManager.getCachedConfig();
    const extensions = (config.web.chromeExtensions || []).map(e =>
      e.id === id ? { ...e, enabled } : { ...e },
    );
    const ext = extensions.find(e => e.id === id);

    if (!ext) throw new Error(`扩展不存在: ${id}`);

    if (enabled) {
      // 加载扩展
      try {
        if (await fs.pathExists(ext.path)) {
          await ses.extensions.loadExtension(ext.path);
        }
      } catch (err) {
        console.error(`[WebView:Extension] Failed to load ${ext.name}:`, err);
      }
    } else {
      // 卸载扩展
      try {
        ses.removeExtension(id);
      } catch (err) {
        console.warn(`[WebView:Extension] Warning during unload:`, err);
      }
    }

    await appConfigManager.updateConfig({ web: { chromeExtensions: extensions } });
    console.log(`[WebView:Extension] ${enabled ? 'Enabled' : 'Disabled'}: ${ext.name}`);
  }

  /**
   * 获取所有已安装的扩展列表
   */
  async getExtensions(): Promise<ChromeExtensionRecord[]> {
    const config = await appConfigManager.getConfig();
    return config.web.chromeExtensions || [];
  }

  /**
   * 在新的独立 Electron 窗口中打开网页（弹窗模式）
   */
  openInNewWindow(url: string) {
    const domain = extractDomain(url);

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      title: domain || url,
      autoHideMenuBar: true,
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
      },
    });

    const encodedUrl = encodeURIComponent(url);
    const hashRoute = `#/webview?url=${encodedUrl}&popup=1`;

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/index.html${hashRoute}`);
    } else {
      void win.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { hash: `/webview?url=${encodedUrl}&popup=1` },
      );
    }

    win.webContents.on('page-title-updated', (_event, title) => {
      if (!win.isDestroyed()) {
        win.setTitle(title);
      }
    });
  }
}

export const webViewManager = new WebViewManager();
