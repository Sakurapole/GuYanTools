<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiTree from '@/windows/main/components/ui/UiTree.vue';
import type { FtpConnectionDescriptor, FtpProfile } from '@/contracts/ftp';
import type { UiTreeDropPayload, UiTreeEventPayload } from '@/windows/main/components/ui/ui_tree';
import type { ConfigTreeNode } from '../types';

defineProps<{
  sidebarCollapsed: boolean;
  profilesCount: number;
  sessionsCount: number;
  configTreeNodes: ConfigTreeNode[];
  selectedConfigTreeNodeId: string;
  configTreeExpandedIds: string[];
  /** 全部活动连接（保持原顺序） */
  sessions: FtpConnectionDescriptor[];
  activeSessionId: string;
  /** 第二标签组中的 profileId 集合，用于分组渲染 */
  secondaryTabGroupProfileIds: string[];
  /** 双远端模式是否开启 */
  dualRemoteMode: boolean;
  /** 第二标签组当前激活的 sessionId */
  secondaryRemoteSessionId: string;
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
  'open-create-dialog': [folderId?: string];
  'open-create-folder-dialog': [parentId?: string];
  'open-collapsed-configs-menu': [event: MouseEvent | FocusEvent];
  'update:expandedIds': [value: string[]];
  'select-config': [node: ConfigTreeNode];
  'activate-config': [node: ConfigTreeNode];
  'contextmenu-config': [payload: UiTreeEventPayload];
  'drop-config': [payload: UiTreeDropPayload];
  /** 主标签组连接点击（focusSession） */
  'focus-session': [sessionId: string];
  /** 第二标签组连接点击（setSecondaryRemoteSession） */
  'focus-secondary-session': [sessionId: string];
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
  <aside class="ftp-sidebar" :class="{ 'ftp-sidebar--collapsed': sidebarCollapsed }">
    <UiScrollbar class="ftp-sidebar__scroll" :x="false" :size="6">
      <div class="ftp-sidebar__scroll-content">
        <section class="ftp-sidebar__brand">
          <div class="ftp-brand__header">
            <div class="ftp-brand">
              <div class="ftp-brand__icon">FT</div>
              <div v-if="!sidebarCollapsed" class="ftp-brand__copy">
                <div class="ftp-sidebar__title">文件传输</div>
                <div class="ftp-sidebar__subtitle">SFTP Workspace</div>
              </div>
            </div>
            <UiIconButton
              size="sm"
              variant="ghost"
              class="ftp-sidebar__collapse"
              :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
              @click="emit('toggle-sidebar')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" :class="{ 'ftp-sidebar__collapse-icon--collapsed': sidebarCollapsed }">
                <path d="M10.5 3.5L5.5 8l5 4.5" />
              </svg>
            </UiIconButton>
          </div>
          <div v-if="!sidebarCollapsed" class="ftp-brand__chips">
            <span class="ftp-badge ftp-badge--accent">{{ profilesCount }} 个配置</span>
            <span class="ftp-badge">{{ sessionsCount }} 个连接</span>
          </div>
          <div class="ftp-brand__actions" :class="{ 'ftp-brand__actions--compact': sidebarCollapsed }">
            <template v-if="sidebarCollapsed">
              <UiIconButton size="sm" variant="secondary" title="新建连接" @click="emit('open-create-dialog')">
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
            </template>
            <template v-else>
              <UiButton size="sm" block variant="primary" @click="emit('open-create-dialog')">新建连接</UiButton>
              <UiButton size="sm" block variant="secondary" @click="emit('open-create-folder-dialog')">新建分组</UiButton>
            </template>
          </div>
        </section>

        <section class="ftp-sidebar__section ftp-sidebar__section--tree">
          <div v-if="!sidebarCollapsed" class="ftp-sidebar__section-title-row">
            <div class="ftp-sidebar__section-title">已保存服务器</div>
            <span class="ftp-badge">{{ profilesCount }}</span>
          </div>
          <button
            v-if="sidebarCollapsed"
            class="ftp-sidebar__collapsed-configs"
            type="button"
            title="已保存配置"
            @mouseenter="emit('open-collapsed-configs-menu', $event)"
            @focus="emit('open-collapsed-configs-menu', $event)"
            @click="emit('open-collapsed-configs-menu', $event)"
          >
            <span class="ftp-sidebar__collapsed-configs-icon">CFG</span>
            <span class="ftp-sidebar__collapsed-configs-badge">{{ profilesCount }}</span>
          </button>
          <UiTree
            v-else
            class="ftp-config-tree"
            :nodes="configTreeNodes"
            :selected-id="selectedConfigTreeNodeId"
            :expanded-ids="configTreeExpandedIds"
            empty-text="还没有传输配置，先创建一个 SFTP 会话。"
            @update:expandedIds="emit('update:expandedIds', $event)"
            @select="emit('select-config', $event as ConfigTreeNode)"
            @activate="emit('activate-config', $event as ConfigTreeNode)"
            @contextmenu="emit('contextmenu-config', $event)"
            @drop="emit('drop-config', $event)"
          />
        </section>

        <!-- 活动连接：非双端模式，展示为扁平列表 -->
        <section v-if="!dualRemoteMode" class="ftp-sidebar__section">
          <div v-if="!sidebarCollapsed" class="ftp-sidebar__section-title-row">
            <div class="ftp-sidebar__section-title">活动连接</div>
            <span class="ftp-badge ftp-badge--accent">{{ sessionsCount }}</span>
          </div>
          <div class="ftp-session-list">
            <div
              v-for="session in sessions"
              :key="session.sessionId"
              class="ftp-session-item"
              :class="{ 'ftp-session-item--active': session.sessionId === activeSessionId }"
              :title="`${session.profileLabel} · ${sessionStatusLabel(session.status)}`"
              role="button"
              tabindex="0"
              draggable="true"
              @click="emit('focus-session', session.sessionId)"
              @keydown.enter.prevent="emit('focus-session', session.sessionId)"
              @keydown.space.prevent="emit('focus-session', session.sessionId)"
              @contextmenu.prevent="emit('session-contextmenu', { event: $event, sessionId: session.sessionId })"
              @dragstart="emit('session-dragstart', session.sessionId)"
              @dragover.prevent
              @drop.prevent="emit('session-drop', session.sessionId)"
            >
              <div class="ftp-session-item__select">
                <span class="ftp-session-item__status-dot" :class="`ftp-session-item__status-dot--${sessionStatusTone(session.status)}`" />
                <span v-if="!sidebarCollapsed" class="ftp-session-item__title">{{ session.profileLabel }}</span>
              </div>
              <UiIconButton size="sm" variant="danger" title="断开连接" @click.stop="emit('disconnect-session', session.sessionId)">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5 5l6 6" />
                  <path d="M11 5l-6 6" />
                </svg>
              </UiIconButton>
            </div>
            <div v-if="!sessions.length && !sidebarCollapsed" class="ftp-empty-state">当前没有活动连接。</div>
          </div>
        </section>

        <!-- 活动连接：双端模式，分主/第二标签组显示 -->
        <template v-else>
          <!-- 主标签组 -->
          <section class="ftp-sidebar__section">
            <div v-if="!sidebarCollapsed" class="ftp-sidebar__section-title-row">
              <div class="ftp-sidebar__section-title">主标签组</div>
              <span class="ftp-badge ftp-badge--accent">
                {{ sessions.filter(s => !secondaryTabGroupProfileIds.includes(s.profileId)).length }}
              </span>
            </div>
            <div class="ftp-session-list">
              <div
                v-for="session in sessions.filter(s => !secondaryTabGroupProfileIds.includes(s.profileId))"
                :key="session.sessionId"
                class="ftp-session-item"
                :class="{ 'ftp-session-item--active': session.sessionId === activeSessionId }"
                :title="`${session.profileLabel} · ${sessionStatusLabel(session.status)}`"
                role="button"
                tabindex="0"
                draggable="true"
                @click="emit('focus-session', session.sessionId)"
                @keydown.enter.prevent="emit('focus-session', session.sessionId)"
                @keydown.space.prevent="emit('focus-session', session.sessionId)"
                @contextmenu.prevent="emit('session-contextmenu', { event: $event, sessionId: session.sessionId })"
                @dragstart="emit('session-dragstart', session.sessionId)"
                @dragover.prevent
                @drop.prevent="emit('session-drop', session.sessionId)"
              >
                <div class="ftp-session-item__select">
                  <span class="ftp-session-item__status-dot" :class="`ftp-session-item__status-dot--${sessionStatusTone(session.status)}`" />
                  <span v-if="!sidebarCollapsed" class="ftp-session-item__title">{{ session.profileLabel }}</span>
                </div>
                <UiIconButton size="sm" variant="danger" title="断开连接" @click.stop="emit('disconnect-session', session.sessionId)">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M5 5l6 6" />
                    <path d="M11 5l-6 6" />
                  </svg>
                </UiIconButton>
              </div>
              <div
                v-if="!sessions.filter(s => !secondaryTabGroupProfileIds.includes(s.profileId)).length && !sidebarCollapsed"
                class="ftp-empty-state"
              >
                主标签组为空。
              </div>
            </div>
          </section>

          <!-- 第二标签组 -->
          <section class="ftp-sidebar__section">
            <div v-if="!sidebarCollapsed" class="ftp-sidebar__section-title-row">
              <div class="ftp-sidebar__section-title">第二标签组</div>
              <span class="ftp-badge">
                {{ sessions.filter(s => secondaryTabGroupProfileIds.includes(s.profileId)).length }}
              </span>
            </div>
            <div class="ftp-session-list">
              <div
                v-for="session in sessions.filter(s => secondaryTabGroupProfileIds.includes(s.profileId))"
                :key="session.sessionId"
                class="ftp-session-item"
                :class="{ 'ftp-session-item--active': session.sessionId === secondaryRemoteSessionId }"
                :title="`${session.profileLabel} · ${sessionStatusLabel(session.status)} · 第二标签组`"
                role="button"
                tabindex="0"
                draggable="true"
                @click="emit('focus-secondary-session', session.sessionId)"
                @keydown.enter.prevent="emit('focus-secondary-session', session.sessionId)"
                @keydown.space.prevent="emit('focus-secondary-session', session.sessionId)"
                @contextmenu.prevent="emit('session-contextmenu', { event: $event, sessionId: session.sessionId })"
                @dragstart="emit('session-dragstart', session.sessionId)"
                @dragover.prevent
                @drop.prevent="emit('session-drop', session.sessionId)"
              >
                <div class="ftp-session-item__select">
                  <span class="ftp-session-item__status-dot" :class="`ftp-session-item__status-dot--${sessionStatusTone(session.status)}`" />
                  <span v-if="!sidebarCollapsed" class="ftp-session-item__title">{{ session.profileLabel }}</span>
                </div>
                <UiIconButton size="sm" variant="danger" title="断开连接" @click.stop="emit('disconnect-session', session.sessionId)">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M5 5l6 6" />
                    <path d="M11 5l-6 6" />
                  </svg>
                </UiIconButton>
              </div>
              <div
                v-if="!sessions.filter(s => secondaryTabGroupProfileIds.includes(s.profileId)).length && !sidebarCollapsed"
                class="ftp-empty-state"
              >
                右键连接可移入第二标签组。
              </div>
            </div>
          </section>
        </template>

        <section v-if="!sidebarCollapsed && restoreFailureProfiles.length" class="ftp-sidebar__section ftp-sidebar__section--warning">
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
              <UiButton size="sm" variant="secondary" @click="item.profile && emit('reconnect-profile', item.profile)">重连</UiButton>
            </div>
          </div>
        </section>
      </div>
    </UiScrollbar>
  </aside>
</template>
