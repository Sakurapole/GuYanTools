<script lang="ts" setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { DomainCheckResult, WebScriptRule } from '@/contracts/webview';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiDrawer from '../ui/UiDrawer.vue';
import { useBarStore } from '../../stores/bar_store';
import { useGlobalStore } from '../../stores/global_store';
import { useWebviewStore } from '../../stores/webview_store';
import { router } from '../../routes/router';
import { notifyError, notifySuccess } from '../../composables/useInAppNotification';

const route = useRoute();
const barStore = useBarStore();
const globalStore = useGlobalStore();
const webviewStore = useWebviewStore();

// ─── 标准 Chrome User-Agent ───
const chromeUserAgent = navigator.userAgent
  .replace(/\s*Electron\/\S+/, '')
  .replace(/\s*GuYanTools\/\S+/i, '');

// ─── Google 登录检测 ───
function isGoogleAuthUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'accounts.google.com' || u.hostname === 'accounts.youtube.com';
  } catch {
    return false;
  }
}

// ─── GM API Polyfill 生成（前端侧） ───
function generateGMPolyfillCode(permissions: string[]): string {
  const parts: string[] = ['(function(){"use strict";'];

  if (permissions.includes('network')) {
    parts.push(`
window.GM_xmlhttpRequest=function(d){
  fetch(d.url,{method:d.method||'GET',headers:d.headers,body:d.data})
    .then(async r=>{const t=await r.text();d.onload?.({status:r.status,statusText:r.statusText,responseText:t,response:t,responseHeaders:''})})
    .catch(e=>d.onerror?.({error:String(e)}));
};`);
  }

  if (permissions.includes('storage')) {
    parts.push(`
window.GM_setValue=function(k,v){try{localStorage.setItem('__gm_'+k,JSON.stringify(v))}catch{}};
window.GM_getValue=function(k,d){try{var v=localStorage.getItem('__gm_'+k);return v!==null?JSON.parse(v):d}catch{return d}};
window.GM_deleteValue=function(k){try{localStorage.removeItem('__gm_'+k)}catch{}};`);
  }

  if (permissions.includes('clipboard')) {
    parts.push(`
window.GM_setClipboard=function(t){navigator.clipboard.writeText(t).catch(()=>{})};`);
  }

  parts.push('})();');
  return parts.join('');
}

// ─── 每个保活实例的 refs ───
const webviewRefs = ref<Record<string, HTMLElement | null>>({});
const navStates = ref<Record<string, {
  canGoBack: boolean;
  canGoForward: boolean;
  url: string;
  title: string;
  isLoading: boolean;
}>>({});
const faviconUrls = ref<Record<string, string>>({});
const domainStatuses = ref<Record<string, DomainCheckResult>>({});
const injectedScriptsMap = ref<Record<string, WebScriptRule[]>>({});
const showScriptsDrawerFor = ref<string | null>(null);
const showGoogleLoginHintFor = ref<string | null>(null);
const initializedUrls = ref<Set<string>>(new Set());

// ─── 状态标签映射 ───
const statusLabelMap: Record<DomainCheckResult, string> = {
  whitelist: '已信任',
  blacklist: '已禁止',
  unknown: '未知域名',
};

const statusClassMap: Record<DomainCheckResult, string> = {
  whitelist: 'webview-nav__status--safe',
  blacklist: 'webview-nav__status--danger',
  unknown: 'webview-nav__status--warn',
};

function scriptTypeLabel(type: string) {
  switch (type) {
    case 'js': return 'JavaScript';
    case 'css': return 'CSS';
    case 'html': return 'HTML';
    default: return type;
  }
}

// ─── 轮询 ───
const pollTimers = ref<Record<string, ReturnType<typeof setInterval>>>({});
let lastSyncedTitles: Record<string, string> = {};

function syncPageTitle(wvEl: any, instanceUrl: string) {
  const title = wvEl.getTitle?.() || '';
  if (!title || title === lastSyncedTitles[instanceUrl]) return;

  lastSyncedTitles[instanceUrl] = title;
  webviewStore.updateInstanceTitle(instanceUrl, title);

  // 构造路由路径
  const encodedUrl = encodeURIComponent(instanceUrl);
  const routePath = `/webview?url=${encodedUrl}`;

  barStore.updateTabName(routePath, title);

  // 只有当前激活时才更新全局标题
  if (webviewStore.activeUrl === instanceUrl) {
    route.meta.title = title;
    document.title = `${title} - GuYanTools`;
    globalStore.setCurrentPage(title);
  }

  if (!navStates.value[instanceUrl]) {
    navStates.value[instanceUrl] = { canGoBack: false, canGoForward: false, url: '', title: '', isLoading: false };
  }
  navStates.value[instanceUrl].title = title;
}

