<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PluginAuditEvent, PluginContributionsSummary, PluginPermission, PluginSettingSchema, InstalledPluginRecord } from '@/contracts/plugin_host';
import UiButton from '../../components/ui/UiButton.vue';
import { getPermissionCopy, getPermissionTier } from './permission_copy_client';

export interface PluginDebugInfo {
  record: InstalledPluginRecord;
  audit: PluginAuditEvent[];
  contributions: PluginContributionsSummary;
  capabilities: Array<{ pluginId: string; id: string; qualifiedId: string; kind: string; operations: string[] }>;
  consecutiveStartFailures: number;
}

const props = defineProps<{
  pluginId: string;
  visible: boolean;
}>();
const emit = defineEmits<{ close: [] }>();

const info = ref<PluginDebugInfo | null>(null);
const settings = ref<Record<string, unknown>>({});
const errorMessage = ref('');
const showDeniedOnly = ref(false);

const settingsSchema = computed<Record<string, PluginSettingSchema>>(() => info.value?.record.manifest.settings ?? {});
const pendingPermissions = computed(() => {
  if (!info.value) return [] as PluginPermission[];
  const approved = new Set(info.value.record.approvedPermissions);
  return info.value.record.manifest.permissions.filter(permission => !approved.has(permission));
});
const filteredAudit = computed(() => {
  if (!info.value) return [];
  return showDeniedOnly.value ? info.value.audit.filter(event => event.result === 'denied') : info.value.audit;
});

