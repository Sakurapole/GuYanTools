<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import type { DomainCheckResult, WebScriptRule } from '@/contracts/webview';
import UiButton from '../components/ui/UiButton.vue';
import UiCheckbox from '../components/ui/UiCheckbox.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiPopupSurface from '../components/ui/UiPopupSurface.vue';
import { useAppConfigStore } from '../stores/app_config_store';
import { useBarStore } from '../stores/bar_store';
import { useGlobalStore } from '../stores/global_store';
import { useWebviewStore } from '../stores/webview_store';
import { router } from '../routes/router';
import { notifyError } from '../composables/useInAppNotification';

const route = useRoute();
const barStore = useBarStore();
const globalStore = useGlobalStore();
const webviewStore = useWebviewStore();
const webviewRef = ref<HTMLElement | null>(null);

// ─── 标准 Chrome User-Agent（去掉 Electron 标识，避免 Google 等第三方登录拦截） ───
const chromeUserAgent = navigator.userAgent
  .replace(/\s*Electron\/\S+/, '')
  .replace(/\s*GuYanTools\/\S+/i, '');

// ─── Google 登录 URL 检测（用于引导提示，不再拦截） ───
const GOOGLE_AUTH_PATTERNS = [
  'accounts.google.com',
  'accounts.youtube.com',
];

function isGoogleAuthUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return GOOGLE_AUTH_PATTERNS.some(p => u.hostname === p);
  } catch {
    return false;
  }
}

// ─── 从 query 获取 URL ───
const targetUrl = computed(() => {
  const raw = route.query.url;
  if (typeof raw === 'string') {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
});

const domain = computed(() => {
  try {
    return new URL(targetUrl.value).hostname;
  } catch {
    return '';
  }
});

// ─── 状态 ───
type PageState = 'checking' | 'blocked' | 'warning' | 'loading' | 'loaded' | 'error' | 'keep-alive';
const pageState = ref<PageState>('checking');
const domainStatus = ref<DomainCheckResult>('unknown');
const errorMessage = ref('');

// ─── 导航状态 ───
interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
  url: string;
  title: string;
  isLoading: boolean;
}

const navState = ref<NavState>({
  canGoBack: false,
  canGoForward: false,
  url: '',
  title: '',
  isLoading: false,
});

// ─── 脚本查看 ───
const injectedScripts = ref<WebScriptRule[]>([]);
const showScriptsDrawer = ref(false);

// ─── Google 登录引导提示 ───
const showGoogleLoginHint = ref(false);

const currentKeepAliveTargetUrl = computed(() => targetUrl.value);
const canKeepAliveTemporarily = computed(() =>
  Boolean(currentKeepAliveTargetUrl.value)
  && (pageState.value === 'loaded' || pageState.value === 'loading')
  && !webviewStore.isManagedKeepAliveUrl(currentKeepAliveTargetUrl.value),
);

function openGoogleLoginTab() {
  // 在应用内新 tab 打开 Google 登录（共享同一 partition，登录态自动互通）
  const googleUrl = encodeURIComponent('https://accounts.google.com');
  const routePath = `/webview?url=${googleUrl}`;
  barStore.openTab(routePath, 'Google 登录', undefined);
  router.push(routePath);
  showGoogleLoginHint.value = false;
}

function dismissGoogleLoginHint() {
  showGoogleLoginHint.value = false;
}

let navPollTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncedTitle = '';

// ─── 同步页面标题到标签栏 / 路由 meta / document.title / 顶栏 ───
function syncPageTitle(wvEl: any) {
  const title = wvEl.getTitle?.() || '';
  if (!title || title === lastSyncedTitle) return;

  lastSyncedTitle = title;

  // 1. 更新底栏 Tab 名称（使用完整路由路径精确匹配当前 tab）
  barStore.updateTabName(route.fullPath, title);

  // 2. 更新路由 meta.title（影响弹窗标题栏 & document.title）
  route.meta.title = title;
  document.title = `${title} - GuYanTools`;

  // 3. 更新顶栏标题
  globalStore.setCurrentPage(title);

  // 4. 同步到 navState
  navState.value.title = title;
}

