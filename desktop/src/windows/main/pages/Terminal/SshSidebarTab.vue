<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { SshProfile, SshSessionDescriptor } from '@/contracts/ssh';

const emit = defineEmits<{
  /** User wants to open the profile edit dialog */
  editProfile: [profile: SshProfile | null];
  /** User wants to open the key manager */
  openKeyManager: [];
  /** User wants to connect to a profile */
  connect: [profile: SshProfile];
  /** User switched to an already active session */
  focusSession: [session: SshSessionDescriptor];
  /** User requested disconnect */
  disconnect: [sessionId: string];
}>();

const sshStore = useSshStore();

const searchQuery = ref('');

const filteredProfiles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return sshStore.profiles;
  return sshStore.profiles.filter(
    (p) =>
      p.label.toLowerCase().includes(q) ||
      p.host.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q),
  );
});

function statusColor(status: string) {
  if (status === 'connected') return 'ssh-dot--connected';
  if (status === 'connecting') return 'ssh-dot--connecting';
  return 'ssh-dot--idle';
}

function profileSessionId(profileId: string): string | null {
  return sshStore.sessions.find((s) => s.profileId === profileId)?.sessionId ?? null;
}

function isSessionActive(sessionId: string) {
  return sshStore.activeSshSessionId === sessionId;
}
</script>

<template>
  <div class="ssh-tab">
    <!-- Active sessions section -->
    <template v-if="sshStore.sessions.length > 0">
      <div class="ssh-tab__section-label">活跃连接</div>
      <div
        v-for="session in sshStore.sessions"
        :key="session.sessionId"
        class="ssh-session-item"
        :class="{ 'ssh-session-item--active': isSessionActive(session.sessionId) }"
        role="button"
        tabindex="0"
        @click="emit('focusSession', session)"
        @keydown.enter="emit('focusSession', session)"
      >
        <div class="ssh-session-item__left">
          <span class="ssh-dot" :class="statusColor(session.status)" />
          <span class="ssh-session-item__label">{{ session.profileLabel }}</span>
        </div>
        <!-- Disconnect button -->
        <button class="ssh-session-item__action" title="断开连接"
          @click.stop="emit('disconnect', session.sessionId)">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="ssh-tab__divider" />
    </template>

    <!-- Saved profiles section -->
    <div class="ssh-tab__section-header">
      <span class="ssh-tab__section-label" style="margin-bottom: 0">已保存配置</span>
      <div class="ssh-tab__actions">
        <button class="ssh-add-btn" title="SSH 密钥管理" @click="emit('openKeyManager')">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 2l-2 2" />
            <path d="M7.5 7.5L3 12l4 4 4.5-4.5" />
            <path d="M14 4a4 4 0 1 1-5.65 5.65L13 5" />
            <path d="M5 17l2 2" />
          </svg>
        </button>
        <button class="ssh-add-btn" title="添加 SSH 配置" @click="emit('editProfile', null)">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Search bar (only when there's content) -->
    <div v-if="sshStore.profiles.length > 3" class="ssh-search">
      <svg class="ssh-search__icon" viewBox="0 0 24 24" width="13" height="13"
        stroke="currentColor" stroke-width="2" fill="none">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input v-model="searchQuery" class="ssh-search__input" placeholder="搜索配置..." />
    </div>

    <!-- Profile list -->
    <template v-if="filteredProfiles.length > 0">
      <div
        v-for="profile in filteredProfiles"
        :key="profile.id"
        class="ssh-profile-item"
        :class="{ 'ssh-profile-item--connected': profileSessionId(profile.id) !== null }"
      >
        <button class="ssh-profile-item__connect" @click="emit('connect', profile)">
          <div class="ssh-profile-item__info">
            <!-- Color indicator -->
            <span
              v-if="profile.color"
              class="ssh-profile-item__color"
              :style="{ background: profile.color }"
            />
            <div class="ssh-profile-item__text">
              <span class="ssh-profile-item__label">{{ profile.label }}</span>
              <span class="ssh-profile-item__host">{{ profile.username }}@{{ profile.host }}:{{ profile.port }}</span>
            </div>
          </div>
          <!-- SSH icon -->
          <svg class="ssh-profile-item__ssh-icon" viewBox="0 0 24 24" width="14" height="14"
            stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"
            stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
        <!-- Edit button -->
        <button class="ssh-profile-item__edit" title="编辑配置" @click="emit('editProfile', profile)">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else-if="sshStore.profiles.length === 0" class="ssh-empty">
      <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5"
        fill="none" stroke-linecap="round" stroke-linejoin="round" class="ssh-empty__icon">
        <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
        <path d="M9 9l2 2-2 2M13 15h3" />
      </svg>
      <p class="ssh-empty__text">暂无 SSH 配置</p>
      <button class="ssh-empty__btn" @click="emit('editProfile', null)">添加第一个配置</button>
    </div>
    <div v-else class="ssh-no-results">未找到匹配的配置</div>
  </div>
</template>

<style lang="scss" scoped>
.ssh-tab {
  --ssh-sidebar-item-radius: var(--ui-radius-sm);

  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  gap: 4px;
  min-height: 0;
}

.ssh-tab__section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding: 4px 8px 6px;
  margin-bottom: 2px;
}

