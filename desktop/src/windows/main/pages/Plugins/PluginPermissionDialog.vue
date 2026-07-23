<script setup lang="ts">
import type { MarketplacePluginSummary, PluginPermission } from '@/contracts/plugin_host';
import UiButton from '../../components/ui/UiButton.vue';

defineProps<{ plugin: MarketplacePluginSummary | null; visible: boolean }>();
const emit = defineEmits<{ confirm: [permissions: PluginPermission[]]; cancel: [] }>();
</script>

<template>
  <div v-if="visible && plugin" class="permission-dialog" role="dialog" aria-modal="true">
    <div class="permission-dialog__panel ui-glass-surface">
      <div class="permission-dialog__header"><h2>确认安装 {{ plugin.name }}</h2><UiButton variant="ghost" aria-label="取消" @click="emit('cancel')">关闭</UiButton></div>
      <p>以下权限会授予宿主原语；capability 只描述插件业务能力，不会自动扩大权限。</p>
      <ul><li v-for="permission in plugin.permissions || []" :key="permission"><code>{{ permission }}</code></li></ul>
      <div class="permission-dialog__actions"><UiButton variant="ghost" @click="emit('cancel')">取消</UiButton><UiButton variant="primary" @click="emit('confirm', plugin.permissions || [])">确认安装</UiButton></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.permission-dialog { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 35%); }
.permission-dialog__panel { width: min(560px, 100%); padding: 22px; }
.permission-dialog__header, .permission-dialog__actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.permission-dialog__actions { justify-content: flex-end; margin-top: 18px; }
ul { max-height: 220px; overflow: auto; padding-left: 22px; }
</style>