async function load() {
  if (!window.pluginHostApi || !props.pluginId) return;
  errorMessage.value = '';
  try {
    info.value = await window.pluginHostApi.getPluginDebugInfo(props.pluginId);
    settings.value = await window.pluginHostApi.getPluginSettings(props.pluginId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载调试信息失败';
  }
}

async function saveSetting(key: string, value: unknown) {
  if (!window.pluginHostApi) return;
  try {
    await window.pluginHostApi.setPluginSetting(props.pluginId, key, value);
    settings.value = await window.pluginHostApi.getPluginSettings(props.pluginId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存设置失败';
  }
}

watch(() => [props.visible, props.pluginId], () => {
  if (props.visible) void load();
}, { immediate: true });
</script>

<template>
  <div v-if="visible && info" class="plugin-debug" role="dialog" aria-modal="true">
    <div class="plugin-debug__panel ui-glass-surface">
      <div class="plugin-debug__header">
        <div>
          <h2>调试 · {{ info.record.manifest.displayName }}</h2>
          <p class="plugin-debug__meta">
            <span>{{ info.record.manifest.id }}</span>
            <span>v{{ info.record.manifest.version }}</span>
            <span>{{ info.record.status }}</span>
            <span v-if="info.consecutiveStartFailures">连续失败 {{ info.consecutiveStartFailures }}</span>
            <span :class="info.record.signatureVerified ? 'plugin-debug__ok' : 'plugin-debug__warn'">
              {{ info.record.signatureVerified ? '签名已验证' : (info.record.signatureWarning || (info.record.packageSha256 ? '未签名' : '无签名信息')) }}
            </span>
            <span v-if="info.record.packageSha256">SHA-256 {{ info.record.packageSha256.slice(0, 12) }}…</span>
          </p>
        </div>
        <UiButton variant="ghost" @click="emit('close')">关闭</UiButton>
      </div>

      <p v-if="errorMessage" class="plugin-debug__error">{{ errorMessage }}</p>
      <p v-if="info.record.error" class="plugin-debug__error">最近错误：{{ info.record.error }}</p>

      <section class="plugin-debug__section">
        <h3>权限</h3>
        <ul class="plugin-debug__list">
          <li v-for="permission in info.record.manifest.permissions" :key="permission">
            <span class="plugin-debug__perm-title">{{ getPermissionCopy(permission).title }}</span>
            <code>{{ permission }}</code>
            <em :class="{
              'plugin-debug__badge--elevated': getPermissionTier(permission) === 'elevated',
              'plugin-debug__badge--pending': !info.record.approvedPermissions.includes(permission),
            }">
              {{ getPermissionTier(permission) || 'default' }}
              {{ info.record.approvedPermissions.includes(permission) ? '· 已批准' : '· 未批准' }}
            </em>
          </li>
        </ul>
        <p v-if="pendingPermissions.length" class="plugin-debug__hint">{{ pendingPermissions.length }} 项权限尚未批准，对应 API 调用会被拒绝。</p>
      </section>

      <section class="plugin-debug__section">
        <h3>能力声明</h3>
        <div v-if="info.capabilities.length === 0" class="plugin-debug__empty">未注册业务能力</div>
        <ul v-else class="plugin-debug__list">
          <li v-for="capability in info.capabilities" :key="capability.qualifiedId">
            <strong>{{ capability.qualifiedId }}</strong>
            <span>{{ capability.kind }} · {{ capability.operations.join(', ') }}</span>
          </li>
        </ul>
      </section>

      <section class="plugin-debug__section">
        <h3>贡献点</h3>
        <div class="plugin-debug__grid">
          <span>页面 {{ info.contributions.pages.length }}</span>
          <span>命令 {{ info.contributions.commands.length }}</span>
          <span>组件 {{ info.contributions.widgets.length }}</span>
          <span>菜单 {{ info.contributions.menus.length }}</span>
          <span>快捷键 {{ info.contributions.shortcuts.length }}</span>
          <span>后台任务 {{ info.contributions.backgroundTasks.length }}</span>
        </div>
      </section>

      <section v-if="Object.keys(settingsSchema).length" class="plugin-debug__section">
        <h3>设置</h3>
        <div v-for="(schema, key) in settingsSchema" :key="key" class="plugin-debug__setting">
          <label>
            <span>{{ schema.title }}</span>
            <small v-if="schema.description">{{ schema.description }}</small>
          </label>
          <select
            v-if="schema.type === 'select'"
            :value="String(settings[key] ?? schema.default ?? '')"
            @change="saveSetting(key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in schema.options" :key="String(option.value)" :value="String(option.value)">{{ option.label }}</option>
          </select>
          <input
            v-else-if="schema.type === 'boolean'"
            type="checkbox"
            :checked="Boolean(settings[key] ?? schema.default)"
            @change="saveSetting(key, ($event.target as HTMLInputElement).checked)"
          >
          <input
            v-else-if="schema.type === 'number'"
            type="number"
            :value="Number(settings[key] ?? schema.default ?? 0)"
            @change="saveSetting(key, Number(($event.target as HTMLInputElement).value))"
          >
          <input
            v-else
            type="text"
            :value="String(settings[key] ?? schema.default ?? '')"
            @change="saveSetting(key, ($event.target as HTMLInputElement).value)"
          >
        </div>
      </section>

      <section class="plugin-debug__section">
        <div class="plugin-debug__section-head">
          <h3>最近审计</h3>
          <label class="plugin-debug__toggle">
            <input v-model="showDeniedOnly" type="checkbox"> 仅看拒绝
          </label>
        </div>
        <div v-if="filteredAudit.length === 0" class="plugin-debug__empty">暂无审计事件</div>
        <ul v-else class="plugin-debug__list plugin-debug__list--audit">
          <li v-for="(event, index) in filteredAudit" :key="index">
            <span :class="{ 'plugin-debug__denied': event.result === 'denied' }">{{ event.result }}</span>
            <code>{{ event.operation }}</code>
            <span>{{ event.runtime }}</span>
            <span>{{ event.at }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.plugin-debug { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 40%); }
.plugin-debug__panel { width: min(720px, 100%); max-height: min(80vh, 760px); overflow: auto; padding: 20px 22px; }
.plugin-debug__header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
.plugin-debug__header h2 { margin: 0; font-size: 1.1rem; }
.plugin-debug__meta { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 6px 0 0; color: var(--ui-text-muted); font-size: 0.78rem; }
.plugin-debug__error { margin: 10px 0 0; color: var(--ui-state-danger, #c33); font-size: 0.8rem; }
.plugin-debug__ok { color: var(--ui-state-success, #2f9e64); font-weight: 600; }
.plugin-debug__warn { color: var(--ui-state-warning, #d18a00); font-weight: 600; }
.plugin-debug__section { margin-top: 18px; }
.plugin-debug__section h3 { margin: 0 0 8px; font-size: 0.92rem; }
.plugin-debug__section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.plugin-debug__toggle { display: inline-flex; gap: 6px; align-items: center; color: var(--ui-text-muted); font-size: 0.78rem; }
.plugin-debug__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.plugin-debug__list li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.8rem; color: var(--ui-text-muted); }
.plugin-debug__list code { font-size: 0.74rem; }
.plugin-debug__perm-title { color: var(--ui-text-primary); font-weight: 600; }
.plugin-debug__badge--elevated { color: var(--ui-state-warning, #c60); font-style: normal; }
.plugin-debug__badge--pending { color: var(--ui-state-danger, #c33); font-style: normal; }
.plugin-debug__denied { color: var(--ui-state-danger, #c33); font-weight: 600; }
.plugin-debug__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; color: var(--ui-text-muted); font-size: 0.8rem; }
.plugin-debug__setting { display: grid; grid-template-columns: 1fr 180px; gap: 10px; align-items: center; margin-bottom: 8px; font-size: 0.82rem; }
.plugin-debug__setting small { display: block; color: var(--ui-text-muted); }
.plugin-debug__empty { color: var(--ui-text-muted); font-size: 0.8rem; }
.plugin-debug__hint { margin: 8px 0 0; color: var(--ui-state-warning, #c60); font-size: 0.78rem; }
.plugin-debug__list--audit { max-height: 180px; overflow: auto; }
</style>