function syncPageFavicon(instanceUrl: string, favicons: string[] | undefined) {
  const faviconUrl = favicons?.find(item => typeof item === 'string' && item.length > 0);
  if (!faviconUrl) return;

  faviconUrls.value[instanceUrl] = faviconUrl;
  barStore.updateTabIcon(`/webview?url=${encodeURIComponent(instanceUrl)}`, faviconUrl);
}

async function pinWebviewInstance(instanceUrl: string) {
  const title = navStates.value[instanceUrl]?.title || instanceUrl;
  await barStore.pinWebviewTab(instanceUrl, title, faviconUrls.value[instanceUrl] ?? '');
  notifySuccess('已固定到应用底栏');
}

function startPolling(instanceUrl: string) {
  stopPolling(instanceUrl);
  pollTimers.value[instanceUrl] = setInterval(() => {
    const wv = webviewRefs.value[instanceUrl] as any;
    if (!wv) return;
    try {
      navStates.value[instanceUrl] = {
        canGoBack: wv.canGoBack?.() ?? false,
        canGoForward: wv.canGoForward?.() ?? false,
        url: wv.getURL?.() ?? '',
        title: wv.getTitle?.() ?? '',
        isLoading: wv.isLoading?.() ?? false,
      };
      syncPageTitle(wv, instanceUrl);
    } catch { /* ignore */ }
  }, 800);
}

function stopPolling(instanceUrl: string) {
  if (pollTimers.value[instanceUrl]) {
    clearInterval(pollTimers.value[instanceUrl]);
    delete pollTimers.value[instanceUrl];
  }
}

function stopAllPolling() {
  for (const url of Object.keys(pollTimers.value)) {
    clearInterval(pollTimers.value[url]);
  }
  pollTimers.value = {};
}

function cleanupInstanceState(instanceUrl: string) {
  stopPolling(instanceUrl);
  delete webviewRefs.value[instanceUrl];
  delete navStates.value[instanceUrl];
  delete faviconUrls.value[instanceUrl];
  delete domainStatuses.value[instanceUrl];
  delete injectedScriptsMap.value[instanceUrl];
  delete lastSyncedTitles[instanceUrl];
  initializedUrls.value.delete(instanceUrl);

  if (showScriptsDrawerFor.value === instanceUrl) {
    showScriptsDrawerFor.value = null;
  }
  if (showGoogleLoginHintFor.value === instanceUrl) {
    showGoogleLoginHintFor.value = null;
  }
}

// ─── 初始化 webview 实例 ───
async function initWebview(instanceUrl: string) {
  if (initializedUrls.value.has(instanceUrl)) return;

  const domain = webviewStore.extractDomain(instanceUrl);

  // 域名检查
  const result = await window.webviewApi.checkDomain(domain);
  domainStatuses.value[instanceUrl] = result;

  // 获取注入脚本
  const scripts = await window.webviewApi.getInjectedScripts(domain);
  injectedScriptsMap.value[instanceUrl] = scripts;

  await nextTick();

  const wv = webviewRefs.value[instanceUrl] as any;
  if (!wv) return;

  // 设置 src
  wv.src = instanceUrl;
  initializedUrls.value.add(instanceUrl);

  // ─── 脚本注入辅助 ───
  function injectScript(wv: any, script: typeof injectedScriptsMap.value[string][number]) {
    try {
      if (script.type === 'js') {
        // 如果脚本有 network/storage/clipboard 权限，先注入 GM API polyfill
        const perms = script.permissions || [];
        let code = script.content;
        if (perms.length > 0) {
          const polyfill = generateGMPolyfillCode(perms);
          code = polyfill + '\n' + code;
        }
        wv.executeJavaScript(code);
      } else if (script.type === 'css') {
        wv.insertCSS(script.content);
      } else if (script.type === 'html') {
        const escaped = script.content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        wv.executeJavaScript(
          `(() => { const c = document.createElement('div'); c.innerHTML = \`${escaped}\`; document.body.appendChild(c); })()`
        );
      }
    } catch (err) {
      console.error('[WebView:KeepAlive] Script injection failed:', script.name, err);
      notifyError(err, `脚本注入失败：${script.name}`);
    }
  }

  // 页面加载完成后注入 document-end 和 document-idle 脚本
  wv.addEventListener('did-finish-load', () => {
    const currentScripts = injectedScriptsMap.value[instanceUrl] || [];
    for (const script of currentScripts) {
      const runAt = script.runAt || 'document-end';
      if (runAt === 'document-end') {
        injectScript(wv, script);
      } else if (runAt === 'document-idle') {
        setTimeout(() => injectScript(wv, script), 500);
      }
    }
    syncPageTitle(wv, instanceUrl);
  });

  // document-start: 注入时机更早
  wv.addEventListener('did-start-navigation', (e: any) => {
    if (!e.isMainFrame) return;
    const currentScripts = injectedScriptsMap.value[instanceUrl] || [];
    for (const script of currentScripts) {
      if (script.runAt === 'document-start') {
        // CSS 可以在 document-start 注入
        if (script.type === 'css') {
          injectScript(wv, script);
        }
        // JS 在 document-start 需要使用 did-finish-load 前的尝试
        // Electron webview 不支持真正的 document-start JS 注入
        // 但我们可以尽早注入
        else if (script.type === 'js') {
          injectScript(wv, script);
        }
      }
    }
  });

  wv.addEventListener('page-title-updated', () => {
    syncPageTitle(wv, instanceUrl);
  });

  wv.addEventListener('page-favicon-updated', (e: any) => {
    syncPageFavicon(instanceUrl, e.favicons);
  });

  // Google 登录引导
  wv.addEventListener('did-navigate', (e: any) => {
    if (isGoogleAuthUrl(e.url)) {
      const isGoogleSite = domain.endsWith('google.com') || domain.endsWith('youtube.com');
      if (!isGoogleSite) {
        showGoogleLoginHintFor.value = instanceUrl;
      }
    } else {
      if (showGoogleLoginHintFor.value === instanceUrl) {
        showGoogleLoginHintFor.value = null;
      }
    }
  });

  startPolling(instanceUrl);
}