// ─── 域名检查 & 加载 ───
async function checkAndLoad() {
  if (!targetUrl.value) return;

  // 保活域名由 WebViewKeepAlive 容器接管
  if (webviewStore.isManagedKeepAliveUrl(targetUrl.value)) {
    pageState.value = 'keep-alive';
    return;
  }

  pageState.value = 'checking';

  try {
    const result = await window.webviewApi.checkDomain(domain.value);
    domainStatus.value = result;

    if (result === 'blacklist') {
      pageState.value = 'blocked';
      return;
    }

    if (result === 'unknown') {
      pageState.value = 'warning';
      return;
    }

    // whitelist → 直接加载
    await loadWebview();
  } catch (err: any) {
    pageState.value = 'error';
    errorMessage.value = err.message || String(err);
  }
}

async function handleContinue() {
  await loadWebview();
}

async function loadWebview() {
  pageState.value = 'loading';

  // 获取注入脚本
  injectedScripts.value = await window.webviewApi.getInjectedScripts(domain.value);

  // 等待 DOM 更新后 webview 才存在
  await nextTick();

  const wv = webviewRef.value as any;
  if (!wv) {
    pageState.value = 'error';
    errorMessage.value = 'webview element not found';
    return;
  }

  // 设置 webview src
  wv.src = targetUrl.value;
  pageState.value = 'loaded';

  // 页面加载完成后注入脚本 + 同步标题
  wv.addEventListener('did-finish-load', () => {
    // 注入脚本
    for (const script of injectedScripts.value) {
      try {
        if (script.type === 'js') {
          wv.executeJavaScript(script.content);
        } else if (script.type === 'css') {
          wv.insertCSS(script.content);
        } else if (script.type === 'html') {
          const escaped = script.content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
          wv.executeJavaScript(
            `(() => { const c = document.createElement('div'); c.innerHTML = \`${escaped}\`; document.body.appendChild(c); })()`
          );
        }
      } catch (err) {
        console.error('[WebView] Script injection failed:', script.name, err);
        notifyError(err, `脚本注入失败：${script.name}`);
      }
    }
    // 页面加载完成后同步标题
    syncPageTitle(wv);
  });

  // 页面标题更新事件
  wv.addEventListener('page-title-updated', () => {
    syncPageTitle(wv);
  });

  // ─── Google 登录引导：检测到 Google 登录 URL 时提示用户 ───
  // 不拦截导航，只显示引导提示
  wv.addEventListener('did-navigate', (e: any) => {
    if (isGoogleAuthUrl(e.url)) {
      // 当前页面本身就是 Google 时不提示（用户可能正在登录）
      const isGoogleSite = domain.value.endsWith('google.com') || domain.value.endsWith('youtube.com');
      if (!isGoogleSite) {
        showGoogleLoginHint.value = true;
      }
    } else {
      // 离开登录页后自动关闭提示
      showGoogleLoginHint.value = false;
    }
  });

  // 开启导航状态轮询
  startNavPolling();
}

// ─── 导航控制 ───
function goBack() {
  const wv = webviewRef.value as any;
  if (wv?.canGoBack()) wv.goBack();
}

function goForward() {
  const wv = webviewRef.value as any;
  if (wv?.canGoForward()) wv.goForward();
}

function reload() {
  const wv = webviewRef.value as any;
  if (wv) wv.reload();
}

function keepAliveTemporarily() {
  const keepAliveUrl = currentKeepAliveTargetUrl.value;
  if (!keepAliveUrl) return;

  const title = navState.value.title || lastSyncedTitle || domain.value || keepAliveUrl;
  stopNavPolling();
  webviewStore.keepAliveTemporary(keepAliveUrl, title);
  pageState.value = 'keep-alive';
}

