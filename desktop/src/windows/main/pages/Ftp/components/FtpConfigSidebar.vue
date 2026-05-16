<script setup lang="ts">
import type { FtpConnectionDescriptor, FtpProfile } from '@/contracts/ftp';
import type { UiTreeDropPayload, UiTreeEventPayload } from '@/windows/main/components/ui/ui_tree';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiTree from '@/windows/main/components/ui/UiTree.vue';
import type { ConfigTreeNode } from '../types';

const props = defineProps<{
  sidebarCollapsed: boolean;
  profilesCount: number;
  sessionsCount: number;
  configTreeNodes: ConfigTreeNode[];
  selectedConfigTreeNodeId: string;
  configTreeExpandedIds: string[];
  /** 全部活动连接（保持原顺序） */
  sessions: FtpConnectionDescriptor[];
  activeSessionId: string;
  restoreFailureProfiles: Array<{
    profileId: string;
    errorMessage: string;
    profile: FtpProfile | null;
  }>;
  sessionStatusLabel: (status: string) => string;
  sessionStatusTone: (status: string) => string;
}>();

const emit = defineEmits<{
  'toggle-sidebar': [];
  'create-local-connection': [];
  'open-create-dialog': [folderId?: string];
  'open-create-folder-dialog': [parentId?: string];
  'open-collapsed-configs-menu': [event: MouseEvent | FocusEvent];
  'update:expandedIds': [value: string[]];
  'select-config': [node: ConfigTreeNode];
  'activate-config': [node: ConfigTreeNode];
  'contextmenu-config': [payload: UiTreeEventPayload];
  'drop-config': [payload: UiTreeDropPayload];
  /** 活动连接点击 */
  'focus-session': [sessionId: string];
  'disconnect-session': [sessionId: string];
  'reconnect-profile': [profile: FtpProfile];
  /** 右键菜单 */
  'session-contextmenu': [payload: { event: MouseEvent; sessionId: string }];
  /** 拖拽开始 */
  'session-dragstart': [sessionId: string];
  /** 拖拽放置 */
  'session-drop': [targetSessionId: string];
}>();
</script>