// ─── 导航控制 ───
function goBack(url: string) {
  const wv = webviewRefs.value[url] as any;
  if (wv?.canGoBack()) wv.goBack();
}

function goForward(url: string) {
  const wv = webviewRefs.value[url] as any;
  if (wv?.canGoForward()) wv.goForward();
}

function reload(url: string) {
  const wv = webviewRefs.value[url] as any;
  if (wv) wv.reload();
}

function openDevTools(url: string) {
  const wv = webviewRefs.value[url] as any;
  if (wv?.openDevTools) wv.openDevTools();
}

function openGoogleLoginTab() {
  const googleUrl = encodeURIComponent('https://accounts.google.com');
  const routePath = `/webview?url=${googleUrl}`;
  barStore.openTab(routePath, 'Google 登录', undefined);
  router.push(routePath);
  showGoogleLoginHintFor.value = null;
}

// ─── 监听路由变化，管理实例 ───
watch(
  () => route.fullPath,
  (fullPath) => {
    if (!fullPath.startsWith('/webview')) {
      webviewStore.deactivateAll();
      return;
    }

    const urlParam = route.query.url;
    if (typeof urlParam !== 'string') {
      webviewStore.deactivateAll();
      return;
    }

    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(urlParam);
    } catch {
      targetUrl = urlParam;
    }

    webviewStore.activate(targetUrl);
  },
  { immediate: true },
);