function startNavPolling() {
  stopNavPolling();
  navPollTimer = setInterval(() => {
    const wv = webviewRef.value as any;
    if (!wv) return;
    try {
      navState.value = {
        canGoBack: wv.canGoBack?.() ?? false,
        canGoForward: wv.canGoForward?.() ?? false,
        url: wv.getURL?.() ?? '',
        title: wv.getTitle?.() ?? '',
        isLoading: wv.isLoading?.() ?? false,
      };

      // 轮询时也同步标题到标签栏
      syncPageTitle(wv);

      // 同步刷新注入脚本列表
      const currentDomain = navState.value.url
        ? (() => { try { return new URL(navState.value.url).hostname; } catch { return ''; } })()
        : domain.value;
      if (currentDomain) {
        window.webviewApi.getInjectedScripts(currentDomain).then(scripts => {
          injectedScripts.value = scripts;
        });
      }
    } catch { /* ignore */ }
  }, 800);
}

function stopNavPolling() {
  if (navPollTimer) {
    clearInterval(navPollTimer);
    navPollTimer = null;
  }
}

// ─── 脚本类型标签 ───
function scriptTypeLabel(type: string) {
  switch (type) {
    case 'js': return 'JavaScript';
    case 'css': return 'CSS';
    case 'html': return 'HTML';
    default: return type;
  }
}

function openDevTools() {
  const wv = webviewRef.value as any;
  if (wv?.openDevTools) wv.openDevTools();
}

function openScriptEditor(scriptId?: string) {
  window.webviewApi.openScriptEditor(scriptId, domain.value);
}

async function toggleScript(script: WebScriptRule) {
  const appConfigStore = useAppConfigStore();
  const scripts = (appConfigStore.config.web?.scripts ?? []).map((s: WebScriptRule) => {
    if (s.id !== script.id) return { ...s };
    return { ...s, enabled: !s.enabled };
  });
  await appConfigStore.updateConfig({ web: { scripts } });
}

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

// ─── 生命周期 ───
onMounted(() => {
  void checkAndLoad();
});

onBeforeUnmount(() => {
  stopNavPolling();
});

// URL 变化时重新加载
watch(targetUrl, () => {
  stopNavPolling();
  showGoogleLoginHint.value = false;
  void checkAndLoad();
});
</script>