<template>
  <div class="ftp-sidebar__content">
    <div class="ftp-sidebar__header">
      <button class="ftp-sidebar__menu-icon" type="button" :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
        :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'" @click="emit('toggle-sidebar')">
        <svg v-if="sidebarCollapsed" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"
          stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 4v16" />
          <path d="m15 9-3 3 3 3" />
        </svg>
      </button>

      <div v-show="!sidebarCollapsed" class="ftp-sidebar-tabs">
        <button class="ftp-sidebar-tab ftp-sidebar-tab--active" type="button">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"
            stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          配置
          <span v-if="profilesCount > 0" class="ftp-sidebar-tab__badge">{{ profilesCount }}</span>
        </button>
      </div>
    </div>

    <UiScrollbar class="ftp-sidebar__scroll" :x="false" :size="6">
      <div class="ftp-sidebar__scroll-content">
        <template v-if="sidebarCollapsed">
          <section class="ftp-sidebar__section ftp-sidebar__section--quick">
            <UiIconButton size="sm" variant="ghost" title="新建本地连接" @click="emit('create-local-connection')">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M8 20h8" />
                <path d="M12 18v2" />
              </svg>
            </UiIconButton>
            <UiIconButton size="sm" variant="secondary" title="新建远程连接" @click="emit('open-create-dialog')">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3.5v9" />
                <path d="M3.5 8h9" />
              </svg>
            </UiIconButton>
            <UiIconButton size="sm" variant="ghost" title="新建分组" @click="emit('open-create-folder-dialog')">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 5.5h4l1 1h6v6.5h-11z" />
                <path d="M11.5 2.5v3" />
                <path d="M10 4h3" />
              </svg>
            </UiIconButton>
            <button class="ftp-sidebar__collapsed-configs" type="button" title="已保存配置"
              @mouseenter="emit('open-collapsed-configs-menu', $event)"
              @focus="emit('open-collapsed-configs-menu', $event)" @click="emit('open-collapsed-configs-menu', $event)">
              <span class="ftp-sidebar__collapsed-configs-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </span>
            </button>
          </section>

          <section class="ftp-sidebar__section ftp-sidebar__section--collapsed-sessions">
            <div v-for="session in sessions" :key="session.sessionId" class="ftp-session-item"
              :class="{ 'ftp-session-item--active': session.sessionId === activeSessionId }"
              :title="`${session.profileLabel} · ${sessionStatusLabel(session.status)}`" role="button" tabindex="0"
              @click="emit('focus-session', session.sessionId)"
              @keydown.enter.prevent="emit('focus-session', session.sessionId)"
              @keydown.space.prevent="emit('focus-session', session.sessionId)">
              <div class="ftp-session-item__select">
                <span class="ftp-session-item__status-dot"
                  :class="`ftp-session-item__status-dot--${sessionStatusTone(session.status)}`" />
              </div>
            </div>
            <div v-if="!sessions.length" class="ftp-sidebar__empty-dot" title="没有活动会话" />
          </section>
        </template>

        <template v-else>
          <section class="ftp-sidebar__section ftp-sidebar__section--actions">
            <UiButton size="sm" block variant="secondary" @click="emit('create-local-connection')">新建本地连接</UiButton>
            <UiButton size="sm" block variant="primary" @click="emit('open-create-dialog')">新建远程连接</UiButton>
          </section>

          <section class="ftp-sidebar__section ftp-sidebar__section--actions">
            <UiButton size="sm" block variant="secondary" @click="emit('open-create-folder-dialog')">新建分组</UiButton>
          </section>

          <section class="ftp-sidebar__section ftp-sidebar__section--tree">
            <div v-if="!sidebarCollapsed" class="ftp-sidebar__section-title-row">
              <div class="ftp-sidebar__section-title">已保存服务器</div>
              <span class="ftp-badge">{{ profilesCount }}</span>
            </div>
            <UiTree class="ftp-config-tree" :nodes="configTreeNodes" :selected-id="selectedConfigTreeNodeId"
              :expanded-ids="configTreeExpandedIds" :indent-size="0" empty-text="还没有传输配置，先创建一个 SFTP 会话。"
              @update:expandedIds="emit('update:expandedIds', $event)"
              @select="emit('select-config', $event as ConfigTreeNode)"
              @activate="emit('activate-config', $event as ConfigTreeNode)"
              @contextmenu="emit('contextmenu-config', $event)" @drop="emit('drop-config', $event)" />
          </section>
          <section class="ftp-sidebar__section">
            <div v-if="!sidebarCollapsed" class="ftp-sidebar__section-title-row">
              <div class="ftp-sidebar__section-title">活动会话</div>
              <span class="ftp-badge ftp-badge--accent">{{ sessionsCount }}</span>
            </div>
            <div class="ftp-session-list">
              <div v-for="session in sessions" :key="session.sessionId" class="ftp-session-item"
                :class="{ 'ftp-session-item--active': session.sessionId === activeSessionId }"
                :title="`${session.profileLabel} · ${sessionStatusLabel(session.status)}`" role="button" tabindex="0"
                draggable="true" @click="emit('focus-session', session.sessionId)"
                @keydown.enter.prevent="emit('focus-session', session.sessionId)"
                @keydown.space.prevent="emit('focus-session', session.sessionId)"
                @contextmenu.prevent="emit('session-contextmenu', { event: $event, sessionId: session.sessionId })"
                @dragstart="emit('session-dragstart', session.sessionId)" @dragover.prevent
                @drop.prevent="emit('session-drop', session.sessionId)">
                <div class="ftp-session-item__select">
                  <span class="ftp-session-item__status-dot"
                    :class="`ftp-session-item__status-dot--${sessionStatusTone(session.status)}`" />
                  <span v-if="!sidebarCollapsed" class="ftp-session-item__title">{{ session.profileLabel }}</span>
                </div>
                <UiIconButton v-if="!sidebarCollapsed" size="sm" variant="danger" title="断开连接"
                  @click.stop="emit('disconnect-session', session.sessionId)">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M5 5l6 6" />
                    <path d="M11 5l-6 6" />
                  </svg>
                </UiIconButton>
              </div>
                <div v-if="!sessions.length && !sidebarCollapsed" class="ftp-empty-state">当前没有活动会话。</div>
            </div>
          </section>

          <section v-if="!sidebarCollapsed && restoreFailureProfiles.length"
            class="ftp-sidebar__section ftp-sidebar__section--warning">
            <div class="ftp-sidebar__section-title-row">
              <div class="ftp-sidebar__section-title">恢复失败</div>
              <span class="ftp-badge ftp-badge--danger">{{ restoreFailureProfiles.length }}</span>
            </div>
            <div class="ftp-session-list">
              <div v-for="item in restoreFailureProfiles" :key="item.profileId" class="ftp-restore-item">
                <div class="ftp-session-item__body">
                  <div class="ftp-session-item__title">{{ item.profile?.label }}</div>
                  <div class="ftp-session-item__meta">{{ item.errorMessage }}</div>
                </div>
                <UiButton size="sm" variant="secondary"
                  @click="item.profile && emit('reconnect-profile', item.profile)">重连
                </UiButton>
              </div>
            </div>
          </section>
        </template>
      </div>
    </UiScrollbar>
  </div>
</template>
