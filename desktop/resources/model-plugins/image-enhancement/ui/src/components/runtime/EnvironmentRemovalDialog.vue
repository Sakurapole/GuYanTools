<script setup lang="ts">
import { useRuntimeEnvironmentContext } from '../../composables/runtime-environment-context';
const r = useRuntimeEnvironmentContext();
</script>

<template>
  <gt-dialog
    :open="r.pendingRemoval"
    @gt-open-change="r.pendingRemoval = Boolean($event.detail.open)"
    ><h3 slot="header">{{ r.writable ? '确认删除受管环境' : '解除外部环境登记' }}</h3>
    <p>{{ r.selected?.label }}</p>
    <code>{{ r.selected?.prefix || r.selected?.pythonPath }}</code>
    <p>
      {{
        r.writable
          ? '将删除该应用环境目录与安装的包；不会删除基础解释器和模型权重。'
          : '只解除本应用登记，保留原目录与包。'
      }}
    </p>
    <div slot="footer" class="runtime-manager__actions">
      <gt-button size="sm" variant="secondary" @gt-click="r.pendingRemoval = false">取消</gt-button
      ><gt-button size="sm" variant="danger" @gt-click="r.removeEnvironment"
        >确认{{ r.writable ? '删除' : '解除登记' }}</gt-button
      >
    </div>
  </gt-dialog>
</template>