<template>
  <div class="webview-page">
    <!-- 导航栏 -->
    <div class="webview-nav" v-if="pageState === 'loaded' || pageState === 'loading'">
      <div class="webview-nav__buttons">
        <UiIconButton variant="ghost" size="sm" shape="square" :disabled="!navState.canGoBack" title="后退" @click="goBack">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </UiIconButton>
        <UiIconButton variant="ghost" size="sm" shape="square" :disabled="!navState.canGoForward" title="前进" @click="goForward">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </UiIconButton>
        <UiIconButton variant="ghost" size="sm" shape="square" title="刷新" @click="reload">
          <svg v-if="!navState.isLoading" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 113 8a5 5 0 0110 0z" stroke="currentColor" stroke-width="1.5"/><path d="M13 3v5h-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div v-else class="webview-nav__loading-indicator" />
        </UiIconButton>
      </div>

      <div class="webview-nav__url-bar">
        <span :class="['webview-nav__status', statusClassMap[domainStatus]]">{{ statusLabelMap[domainStatus] }}</span>
        <span class="webview-nav__url">{{ navState.url || targetUrl }}</span>
      </div>

      <div class="webview-nav__actions">
        <div class="webview-nav__scripts-btn-wrap">
          <UiIconButton
            variant="ghost" size="sm" shape="square"
            :title="injectedScripts.length > 0 ? `已注入 ${injectedScripts.length} 个脚本` : '查看注入脚本'"
            @click="showScriptsDrawer = true"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4M9 2l-2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </UiIconButton>
          <span v-if="injectedScripts.length > 0" class="webview-nav__scripts-badge">{{ injectedScripts.length }}</span>
        </div>

        <UiIconButton variant="ghost" size="sm" shape="square" title="打开 DevTools" @click="openDevTools">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M9 2h5v5M14 2L7 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </UiIconButton>
        <UiButton v-if="canKeepAliveTemporarily" variant="secondary" size="sm" @click="keepAliveTemporarily">
          临时保活
        </UiButton>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="webview-content">
      <!-- 检查中 -->
      <div v-if="pageState === 'checking'" class="webview-state">
        <div class="webview-state__icon">🔍</div>
        <h2>正在检查域名安全策略…</h2>
        <p class="webview-state__domain">{{ domain }}</p>
      </div>

      <!-- 已阻止 -->
      <div v-else-if="pageState === 'blocked'" class="webview-state webview-state--danger">
        <div class="webview-state__icon">🚫</div>
        <h2>此域名已被禁止访问</h2>
        <p class="webview-state__domain">{{ domain }}</p>
        <p class="webview-state__hint">该域名在黑名单中，如需访问请前往 设置 → 外部网页配置 调整。</p>
      </div>

      <!-- 风险提示 -->
      <div v-else-if="pageState === 'warning'" class="webview-state webview-state--warn">
        <div class="webview-state__icon">⚠️</div>
        <h2>此网页可能存在安全风险</h2>
        <p class="webview-state__domain">{{ domain }}</p>
        <p class="webview-state__hint">该域名不在您的信任名单中。请确认您信任此来源后再继续访问。</p>
        <UiButton variant="primary" size="md" @click="handleContinue">我了解风险，继续访问</UiButton>
      </div>

      <!-- webview 标签 -->
      <webview
        v-if="pageState === 'loaded' || pageState === 'loading'"
        ref="webviewRef"
        class="webview-embed"
        :partition="'persist:webview'"
        :useragent="chromeUserAgent"
        allowpopups
      />

      <!-- Google 登录引导提示 -->
      <Transition name="ui-panel-pop">
        <div v-if="showGoogleLoginHint" class="webview-login-hint">
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
              <UiButton variant="ghost" size="sm" @click="dismissGoogleLoginHint">忽略</UiButton>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 错误 -->
      <div v-if="pageState === 'error'" class="webview-state webview-state--danger">
        <div class="webview-state__icon">❌</div>
        <h2>加载失败</h2>
        <p class="webview-state__hint">{{ errorMessage }}</p>
      </div>

      <!-- 脚本管理抽屉（内联，仅覆盖 webview 区域） -->
      <UiPopupSurface
        :model-value="showScriptsDrawer"
        variant="drawer"
        placement="right"
        :teleported="false"
        :fixed="false"
        width="380px"
        z-index="var(--ui-z-docked)"
        aria-label="注入脚本"
        @close="showScriptsDrawer = false"
      >
              <div class="sd-header">
                <div class="sd-header__info">
                  <h3>注入脚本</h3>
                  <span v-if="injectedScripts.length > 0" class="sd-header__count">{{ injectedScripts.length }}</span>
                </div>
                <UiIconButton variant="ghost" size="sm" shape="square" @click="showScriptsDrawer = false">✕</UiIconButton>
              </div>

              <div class="sd-list">
                <div v-for="script in injectedScripts" :key="script.id" class="sd-item" :class="{ 'sd-item--disabled': !script.enabled }">
                  <div class="sd-item__row">
                    <span class="sd-item__badge" :class="`sd-item__badge--${script.type}`">{{ script.type.toUpperCase() }}</span>
                    <span class="sd-item__name">{{ script.name }}</span>
                    <UiCheckbox
                      class="sd-item__toggle"
                      size="sm"
                      :checked="script.enabled"
                      :title="script.enabled ? '已启用' : '已禁用'"
                      @change="toggleScript(script)"
                    />
                    <UiIconButton variant="ghost" size="sm" shape="square" @click="openScriptEditor(script.id)" title="编辑">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10.5 1.5l2 2L4.5 11.5l-3 1 1-3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                    </UiIconButton>
                  </div>
                  <div class="sd-item__domain">{{ script.domainPattern }}</div>
                  <pre class="sd-item__code"><code>{{ script.content }}</code></pre>
                </div>
                <div v-if="injectedScripts.length === 0" class="sd-empty">
                  <div class="sd-empty__icon">📜</div>
                  <p>当前页面没有注入脚本</p>
                </div>
              </div>

              <div class="sd-footer">
                <UiButton variant="primary" size="sm" @click="openScriptEditor()" style="flex:1">
                  📜 管理所有脚本
                </UiButton>
              </div>
      </UiPopupSurface>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.webview-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
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
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-secondary);
  overflow: hidden;
}