watch(
  () => webviewStore.instances.map(inst => inst.url),
  (urls) => {
    const liveUrls = new Set(urls);
    const trackedUrls = new Set([
      ...Object.keys(webviewRefs.value),
      ...Object.keys(navStates.value),
      ...Object.keys(domainStatuses.value),
      ...Object.keys(injectedScriptsMap.value),
      ...Object.keys(pollTimers.value),
      ...Array.from(initializedUrls.value),
      ...Object.keys(lastSyncedTitles),
    ]);

    for (const instanceUrl of trackedUrls) {
      if (!liveUrls.has(instanceUrl)) {
        cleanupInstanceState(instanceUrl);
      }
    }

    for (const instanceUrl of liveUrls) {
      if (!initializedUrls.value.has(instanceUrl)) {
        void nextTick().then(() => initWebview(instanceUrl));
      }
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopAllPolling();
});

function setWebviewRef(url: string, el: any) {
  webviewRefs.value[url] = el;
}
</script>

<template>
  <div
    class="webview-keepalive-layer"
    :style="{ display: webviewStore.hasActiveInstance ? 'flex' : 'none' }"
  >
    <template v-for="inst in webviewStore.instances" :key="inst.url">
      <div
        class="webview-keepalive-instance"
        :style="{ display: inst.active ? 'flex' : 'none' }"
      >
        <!-- 导航栏 -->
        <div class="webview-nav">
          <div class="webview-nav__buttons">
            <UiIconButton variant="ghost" size="sm" shape="square" :disabled="!navStates[inst.url]?.canGoBack" title="后退" @click="goBack(inst.url)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </UiIconButton>
            <UiIconButton variant="ghost" size="sm" shape="square" :disabled="!navStates[inst.url]?.canGoForward" title="前进" @click="goForward(inst.url)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </UiIconButton>
            <UiIconButton variant="ghost" size="sm" shape="square" title="刷新" @click="reload(inst.url)">
              <svg v-if="!navStates[inst.url]?.isLoading" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 113 8a5 5 0 0110 0z" stroke="currentColor" stroke-width="1.5"/><path d="M13 3v5h-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <div v-else class="webview-nav__loading-indicator" />
            </UiIconButton>
          </div>

          <div class="webview-nav__url-bar">
            <span :class="['webview-nav__status', statusClassMap[domainStatuses[inst.url] || 'unknown']]">
              {{ statusLabelMap[domainStatuses[inst.url] || 'unknown'] }}
            </span>
            <span class="webview-nav__url">{{ navStates[inst.url]?.url || inst.url }}</span>
          </div>

          <div class="webview-nav__actions">
            <div class="webview-nav__scripts-btn-wrap">
              <UiIconButton
                variant="ghost" size="sm" shape="square"
                :title="(injectedScriptsMap[inst.url] || []).length > 0 ? `已注入 ${(injectedScriptsMap[inst.url] || []).length} 个脚本` : '查看注入脚本'"
                @click="showScriptsDrawerFor = inst.url"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4M9 2l-2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </UiIconButton>
              <span v-if="(injectedScriptsMap[inst.url] || []).length > 0" class="webview-nav__scripts-badge">
                {{ (injectedScriptsMap[inst.url] || []).length }}
              </span>
            </div>
            <UiIconButton variant="ghost" size="sm" shape="square" title="打开 DevTools" @click="openDevTools(inst.url)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M9 2h5v5M14 2L7 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </UiIconButton>
            <UiIconButton
              variant="ghost"
              size="sm"
              shape="square"
              :disabled="barStore.isWebviewPinned(inst.url)"
              :title="barStore.isWebviewPinned(inst.url) ? '已固定到底栏' : '固定到底栏'"
              @click="pinWebviewInstance(inst.url)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 2.5h6l-.8 4.2 2.3 2.3v1H8.7V14H7.3v-4H3.5V9l2.3-2.3L5 2.5z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg>
            </UiIconButton>
          </div>
        </div>

        <!-- webview -->
        <div class="webview-content">
          <webview
            :ref="(el: any) => setWebviewRef(inst.url, el)"
            class="webview-embed"
            :partition="'persist:webview'"
            :useragent="chromeUserAgent"
            allowpopups
          />

          <!-- Google 登录引导 -->
          <Transition name="ui-panel-pop">
            <div v-if="showGoogleLoginHintFor === inst.url" class="webview-login-hint">
              <div class="webview-login-hint__card">
                <div class="webview-login-hint__header">
                  <svg class="webview-login-hint__icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2a4 4 0 0 1 4 4v2h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4zm2 6V6a2 2 0 1 0-4 0v2h4zm-2 3a1.5 1.5 0 0 0-.5 2.915V15a.5.5 0 0 0 1 0v-1.085A1.5 1.5 0 0 0 10 11z" fill="currentColor"/>
                  </svg>
                  <h3>需要 Google 登录</h3>
                </div>
                <p class="webview-login-hint__text">
                  此页面正在跳转到 Google 登录。建议先在新标签页中完成登录，登录态会自动同步到所有网页。
                </p>
                <div class="webview-login-hint__actions">
                  <UiButton variant="primary" size="sm" @click="openGoogleLoginTab">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:4px"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    打开 Google 登录
                  </UiButton>
                  <UiButton variant="ghost" size="sm" @click="showGoogleLoginHintFor = null">忽略</UiButton>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </template>

    <!-- 脚本查看器（Drawer） -->
    <UiDrawer
      :model-value="showScriptsDrawerFor !== null"
      width="420px"
      @update:modelValue="showScriptsDrawerFor = $event ? showScriptsDrawerFor : null"
    >
      <template #header>
        <div class="scripts-drawer__header">
          <h3>已注入的脚本</h3>
          <UiIconButton variant="ghost" size="md" shape="square" @click="showScriptsDrawerFor = null">✕</UiIconButton>
        </div>
      </template>
      <div class="scripts-drawer__list">
        <template v-if="showScriptsDrawerFor">
          <div v-for="script in (injectedScriptsMap[showScriptsDrawerFor] || [])" :key="script.id" class="scripts-drawer__item">
            <div class="scripts-drawer__item-head">
              <span class="scripts-drawer__item-name">{{ script.name }}</span>
              <span class="scripts-drawer__item-type" :class="`scripts-drawer__item-type--${script.type}`">
                {{ scriptTypeLabel(script.type) }}
              </span>
            </div>
            <div class="scripts-drawer__item-pattern">匹配: {{ script.domainPattern }}</div>
            <pre class="scripts-drawer__item-code"><code>{{ script.content }}</code></pre>
          </div>
          <div v-if="(injectedScriptsMap[showScriptsDrawerFor] || []).length === 0" class="scripts-drawer__empty">
            当前页面没有注入任何脚本
          </div>
        </template>
      </div>
    </UiDrawer>
  </div>
</template>

<style lang="scss" scoped>
.webview-keepalive-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  flex-direction: column;
}