.ssh-tab__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 4px 8px;
}

.ssh-tab__actions {
  display: flex;
  gap: 6px;
}

.ssh-tab__divider {
  height: 1px;
  background: var(--ui-border-subtle);
  margin: 6px 4px;
}

// ── Add button ────────────────────────────────────────────────

.ssh-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.18s;

  &:hover {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    border-color: var(--ui-border-accent-soft);
  }
}

// ── Search ────────────────────────────────────────────────────

.ssh-search {
  position: relative;
  margin: 2px 4px 6px;

  &__icon {
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ui-text-muted);
    pointer-events: none;
  }

  &__input {
    width: 100%;
    padding: 5px 10px 5px 28px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface-overlay);
    color: var(--ui-text-primary);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.18s;

    &:focus {
      border-color: var(--ui-border-accent-soft);
    }

    &::placeholder {
      color: var(--ui-text-subtle);
    }
  }
}

// ── Active sessions ───────────────────────────────────────────

.ssh-session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--ssh-sidebar-item-radius);
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: all 0.18s;

  &:hover {
    background: var(--ui-button-ghost-hover-bg);

    .ssh-session-item__action {
      opacity: 1;
    }
  }

  &--active {
    background: var(--ui-tabs-active-bg);
    border-color: var(--ui-border-accent-soft);
    color: var(--ui-text-primary);
  }

  &__left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__label {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__action {
    opacity: 0;
    padding: 2px;
    border: none;
    background: transparent;
    color: var(--ui-text-muted);
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    transition: all 0.15s;
    flex-shrink: 0;

    &:hover {
      background: var(--ui-state-error-subtle);
      color: var(--ui-state-error);
    }
  }
}

// ── Status dot ────────────────────────────────────────────────

.ssh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &--connected {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
    animation: ssh-pulse 2s ease-in-out infinite;
  }

  &--connecting {
    background: #f59e0b;
    animation: ssh-pulse 0.8s ease-in-out infinite;
  }

  &--idle {
    background: var(--ui-text-subtle);
  }
}

@keyframes ssh-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

// ── Saved profiles ────────────────────────────────────────────

.ssh-profile-item {
  display: flex;
  align-items: stretch;
  border: 1px solid transparent;
  border-radius: var(--ssh-sidebar-item-radius);
  background: color-mix(in srgb, var(--ui-tabs-active-bg) 58%, transparent);
  overflow: hidden;
  transition: all 0.18s;

  &:hover {
    background: color-mix(in srgb, var(--ui-button-ghost-hover-bg) 72%, var(--ui-tabs-active-bg));
    border-color: var(--ui-border-accent-soft);

    .ssh-profile-item__edit {
      opacity: 1;
    }
  }

  &--connected {
    border-color: rgba(34, 197, 94, 0.2);
    background: rgba(34, 197, 94, 0.04);
  }

  &__connect {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    padding: 8px 8px 8px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    min-width: 0;
    text-align: left;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__color {
    width: 6px;
    height: 28px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__label {
    font-size: 12px;
    font-weight: 600;
    color: var(--ui-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__host {
    font-size: 11px;
    color: var(--ui-text-muted);
    font-family: Consolas, 'Cascadia Mono', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__ssh-icon {
    color: var(--ui-text-subtle);
    flex-shrink: 0;
  }

  &__edit {
    opacity: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border: none;
    border-left: 1px solid var(--ui-border-subtle);
    background: transparent;
    color: var(--ui-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;

    &:hover {
      background: var(--ui-surface-overlay);
      color: var(--ui-text-primary);
    }
  }
}

// ── Empty state ───────────────────────────────────────────────

.ssh-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--ui-text-muted);
  text-align: center;

  &__icon {
    opacity: 0.4;
  }

  &__text {
    font-size: 12px;
    margin: 0;
  }

  &__btn {
    font-size: 12px;
    padding: 6px 14px;
    border: 1px solid var(--ui-border-accent-soft);
    border-radius: var(--ui-radius-md);
    background: transparent;
    color: var(--primary-color);
    cursor: pointer;
    transition: all 0.18s;

    &:hover {
      background: var(--ui-tabs-active-bg);
    }
  }
}

.ssh-no-results {
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-subtle);
  padding: 16px;
}
</style>
