<script setup lang="ts">
import type { SshKnownHost } from '@/contracts/ssh';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';

defineProps<{
  modelValue: boolean;
  linkNavigationEnabled: boolean;
  dualRemoteMode: boolean;
  dualRemoteModeAvailable: boolean;
  dualRemoteSummary: string;
  secondaryRemoteSessionId: string;
  secondaryRemoteSessionOptions: Array<{ label: string; value: string }>;
  thumbnailsEnabled: boolean;
  thumbnailMaxBytesKb: string;
  thumbnailPrefetchLimit: string;
  retryMaxRetries: string;
  retryBaseDelaySecs: string;
  retryPolicySummary: string;
  panelLayoutMode: 'columns' | 'stacked';
  sidebarDockSide: 'left' | 'right';
  sidebarSize: string;
  sidebarDockSummary: string;
  auxiliaryDockSide: 'bottom' | 'right';
  auxiliaryDockSize: string;
  auxiliaryDockSummary: string;
  showSidebarPanel: boolean;
  showLocalPanel: boolean;
  showRemotePanel: boolean;
  showQueuePanel: boolean;
  showLogPanel: boolean;
  panelLayoutSummary: string;
  sidebarSummary: string;
  browserPanelSummary: string;
  queuePanelSummary: string;
  logPanelSummary: string;
  linkNavigationSummary: string;
  thumbnailSummary: string;
  externalEditorPath: string;
  externalEditorSummary: string;
  cleanupExternalDraftsOnClose: boolean;
  knownHosts: SshKnownHost[];
  knownHostSummary: string;
  knownHostsLoading: boolean;
  localEntryCount: number;
  remoteEntryCount: number;
  activeTaskCount: number;
  logEntryCount: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'toggle-link-navigation': [];
  'toggle-dual-remote-mode': [];
  'update:secondaryRemoteSessionId': [value: string];
  'toggle-thumbnails': [];
  'update:thumbnailMaxBytesKb': [value: string];
  'update:thumbnailPrefetchLimit': [value: string];
  'update:retryMaxRetries': [value: string];
  'update:retryBaseDelaySecs': [value: string];
  'apply-retry-policy': [];
  'set-panel-layout-mode': [value: 'columns' | 'stacked'];
  'set-sidebar-dock-side': [value: 'left' | 'right'];
  'update:sidebarSize': [value: string];
  'set-auxiliary-dock-side': [value: 'bottom' | 'right'];
  'update:auxiliaryDockSize': [value: string];
  'toggle-sidebar-panel': [];
  'toggle-local-panel': [];
  'toggle-remote-panel': [];
  'toggle-queue-panel': [];
  'toggle-log-panel': [];
  'pick-external-editor': [];
  'clear-external-editor': [];
  'toggle-cleanup-external-drafts': [];
  'refresh-known-hosts': [];
  'delete-known-host': [id: string];
}>();

function closeDrawer() {
  emit('update:modelValue', false);
}
</script>