.webview-nav__status {
  flex-shrink: 0;
  font-size: var(--ui-font-size-xs);
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

/* ─── 状态页 ─── */
.webview-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  padding: 24px;
  text-align: center;

  h2 {
    margin: 0;
    font-size: var(--ui-font-size-xl);
    font-weight: 600;
    color: var(--ui-text-primary);
  }
}

.webview-state__icon {
  font-size: 48px;
}

.webview-state__icon--spin {
  animation: webview-spin 1.5s linear infinite;
}

.webview-state__domain {
  font-size: var(--ui-font-size-md);
  color: var(--ui-text-muted);
  font-family: var(--ui-font-family-mono);
}

.webview-state__hint {
  font-size: var(--ui-font-size-sm);
  color: var(--ui-text-secondary);
  max-width: 400px;
  line-height: 1.6;
}

.webview-state--danger {
  .webview-state__icon {
    filter: drop-shadow(0 0 8px rgba(245, 108, 108, 0.3));
  }
}

.webview-state--warn {
  .webview-state__icon {
    filter: drop-shadow(0 0 8px rgba(250, 173, 20, 0.3));
  }
}

/* ─── Google 登录引导提示 ─── */
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
    font-size: var(--ui-font-size-md);
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
  font-size: var(--ui-font-size-sm);
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

/* ─── Script Drawer ─── */
.sd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
  flex-shrink: 0;
}

.sd-header__info {
  display: flex;
  align-items: center;
  gap: 8px;

  h3 { margin: 0; font-size: var(--ui-font-size-md); font-weight: 600; }
}

.sd-header__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--ui-primary-color, #667eea);
  color: #fff;
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
}

.sd-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sd-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.08));
  transition: border-color 0.15s, opacity 0.15s;

  &:hover { border-color: var(--ui-border-accent, rgba(128, 128, 128, 0.2)); }
  &--disabled { opacity: 0.45; }
}

.sd-item__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sd-item__badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  text-transform: uppercase;

  &--js  { background: rgba(234, 179, 8, 0.15); color: #eab308; }
  &--css { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
  &--html { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
}

.sd-item__name {
  flex: 1;
  font-size: var(--ui-font-size-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ─── Toggle switch ─── */
.sd-item__toggle {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;

  :deep(.ui-checkbox__box) {
    width: 16px;
    height: 16px;
  }
}

.sd-item__domain {
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
  font-family: var(--ui-font-family-mono);
}

.sd-item__code {
  margin: 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.15);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ui-text-secondary);
  font-family: var(--ui-font-family-mono);

  code { font: inherit; }
}

.sd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--ui-text-muted);
  text-align: center;
}

.sd-empty__icon { font-size: 32px; margin-bottom: 8px; opacity: 0.5; }
.sd-empty p { margin: 0; font-size: var(--ui-font-size-sm); }

.sd-footer {
  display: flex;
  padding: 12px 16px;
  border-top: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
  flex-shrink: 0;
}
</style>
