<script setup lang="ts">
import { inject, provide, reactive } from 'vue';
import { pluginNotifierKey } from './notifications';
import {
  useRuntimeEnvironment,
  type RuntimeEnvironmentProps,
  type RuntimeEnvironmentEmit,
} from './composables/useRuntimeEnvironment';
import { runtimeEnvironmentKey } from './composables/runtime-environment-context';
import EnvironmentManagerSelector from './components/runtime/EnvironmentManagerSelector.vue';
import PythonEnvironmentPanel from './components/runtime/PythonEnvironmentPanel.vue';
import PackageManagerPanel from './components/runtime/PackageManagerPanel.vue';
import RuntimeDiagnosticsPanel from './components/runtime/RuntimeDiagnosticsPanel.vue';
import RuntimeJobPanel from './components/runtime/RuntimeJobPanel.vue';
import EnvironmentRemovalDialog from './components/runtime/EnvironmentRemovalDialog.vue';

const props = defineProps<RuntimeEnvironmentProps>();
const emit = defineEmits<RuntimeEnvironmentEmit>();
const runtime = useRuntimeEnvironment(props, emit, inject(pluginNotifierKey));
provide(runtimeEnvironmentKey, reactive(runtime));
const { locked, error, message, refresh } = runtime;
</script>

<template>
  <section class="runtime-manager" aria-label="运行环境管理">
    <header class="runtime-manager__heading">
      <div>
        <h2>运行环境</h2>
        <p>选择一种管理方式，管理环境、依赖与运行设备</p>
      </div>
      <gt-button variant="secondary" size="sm" :disabled="locked" @gt-click="refresh"
        >刷新检测</gt-button
      >
    </header>
    <EnvironmentManagerSelector />
    <p v-if="error" class="runtime-manager__error" role="alert">{{ error }}</p>
    <p v-if="message" class="runtime-manager__message" role="status">{{ message }}</p>
    <RuntimeJobPanel />
    <div class="runtime-manager__grid">
      <PythonEnvironmentPanel @open="emit('open', $event)" />
      <RuntimeDiagnosticsPanel />
    </div>
    <PackageManagerPanel />
    <EnvironmentRemovalDialog />
  </section>
</template>

<style src="./styles/runtime-environment.css"></style>
