const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readDesktopFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function testWorkspaceWindowContractAndMainHandlers() {
  const contract = readDesktopFile('src/contracts/workspace_window.ts');
  const manager = readDesktopFile('src/main/workspace-window/manager.ts');
  const ipc = readDesktopFile('src/main/workspace-window/ipc.ts');
  const main = readDesktopFile('src/main/index.ts');
  const preload = readDesktopFile('src/preload.ts');
  const types = readDesktopFile('src/core/@types/index.d.ts');
  const rendererConfig = readDesktopFile('vite.renderer.config.ts');
  const workspaceWindowHtml = readDesktopFile('workspace_window.html');
  const workspaceWindowApp = readDesktopFile('src/windows/workspace-window/WorkspaceWindowApp.vue');
  const workspaceWindowMain = readDesktopFile('src/windows/workspace-window/main.ts');
  const workspaceWindowSkeleton = readDesktopFile('src/windows/workspace-window/WorkspaceWindowSkeleton.vue');
  const router = readDesktopFile('src/windows/main/routes/router.ts');

  assert.match(contract, /export type WorkspaceWindowKey = 'terminal' \| 'ftp' \| 'todo' \| 'ai' \| 'knowledge'/);
  assert.match(contract, /WORKSPACE_WINDOW_DEFINITIONS/);
  assert.match(contract, /WorkspaceDetachedOpenOptions/);
  assert.match(contract, /routeOverride\?: string/);
  assert.match(contract, /openDetached: \(key: WorkspaceWindowKey, options\?: WorkspaceDetachedOpenOptions\) => Promise<WorkspaceDetachedWindowState>/);
  assert.match(contract, /returnToMain: \(key: WorkspaceWindowKey\) => Promise<WorkspaceDetachedWindowState>/);
  assert.match(contract, /getContext: \(\) => Promise<WorkspaceWindowContext>/);
  assert.match(contract, /WorkspaceWindowPageState/);
  assert.match(contract, /getPageState: \(key: WorkspaceWindowKey\) => Promise<WorkspaceWindowPageState \| null>/);
  assert.match(contract, /setPageState: \(key: WorkspaceWindowKey, state: WorkspaceWindowPageState\) => Promise<void>/);
  assert.match(contract, /onStateChanged/);

  assert.match(manager, /new BrowserWindow/);
  assert.match(manager, /prewarmedWindows = new Map<WorkspaceWindowKey, BrowserWindow>/, 'expected detached workspace windows to use a prewarm pool');
  assert.match(manager, /prewarmDetachedWindows\(\)/, 'expected detached workspace windows to expose prewarm entrypoint');
  assert.match(manager, /takePrewarmedWindow\(key\)/, 'expected detached workspace windows to reuse prewarmed windows');
  assert.match(manager, /createWorkspaceWindow\(key, true\)/, 'expected cold detached workspace windows to be created visible immediately');
  assert.match(manager, /createWorkspaceWindow\(key, false\)/, 'expected prewarmed detached workspace windows to stay hidden');
  assert.doesNotMatch(manager, /ready-to-show/, 'expected detached workspace windows not to delay visibility until ready-to-show');
  assert.doesNotMatch(manager, /await this\.loadDetachedRoute\(win, key, options\)/, 'expected new detached workspace windows not to block IPC on first renderer load');
  assert.match(manager, /workspace_window\.html#\$\{hashRoute\}/, 'expected detached workspace windows to load the dedicated renderer entry');
  assert.match(manager, /workspace_window\.html/, 'expected detached workspace windows to load the dedicated renderer html in production');
  assert.match(manager, /query\.set\('prewarm', '1'\)/, 'expected prewarmed windows to load only the skeleton route');
  assert.match(manager, /query\.set\('detached', key\)/);
  assert.match(manager, /broadcastState/);
  assert.match(manager, /returnToMain/);
  assert.match(manager, /createDetachedHash\(key, options\)/);
  assert.match(manager, /normalizeDetachedRouteOverride/);
  assert.match(manager, /navigateToHash\(definition\.route\)/);
  assert.match(manager, /pageStates = new Map<WorkspaceWindowKey, WorkspaceWindowPageState>/);
  assert.match(manager, /getPageState\(key: WorkspaceWindowKey\)/);
  assert.match(manager, /setPageState\(key: WorkspaceWindowKey, state: WorkspaceWindowPageState\)/);
  assert.match(main, /workspaceWindowManager\.prewarmDetachedWindows\(\)/, 'expected app startup to prewarm detached workspace windows');
  assert.match(rendererConfig, /workspace_window:\s*path\.resolve\(__dirname, 'workspace_window\.html'\)/, 'expected Vite renderer build to include workspace window html');
  assert.match(workspaceWindowHtml, /src\/windows\/workspace-window\/main\.ts/, 'expected dedicated workspace html to load the lightweight entry');
  assert.match(workspaceWindowMain, /createApp\(App\)/, 'expected workspace window entry to mount its own Vue app');
  assert.match(workspaceWindowMain, /app\.use\(router\)/, 'expected workspace window entry to install router for reused page components');
  assert.doesNotMatch(workspaceWindowMain, /pluginHostApi|useUpdaterStore|useBarStore|useGlobalStore/, 'expected workspace window entry to avoid main-shell startup costs');
  assert.match(workspaceWindowApp, /WorkspaceWindowSkeleton/, 'expected workspace window app to render page skeleton fallback');
  assert.match(workspaceWindowApp, /<router-view/, 'expected workspace window app to render detachable pages through router');
  assert.match(workspaceWindowApp, /const \{ ipcRenderer \} = window/, 'expected workspace window app to use the preload ipcRenderer contract');
  assert.match(workspaceWindowSkeleton, /workspace-skeleton/, 'expected dedicated workspace skeleton component');
  assert.match(router, /__workspace-prewarm/, 'expected workspace window prewarm route to avoid loading heavy pages');

  assert.match(ipc, /workspace-window:open-detached/);
  assert.match(ipc, /options\?: WorkspaceDetachedOpenOptions/);
  assert.match(ipc, /workspace-window:return-to-main/);
  assert.match(ipc, /workspace-window:get-state/);
  assert.match(ipc, /workspace-window:get-context/);
  assert.match(ipc, /workspace-window:get-page-state/);
  assert.match(ipc, /workspace-window:set-page-state/);
  assert.match(manager, /workspace-window:state-changed/);
  assert.match(main, /registerWorkspaceWindowIpcHandlers/);
  assert.match(main, /workspaceWindowManager\.bindMainWindow/);
  assert.match(preload, /workspaceWindowApi/);
  assert.match(preload, /workspace-window:get-page-state/);
  assert.match(preload, /workspace-window:set-page-state/);
  assert.match(types, /workspaceWindowApi\?: WorkspaceWindowApi/);
}

function testShortcutConfigCoversDetachedPages() {
  const config = readDesktopFile('src/contracts/app_config.ts');
  const manager = readDesktopFile('src/main/app-config/manager.ts');
  const shortcutService = readDesktopFile('src/main/shortcuts/service.ts');
  const settings = readDesktopFile('src/windows/main/pages/Settings.vue');

  for (const key of [
    'openDetachedTerminal',
    'openDetachedFtp',
    'openDetachedTodo',
    'openDetachedAi',
    'openDetachedKnowledge',
  ]) {
    assert.match(config, new RegExp(`${key}: string;`), `expected app config to expose ${key}`);
    assert.match(manager, new RegExp(`${key}: normalizeShortcutValue\\(system\\.${key}`), `expected app config normalization for ${key}`);
    assert.match(shortcutService, new RegExp(`key: '${key}'`), `expected shortcut action registration for ${key}`);
    assert.match(settings, new RegExp(`key: '${key}'`), `expected settings recorder metadata for ${key}`);
  }

  assert.match(shortcutService, /WorkspaceDetachedWindowOpener/);
  assert.match(shortcutService, /openWorkspaceDetachedWindow/);
  assert.match(settings, /updateSystemShortcut\(row\.key, \$event\)/, 'expected settings detached shortcut rows to update system shortcuts');
}

function testMainWindowDetachedPlaceholder() {
  const app = readDesktopFile('src/windows/main/App.vue');
  const topbar = readDesktopFile('src/windows/main/components/topbar/topbar.vue');
  const topbarStyle = readDesktopFile('src/windows/main/components/topbar/topbar.scss');

  assert.match(app, /detachedRouteKey/);
  assert.match(app, /isCurrentPageDetached/);
  assert.match(app, /当前页面已独立显示/);
  assert.match(app, /回到主窗口/);
  assert.match(app, /returnDetachedPageToMain/);
  assert.match(app, /workspaceWindowApi\?\.returnToMain/);
  assert.match(app, /returnDetachedPageToMain/);
  assert.match(app, /:can-detach-current-page="Boolean\(detachedRouteKey && !isCurrentPageDetached\)"/, 'expected topbar to receive detachable page state');
  assert.match(app, /@detach-current-page="openCurrentPageDetached"/, 'expected topbar detach action to open current page detached');
  assert.doesNotMatch(app, /workspace-detach-action/, 'expected detach action to live in the topbar, not as a floating page action');
  assert.match(app, /popup-titlebar__return/);
  assert.match(app, /isDetachedWindow/);
  assert.match(app, /openDetachedRouteFromDetachedWindow/);
  assert.match(app, /from\.query\.detached/);
  assert.match(app, /next\(false\)/);
  assert.match(app, /workspace-detached-placeholder/);
  assert.match(app, /workspaceWindowApi\?\.onStateChanged/);

  assert.match(topbar, /canDetachCurrentPage\?: boolean/, 'expected topbar to accept detachable page state');
  assert.match(topbar, /detachCurrentPage: \[\]/, 'expected topbar to emit detach action');
  assert.match(topbar, /<UiIconButton[\s\S]*?workspace-detach-topbar-btn/, 'expected topbar to render detach icon button');
  assert.match(topbar, /<div class="window-btn-group">[\s\S]*?workspace-detach-topbar-btn[\s\S]*?theme-btn/, 'expected topbar detach button to sit before the theme/window controls');
  assert.match(topbar, /:title="detachButtonTitle"/, 'expected topbar detach icon button to keep tooltip text');
  assert.match(topbarStyle, /workspace-detach-topbar-btn/, 'expected topbar detach button styling');
  assert.match(topbarStyle, /&--empty\s*{[\s\S]*?min-width:\s*0;[\s\S]*?padding:\s*0;/, 'expected empty topbar function area not to reserve detached button space');
  assert.match(topbarStyle, /& \.ui-icon-button\.workspace-detach-topbar-btn/, 'expected topbar detach button to share window control button sizing');
}

function testQuickLaunchCanChooseMainOrDetachedWindow() {
  const contract = readDesktopFile('src/contracts/quick_launch.ts');
  const service = readDesktopFile('src/main/quick-launch/service.ts');
  const app = readDesktopFile('src/windows/quick-launch/App.vue');

  assert.match(contract, /'open-detached-window'/, 'expected quick launch execution mode to include detached window opening');
  assert.match(service, /mode === 'open-detached-window'/, 'expected quick launch service to branch detached window execution');
  assert.match(service, /workspaceWindowManager\.openDetached\(target\.key, \{ routeOverride: target\.route \}\)/, 'expected quick launch detached execution to preserve deep-link route query');
  assert.match(service, /workspaceWindowKeyFromAction/, 'expected quick launch service to map internal routes to detachable workspace windows');
  assert.match(service, /workspaceWindowTargetFromAction/, 'expected quick launch service to map profile actions to detached window targets');
  assert.match(service, /action\.type === 'open-ssh-profile'/, 'expected SSH quick launch profiles to support detached terminal windows');
  assert.match(service, /action\.type === 'open-ftp-profile'/, 'expected FTP quick launch profiles to support detached FTP windows');
  assert.match(service, /connectSshProfileId/, 'expected detached SSH quick launch routes to include profile connection query');
  assert.match(service, /openFtpProfileId/, 'expected detached FTP quick launch routes to include profile open query');
  assert.match(app, /open-detached-window/, 'expected quick launch action panel to expose detached window action');
  assert.match(app, /在独立窗口打开/, 'expected quick launch action panel label for detached window action');
  assert.match(app, /canOpenDetachedWindow/, 'expected quick launch renderer to show detached action only for supported internal pages');
  assert.match(app, /open-ssh-profile/, 'expected quick launch renderer to offer detached action for SSH profiles');
  assert.match(app, /open-ftp-profile/, 'expected quick launch renderer to offer detached action for FTP profiles');
  assert.match(app, /hideForLaunchBeforeExecute/, 'expected quick launch renderer to hide before launching slow detached windows');
  assert.match(app, /await hideForLaunchBeforeExecute\(\)/, 'expected quick launch renderer to wait for the hide request before executing launch actions');
  assert.match(app, /executeSelectedResult\('open-detached-window'\)/, 'expected quick launch Alt+Enter path to open supported results detached');
}

function testDetachedPagesDoNotNavigateCurrentWindowAcrossRoutes() {
  const terminal = readDesktopFile('src/windows/main/pages/Terminal/TerminalPage.vue');
  const ftp = readDesktopFile('src/windows/main/pages/Ftp/FtpPage.vue');

  assert.match(terminal, /isDetachedWindow/, 'expected terminal page to know when it is running detached');
  assert.match(terminal, /openDetached\('ftp', \{ routeOverride: '\/ftp' \}\)/, 'expected detached terminal file-manager action to open FTP in its own detached window');
  assert.match(ftp, /isDetachedWindow/, 'expected FTP page to know when it is running detached');
  assert.match(ftp, /openDetached\('terminal'/, 'expected detached FTP terminal action to open terminal in its own detached window');
  assert.match(ftp, /v-if="!isDetachedWindow"[\s\S]*?openTransferSettingsPage/, 'expected FTP settings navigation to be hidden in detached windows');
}

function testTerminalAndFtpShareWorkspaceWindowPageState() {
  const terminal = readDesktopFile('src/windows/main/pages/Terminal/TerminalPage.vue');
  const ftp = readDesktopFile('src/windows/main/pages/Ftp/FtpPage.vue');
  const terminalStore = readDesktopFile('src/windows/main/stores/terminal_store.ts');
  const sshStore = readDesktopFile('src/windows/main/stores/ssh_store.ts');

  assert.match(terminal, /TerminalWorkspaceWindowState/, 'expected terminal page to define a transferable workspace state shape');
  assert.match(terminal, /buildTerminalWorkspaceWindowStateSnapshot/, 'expected terminal page to build a clone-safe plain state snapshot');
  assert.match(terminal, /loadTerminalWorkspaceWindowState/, 'expected terminal page to restore shared state when mounted');
  assert.match(terminal, /persistTerminalWorkspaceWindowState/, 'expected terminal page to persist shared state while active');
  assert.match(terminal, /workspaceWindowApi\?\.getPageState\('terminal'\)/, 'expected terminal page to read shared workspace state through main process');
  assert.match(terminal, /setPageState\('terminal', buildTerminalWorkspaceWindowStateSnapshot\(\)\)/, 'expected terminal page to write a clone-safe shared workspace state snapshot through main process');
  assert.match(terminal, /focusedTerminalPaneKey/, 'expected terminal shared state to preserve active pane');
  assert.match(terminal, /paneOrder/, 'expected terminal shared state to preserve pane order');
  assert.match(terminal, /layoutSizeState/, 'expected terminal shared state to preserve split sizes');
  assert.match(terminal, /refreshTerminalWorkspaceSessions/, 'expected terminal page to refresh session descriptors when returning from detached workspace windows');
  assert.match(terminal, /terminalStore\.refreshSessions\(\)/, 'expected terminal page to refresh local sessions after detached workspace changes');
  assert.match(terminal, /sshStore\.refreshSessions\(\)/, 'expected terminal page to refresh SSH sessions after detached workspace changes');
  assert.match(terminal, /handleWorkspaceWindowStateChanged\(state: WorkspaceDetachedWindowState\)/, 'expected terminal page to handle workspace detached state changes');
  assert.match(terminal, /workspaceWindowApi\?\.onStateChanged\(\(state\)/, 'expected terminal page to listen for workspace detached state changes');
  assert.match(terminalStore, /async function refreshSessions\(\)[\s\S]*?await hydrateSessionBuffers\(sessions\.value\.map\(\(session\) => session\.sessionId\)\)/, 'expected local terminal refresh to hydrate buffers for sessions created in detached workspace windows');
  assert.match(sshStore, /async function refreshSessions\(\)[\s\S]*?await hydrateSessionBuffers\(sessions\.value\.map\(\(session\) => session\.sessionId\)\)/, 'expected SSH refresh to hydrate buffers for sessions created in detached workspace windows');
  assert.match(sshStore, /refreshSessions,/, 'expected SSH store to expose refreshSessions');

  assert.match(ftp, /FtpWorkspaceWindowState/, 'expected FTP page to define a transferable workspace state shape');
  assert.match(ftp, /buildFtpWorkspaceWindowStateSnapshot/, 'expected FTP page to build a clone-safe plain state snapshot');
  assert.match(ftp, /loadFtpWorkspaceWindowState/, 'expected FTP page to restore shared state when mounted');
  assert.match(ftp, /persistFtpWorkspaceWindowState/, 'expected FTP page to persist shared state while active');
  assert.match(ftp, /workspaceWindowApi\?\.getPageState\('ftp'\)/, 'expected FTP page to read shared workspace state through main process');
  assert.match(ftp, /setPageState\('ftp', buildFtpWorkspaceWindowStateSnapshot\(\)\)/, 'expected FTP page to write a clone-safe shared workspace state snapshot through main process');
  assert.match(ftp, /activeBrowserPanel/, 'expected FTP shared state to preserve active panel');
  assert.match(ftp, /ftpWorkspacePanes/, 'expected FTP shared state to preserve workspace panes');
  assert.match(ftp, /ftpLayoutSizeState/, 'expected FTP shared state to preserve split sizes');
}

function testTerminalViewportHandlesAsyncAddonDisposal() {
  const viewport = readDesktopFile('src/windows/main/pages/Terminal/TerminalViewport.vue');

  assert.match(viewport, /function isActiveTerminalInstance\(value: Terminal\)/, 'expected terminal viewport to guard async initialization against stale terminal instances');
  assert.match(viewport, /const nextTerminal = new Terminal/, 'expected terminal viewport to initialize through a local terminal instance');
  assert.match(viewport, /terminal = nextTerminal/, 'expected terminal viewport to publish the local instance after construction');
  assert.match(viewport, /nextTerminal\.loadAddon\(fitAddon\)/, 'expected terminal viewport addon setup to use the local instance');
  assert.match(viewport, /if \(!isActiveTerminalInstance\(nextTerminal\)\) \{\s*return;\s*\}/, 'expected terminal viewport to stop initialization if async addon setup lost the active terminal');
  assert.match(viewport, /nextTerminal\.onData/, 'expected terminal viewport data handler to be registered on the guarded local instance');
  assert.doesNotMatch(viewport, /terminal\.onData/, 'terminal viewport must not call onData through the nullable shared terminal reference');
  assert.match(viewport, /const mountedTerminal = terminal;/, 'expected mounted hook to hold the initialized terminal instance before opening');
  assert.match(viewport, /mountedTerminal\.open\(hostRef\.value\)/, 'expected mounted hook to open the guarded mounted terminal instance');
}

function testNotionLikeWidthIsExpandedSlightly() {
  const blockEditor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue');
  const blockRenderer = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue');

  assert.match(blockEditor, /\.knowledge-block-editor__page \{[\s\S]*?width:\s*min\(100%,\s*840px\)/);
  assert.match(blockRenderer, /max-width:\s*840px/);
  assert.match(blockRenderer, /max-width:\s*calc\(840px - \(var\(--knowledge-block-depth, 0\) \* 20px\)\)/);
}

testWorkspaceWindowContractAndMainHandlers();
testShortcutConfigCoversDetachedPages();
testMainWindowDetachedPlaceholder();
testQuickLaunchCanChooseMainOrDetachedWindow();
testDetachedPagesDoNotNavigateCurrentWindowAcrossRoutes();
testTerminalAndFtpShareWorkspaceWindowPageState();
testTerminalViewportHandlesAsyncAddonDisposal();
testNotionLikeWidthIsExpandedSlightly();

console.log('workspace window checks passed');