<template>
  <Transition name="ftp-inline-fade">
    <div v-if="modelValue" class="ftp-inline-overlay ftp-inline-overlay--drawer" @click="closeDrawer">
      <Transition name="ftp-inline-slide-right">
        <aside v-if="modelValue" class="ftp-settings-inline-drawer ftp-inner-card" @click.stop>
          <div class="ftp-settings-drawer__header">
            <div class="ftp-settings-drawer__header-copy">
              <div class="ftp-settings-drawer__eyebrow">传输页面</div>
              <div class="ftp-settings-drawer__title">传输设置</div>
              <div class="ftp-settings-drawer__hint">只在当前主内容区打开，不再覆盖应用顶栏和底栏。</div>
            </div>
            <UiIconButton
              size="sm"
              variant="ghost"
              title="关闭传输设置"
              aria-label="关闭传输设置"
              @click="closeDrawer"
            >
              ✕
            </UiIconButton>
          </div>

          <UiScrollbar class="ftp-settings-inline-drawer__scroll" :x="false" :size="6">
            <div class="ftp-settings-drawer">
              <section class="ftp-settings-drawer__section">
                <div class="ftp-settings-drawer__section-title">页面行为</div>
                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">联动导航</div>
                    <div class="ftp-settings-drawer__option-desc">切换目录时同步本地与远程浏览节奏，便于双栏对照处理。</div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="linkNavigationEnabled" @click="emit('toggle-link-navigation')">
                    {{ linkNavigationEnabled ? '关闭联动' : '开启联动' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': linkNavigationEnabled }">{{ linkNavigationSummary }}</span>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">并行标签组</div>
                    <div class="ftp-settings-drawer__option-desc">保留主工作区的同时展示第二个远程标签组，支持两个会话组并行浏览。</div>
                  </div>
                  <UiButton
                    size="sm"
                    variant="secondary"
                    :active="dualRemoteMode"
                    :disabled="!dualRemoteModeAvailable"
                    @click="emit('toggle-dual-remote-mode')"
                  >
                    {{ dualRemoteMode ? '关闭并行组' : '开启并行组' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': dualRemoteMode }">{{ dualRemoteSummary }}</span>
                </div>

                <div v-if="dualRemoteMode" class="ftp-settings-drawer__option ftp-settings-drawer__option--stacked">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">第二标签组焦点会话</div>
                    <div class="ftp-settings-drawer__option-desc">选择第二标签组当前要展示的远程会话；更多会话可通过标签右键移入该组。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions ftp-settings-drawer__option-actions--inputs">
                    <UiSelect
                      :model-value="secondaryRemoteSessionId"
                      :options="secondaryRemoteSessionOptions"
                      @change="emit('update:secondaryRemoteSessionId', String($event))"
                    />
                  </div>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">图片缩略图</div>
                    <div class="ftp-settings-drawer__option-desc">控制文件列表中的图片预览加载，适合在大目录或低带宽下快速切换。</div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="thumbnailsEnabled" @click="emit('toggle-thumbnails')">
                    {{ thumbnailsEnabled ? '关闭缩略图' : '开启缩略图' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': thumbnailsEnabled }">{{ thumbnailSummary }}</span>
                </div>
                <div class="ftp-settings-drawer__option ftp-settings-drawer__option--stacked">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">缩略图带宽控制</div>
                    <div class="ftp-settings-drawer__option-desc">限制单张预览最大读取体积，并控制每侧目录预加载的图片数量，避免大目录拖慢浏览。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions ftp-settings-drawer__option-actions--inputs">
                    <UiInput
                      :model-value="thumbnailMaxBytesKb"
                      placeholder="单张最大 KB"
                      @update:modelValue="emit('update:thumbnailMaxBytesKb', String($event))"
                    />
                    <UiInput
                      :model-value="thumbnailPrefetchLimit"
                      placeholder="每侧预加载数量"
                      @update:modelValue="emit('update:thumbnailPrefetchLimit', String($event))"
                    />
                  </div>
                </div>
              </section>

              <section class="ftp-settings-drawer__section">
                <div class="ftp-settings-drawer__section-title">布局与面板</div>
                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">工作区拆分</div>
                    <div class="ftp-settings-drawer__option-desc">在水平双栏和纵向堆叠之间切换，适应多窗口或窄屏场景。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions">
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :active="panelLayoutMode === 'columns'"
                      @click="emit('set-panel-layout-mode', 'columns')"
                    >
                      水平双栏
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :active="panelLayoutMode === 'stacked'"
                      @click="emit('set-panel-layout-mode', 'stacked')"
                    >
                      纵向堆叠
                    </UiButton>
                  </div>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge ftp-badge--accent">{{ panelLayoutSummary }}</span>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">会话侧栏停靠</div>
                    <div class="ftp-settings-drawer__option-desc">控制会话树停靠在主内容区左侧或右侧，并可调整侧栏宽度。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions">
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :active="sidebarDockSide === 'left'"
                      @click="emit('set-sidebar-dock-side', 'left')"
                    >
                      停靠左侧
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :active="sidebarDockSide === 'right'"
                      @click="emit('set-sidebar-dock-side', 'right')"
                    >
                      停靠右侧
                    </UiButton>
                  </div>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge">{{ sidebarDockSummary }}</span>
                </div>
                <div class="ftp-settings-drawer__option ftp-settings-drawer__option--stacked">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">侧栏宽度</div>
                    <div class="ftp-settings-drawer__option-desc">输入 220 到 420 之间的像素值，调整会话树面板宽度。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions ftp-settings-drawer__option-actions--inputs">
                    <UiInput
                      :model-value="sidebarSize"
                      placeholder="侧栏宽度 px"
                      @update:modelValue="emit('update:sidebarSize', String($event))"
                    />
                  </div>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">会话侧栏</div>
                    <div class="ftp-settings-drawer__option-desc">隐藏后保留工作区和会话标签，适合专注处理当前连接。</div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="showSidebarPanel" @click="emit('toggle-sidebar-panel')">
                    {{ showSidebarPanel ? '隐藏侧栏' : '显示侧栏' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': showSidebarPanel }">{{ sidebarSummary }}</span>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">本地文件面板</div>
                    <div class="ftp-settings-drawer__option-desc">
                      {{ dualRemoteMode ? '并行标签组开启后，本地面板仍会保留，便于同时处理本地和两个远程工作区。' : '可单独隐藏本地面板，仅保留远程视图进行浏览或编辑。' }}
                    </div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="showLocalPanel" @click="emit('toggle-local-panel')">
                    {{ showLocalPanel ? '隐藏本地' : '显示本地' }}
                  </UiButton>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">远程文件面板</div>
                    <div class="ftp-settings-drawer__option-desc">可单独隐藏远程面板，保留本地整理或准备上传的工作区。</div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="showRemotePanel" @click="emit('toggle-remote-panel')">
                    {{ showRemotePanel ? '隐藏远程' : '显示远程' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': showLocalPanel || showRemotePanel }">{{ browserPanelSummary }}</span>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">传输队列面板</div>
                    <div class="ftp-settings-drawer__option-desc">可隐藏底部任务面板，只在需要查看明细时再展开。</div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="showQueuePanel" @click="emit('toggle-queue-panel')">
                    {{ showQueuePanel ? '隐藏队列' : '显示队列' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': showQueuePanel }">{{ queuePanelSummary }}</span>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">辅助停靠区</div>
                    <div class="ftp-settings-drawer__option-desc">传输队列和日志面板可停靠在底部或右侧，共享同一个辅助区域。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions">
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :active="auxiliaryDockSide === 'bottom'"
                      @click="emit('set-auxiliary-dock-side', 'bottom')"
                    >
                      底部停靠
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :active="auxiliaryDockSide === 'right'"
                      @click="emit('set-auxiliary-dock-side', 'right')"
                    >
                      右侧停靠
                    </UiButton>
                  </div>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge">{{ auxiliaryDockSummary }}</span>
                </div>
                <div class="ftp-settings-drawer__option ftp-settings-drawer__option--stacked">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">辅助停靠区尺寸</div>
                    <div class="ftp-settings-drawer__option-desc">底部停靠时表示高度，右侧停靠时表示宽度，范围 180 到 420 像素。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions ftp-settings-drawer__option-actions--inputs">
                    <UiInput
                      :model-value="auxiliaryDockSize"
                      placeholder="停靠区尺寸 px"
                      @update:modelValue="emit('update:auxiliaryDockSize', String($event))"
                    />
                  </div>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">日志面板</div>
                    <div class="ftp-settings-drawer__option-desc">显示最近的连接、队列和同步事件，便于快速查看传输过程。</div>
                  </div>
                  <UiButton size="sm" variant="secondary" :active="showLogPanel" @click="emit('toggle-log-panel')">
                    {{ showLogPanel ? '隐藏日志' : '显示日志' }}
                  </UiButton>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': showLogPanel }">{{ logPanelSummary }}</span>
                </div>
              </section>

              <section class="ftp-settings-drawer__section">
                <div class="ftp-settings-drawer__section-title">自动重试策略</div>
                <div class="ftp-settings-drawer__option ftp-settings-drawer__option--stacked">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">失败重试参数</div>
                    <div class="ftp-settings-drawer__option-desc">控制传输失败后的最大自动重试次数，以及指数退避的基础等待秒数。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions ftp-settings-drawer__option-actions--inputs">
                    <UiInput
                      :model-value="retryMaxRetries"
                      placeholder="最大重试次数"
                      @update:modelValue="emit('update:retryMaxRetries', String($event))"
                    />
                    <UiInput
                      :model-value="retryBaseDelaySecs"
                      placeholder="基础等待秒数"
                      @update:modelValue="emit('update:retryBaseDelaySecs', String($event))"
                    />
                    <UiButton size="sm" variant="secondary" @click="emit('apply-retry-policy')">应用策略</UiButton>
                  </div>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge ftp-badge--accent">{{ retryPolicySummary }}</span>
                </div>
              </section>

              <section class="ftp-settings-drawer__section">
                <div class="ftp-settings-drawer__section-title">外部编辑器</div>
                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">编辑器路径</div>
                    <div class="ftp-settings-drawer__option-desc">可指定 VS Code、Notepad++ 等可执行文件；留空时使用系统默认关联程序。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions">
                    <UiButton size="sm" variant="secondary" @click="emit('pick-external-editor')">选择编辑器</UiButton>
                    <UiButton size="sm" variant="ghost" :disabled="!externalEditorPath" @click="emit('clear-external-editor')">清空路径</UiButton>
                  </div>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge ftp-badge--accent">{{ externalEditorSummary }}</span>
                </div>

                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">编辑器关闭后清理临时文件</div>
                    <div class="ftp-settings-drawer__option-desc">当前在配置了自定义编辑器路径时可自动清理临时草稿文件。</div>
                  </div>
                  <UiButton
                    size="sm"
                    variant="secondary"
                    :active="cleanupExternalDraftsOnClose"
                    @click="emit('toggle-cleanup-external-drafts')"
                  >
                    {{ cleanupExternalDraftsOnClose ? '关闭清理' : '开启清理' }}
                  </UiButton>
                </div>
              </section>

              <section class="ftp-settings-drawer__section">
                <div class="ftp-settings-drawer__section-title">主机密钥</div>
                <div class="ftp-settings-drawer__option">
                  <div class="ftp-settings-drawer__option-copy">
                    <div class="ftp-settings-drawer__option-title">已信任主机指纹</div>
                    <div class="ftp-settings-drawer__option-desc">查看 FTP / SFTP 连接已信任的 SSH 主机密钥，并在需要时删除旧指纹重新确认。</div>
                  </div>
                  <div class="ftp-settings-drawer__option-actions">
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :disabled="knownHostsLoading"
                      @click="emit('refresh-known-hosts')"
                    >
                      {{ knownHostsLoading ? '正在刷新...' : '刷新列表' }}
                    </UiButton>
                  </div>
                </div>
                <div class="ftp-settings-drawer__summary">
                  <span class="ftp-badge" :class="{ 'ftp-badge--accent': knownHosts.length > 0 }">{{ knownHostSummary }}</span>
                </div>

                <div v-if="knownHosts.length" class="ftp-settings-drawer__known-hosts">
                  <div v-for="host in knownHosts" :key="host.id" class="ftp-settings-drawer__known-host">
                    <div class="ftp-settings-drawer__known-host-main">
                      <div class="ftp-settings-drawer__known-host-title">{{ host.host }}:{{ host.port }}</div>
                      <div class="ftp-settings-drawer__known-host-meta">
                        算法 {{ host.algorithm }} · {{ host.trustMode === 'session' ? '仅本次会话信任' : '永久信任' }}
                      </div>
                      <div class="ftp-settings-drawer__known-host-fingerprint">{{ host.fingerprint }}</div>
                    </div>
                    <UiButton size="sm" variant="danger" @click="emit('delete-known-host', host.id)">
                      删除
                    </UiButton>
                  </div>
                </div>
                <div v-else class="ftp-settings-drawer__empty">
                  当前还没有已信任的主机指纹。
                </div>
              </section>

              <section class="ftp-settings-drawer__section ftp-settings-drawer__section--compact">
                <div class="ftp-settings-drawer__section-title">当前概览</div>
                <div class="ftp-settings-drawer__overview">
                  <div class="ftp-settings-drawer__overview-item">
                    <span>本地条目</span>
                    <strong>{{ localEntryCount }}</strong>
                  </div>
                  <div class="ftp-settings-drawer__overview-item">
                    <span>远程条目</span>
                    <strong>{{ remoteEntryCount }}</strong>
                  </div>
                  <div class="ftp-settings-drawer__overview-item">
                    <span>队列活动</span>
                    <strong>{{ activeTaskCount }}</strong>
                  </div>
                  <div class="ftp-settings-drawer__overview-item">
                    <span>日志条目</span>
                    <strong>{{ logEntryCount }}</strong>
                  </div>
                </div>
              </section>
            </div>
          </UiScrollbar>

          <div class="ftp-settings-drawer__footer">
            <UiButton variant="ghost" @click="closeDrawer">关闭</UiButton>
          </div>
        </aside>
      </Transition>
    </div>
  </Transition>
</template>
