<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PluginPermission } from '@/contracts/plugin_host';
import UiButton from '../../components/ui/UiButton.vue';
import {
  getPermissionCopy,
  getPermissionTier,
  getDefaultApprovedSuggestions,
} from './permission_copy_client';

export interface PermissionDialogPlugin {
  id?: string;
  name?: string;
  displayName?: string;
  permissions?: PluginPermission[];
  manifest?: { id: string; displayName: string; permissions: PluginPermission[] };
}

const props = defineProps<{
  plugin: PermissionDialogPlugin | null;
  visible: boolean;
  mode?: 'install' | 'approve';
}>();
const emit = defineEmits<{ confirm: [permissions: PluginPermission[]]; cancel: [] }>();

const selected = ref<Set<PluginPermission>>(new Set());

const declaredPermissions = computed<PluginPermission[]>(() => {
  if (!props.plugin) return [];
  return props.plugin.manifest?.permissions ?? props.plugin.permissions ?? [];
});

const title = computed(() => {
  const name =
    props.plugin?.manifest?.displayName ??
    props.plugin?.displayName ??
    props.plugin?.name ??
    props.plugin?.id ??
    '插件';
  return props.mode === 'approve' ? `确认权限 ${name}` : `确认安装 ${name}`;
});

watch(
  () => [props.visible, props.plugin],
  () => {
    if (!props.visible) return;
    selected.value = new Set(getDefaultApprovedSuggestions(declaredPermissions.value));
  },
  { immediate: true }
);

function toggle(permission: PluginPermission, checked: boolean) {
  const next = new Set(selected.value);
  if (checked) next.add(permission);
  else next.delete(permission);
  selected.value = next;
}

function confirm() {
  emit('confirm', Array.from(selected.value));
}
</script>

<template>
  <div v-if="visible && plugin" class="permission-dialog" role="dialog" aria-modal="true">
    <div class="permission-dialog__panel ui-glass-surface">
      <div class="permission-dialog__header">
        <h2>{{ title }}</h2>
        <UiButton variant="ghost" aria-label="取消" @click="emit('cancel')">关闭</UiButton>
      </div>
      <p>
        以下权限会授予宿主原语；capability
        只描述插件业务能力，不会自动扩大权限。高风险权限默认不勾选。
      </p>
      <ul class="permission-dialog__list">
        <li
          v-for="permission in declaredPermissions"
          :key="permission"
          class="permission-dialog__item"
        >
          <label class="permission-dialog__label">
            <input
              type="checkbox"
              :checked="selected.has(permission)"
              @change="toggle(permission, ($event.target as HTMLInputElement).checked)"
            />
            <span class="permission-dialog__text">
              <span class="permission-dialog__title">
                {{ getPermissionCopy(permission).title }}
                <em
                  v-if="getPermissionTier(permission) === 'elevated'"
                  class="permission-dialog__badge"
                  >需批准</em
                >
                <em
                  v-else-if="getPermissionTier(permission) === 'builtin'"
                  class="permission-dialog__badge permission-dialog__badge--builtin"
                  >仅内置</em
                >
              </span>
              <code>{{ permission }}</code>
              <span class="permission-dialog__desc">{{
                getPermissionCopy(permission).description
              }}</span>
            </span>
          </label>
        </li>
      </ul>
      <div class="permission-dialog__actions">
        <UiButton variant="ghost" @click="emit('cancel')">取消</UiButton>
        <UiButton variant="primary" @click="confirm">确认</UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.permission-dialog {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 35%);
}
.permission-dialog__panel {
  width: min(560px, 100%);
  padding: 22px;
}
.permission-dialog__header,
.permission-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.permission-dialog__actions {
  justify-content: flex-end;
  margin-top: 18px;
}
.permission-dialog__list {
  max-height: 280px;
  overflow: auto;
  padding: 0;
  margin: 12px 0 0;
  list-style: none;
}
.permission-dialog__item {
  padding: 8px 0;
  border-bottom: 1px solid rgb(128 128 128 / 18%);
}
.permission-dialog__label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  cursor: pointer;
}
.permission-dialog__text {
  display: grid;
  gap: 2px;
}
.permission-dialog__title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.permission-dialog__desc {
  color: var(--ui-text-muted, #888);
  font-size: 0.78rem;
}
.permission-dialog__badge {
  font-style: normal;
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgb(255 170 0 / 18%);
  color: var(--ui-state-warning, #c60);
}
.permission-dialog__badge--builtin {
  background: rgb(255 80 80 / 16%);
  color: var(--ui-state-error, #c33);
}
</style>