.webview-keepalive-instance {
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
}

/* ─── 导航栏 ─── */
.webview-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--ui-surface-elevated, var(--card-bg));
  border-bottom: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
  flex-shrink: 0;
}

.webview-nav__buttons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.webview-nav__url-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.08));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
  min-width: 0;
  font-size: 12px;
  color: var(--ui-text-secondary);
  overflow: hidden;
}

.webview-nav__status {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;

  &--safe { background: rgba(82, 196, 26, 0.12); color: #52c41a; }
  &--danger { background: rgba(245, 108, 108, 0.12); color: #f56c6c; }
  &--warn { background: rgba(250, 173, 20, 0.12); color: #faad14; }
}

.webview-nav__url {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.webview-nav__loading-indicator {
  width: 12px;
  height: 12px;
  border: 2px solid var(--ui-text-muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: webview-spin 0.8s linear infinite;
}

.webview-nav__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.webview-nav__scripts-btn-wrap {
  position: relative;
  display: inline-flex;
}

.webview-nav__scripts-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--ui-primary-color, #667eea);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  pointer-events: none;
}

/* ─── 内容区 ─── */
.webview-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.webview-embed {
  width: 100%;
  height: 100%;
  border: none;
}

/* ─── Google 登录引导 ─── */
.webview-login-hint {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: var(--ui-z-floating);
}

.webview-login-hint__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 22px;
  border-radius: var(--ui-radius-lg, 12px);
  background: var(--ui-surface-glass, color-mix(in srgb, var(--ui-surface-elevated, #1e1e2e) 85%, transparent));
  border: var(--ui-border-width-thin, 1px) solid color-mix(in srgb, var(--ui-border-accent, rgba(128,128,128,0.2)) 60%, var(--ui-border-subtle, rgba(128,128,128,0.1)));
  backdrop-filter: var(--ui-backdrop-blur-md, blur(12px));
  box-shadow: var(--ui-panel-shadow, 0 8px 32px rgba(0, 0, 0, 0.18));
  max-width: 340px;
}

.webview-login-hint__header {
  display: flex;
  align-items: center;
  gap: 10px;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--ui-text-primary);
    letter-spacing: 0.01em;
  }
}

.webview-login-hint__icon {
  flex-shrink: 0;
  color: var(--ui-primary-color, #667eea);
  opacity: 0.9;
}

.webview-login-hint__text {
  font-size: 12.5px;
  color: var(--ui-text-secondary);
  line-height: 1.65;
  margin: 0;
}

.webview-login-hint__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

/* ─── 脚本查看器 ─── */
.scripts-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--ui-text-primary); }
}

.scripts-drawer__list {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scripts-drawer__item {
  padding: 12px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
}

.scripts-drawer__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.scripts-drawer__item-name { font-weight: 500; color: var(--ui-text-primary); }

.scripts-drawer__item-type {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
  &--js { background: rgba(250, 200, 50, 0.15); color: #e6a700; }
  &--css { background: rgba(100, 160, 255, 0.15); color: #4a90d9; }
  &--html { background: rgba(255, 120, 80, 0.15); color: #e06040; }
}

.scripts-drawer__item-pattern { font-size: 12px; color: var(--ui-text-muted); margin-bottom: 8px; }

.scripts-drawer__item-code {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: var(--ui-surface-elevated, rgba(0, 0, 0, 0.05));
  font-size: 11px;
  line-height: 1.5;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ui-text-secondary);
  code { font-family: 'Courier New', Consolas, monospace; }
}

.scripts-drawer__empty { text-align: center; padding: 24px; color: var(--ui-text-muted); }

@keyframes webview-spin { to { transform: rotate(360deg); } }
</style>
