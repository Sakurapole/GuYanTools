<script setup lang="ts">
import type { ModelDefinition, ModelConfiguration } from '../../model_catalog';
import type { Environment } from '../../types/image-workbench';

type BackendOption = { value: string; label: string; detail: string; available: boolean };
const props = defineProps<{
  selectedModel: ModelDefinition;
  configuration: ModelConfiguration;
  selectedBackend: BackendOption;
  backend: string;
  backendOptions: readonly BackendOption[];
  taskType: string;
  canRun: (model: ModelDefinition, task: string, backend: string) => boolean;
  ready: boolean;
  scale: string;
  tile: string;
  halfPrecision: boolean;
  device: string;
  busy: boolean;
  currentJob: boolean;
  handles: { weights: { name?: string } | null; output: { name?: string } | null };
  environmentId: string;
  environmentOptions: Array<{ label: string; value: string }>;
  environmentHint: string;
  environments: Environment[];
  managedEnvironment?: Environment;
  scaleOptions: Array<{ label: string; value: string }>;
  tileOptions: Array<{ label: string; value: string }>;
}>();
const emit = defineEmits<{
  toggle: [];
  models: [];
  backend: [value: string];
  scale: [value: string];
  tile: [value: string];
  half: [checked: boolean];
  pick: [kind: 'weights' | 'output'];
  runtime: [];
  environment: [event: Event];
  refresh: [];
  create: [];
  install: [];
  start: [];
  cancel: [];
}>();
</script>

<template>
  <aside class="workbench-sidebar workbench-sidebar--right">
    <div class="sidebar__head">
      <span class="sidebar__label">处理配置</span
      ><button title="折叠参数" @click="emit('toggle')">›</button>
    </div>
    <div class="right-sidebar__scroll">
      <section class="sidebar-section">
        <div class="section-header">
          <div>
            <span class="section-kicker">MODEL</span>
            <h2>模型</h2>
          </div>
          <gt-badge :tone="selectedModel.runtimeAdapter ? 'info' : 'warning'">{{
            selectedModel.runtimeAdapter ? '已接入适配' : '待接入插件'
          }}</gt-badge>
        </div>
        <div class="model-select">
          <strong>{{ configuration.alias || selectedModel.name }}</strong
          ><span>{{ selectedModel.version }}</span
          ><small>{{ selectedModel.description }}</small>
          <div class="model-tags">
            <em v-for="task in configuration.tasks" :key="task">{{ task }}</em>
          </div>
        </div>
        <gt-button variant="secondary" block size="sm" @gt-click="emit('models')"
          >浏览模型库</gt-button
        >
      </section>
      <section class="sidebar-section">
        <div class="section-header">
          <div>
            <span class="section-kicker">BACKEND</span>
            <h2>运行后端</h2>
          </div>
          <span class="section-meta">{{ selectedBackend.detail }}</span>
        </div>
        <div class="backend-list">
          <button
            v-for="option in backendOptions"
            :key="option.value"
            :disabled="
              busy ||
              currentJob ||
              !option.available ||
              !canRun(selectedModel, taskType, option.value)
            "
            :class="{ selected: backend === option.value }"
            @click="emit('backend', option.value)"
          >
            <span
              ><strong>{{ option.label }}</strong
              ><small>{{ option.detail }}</small></span
            ><i>{{ option.available ? (backend === option.value ? '●' : '○') : '—' }}</i>
          </button>
        </div>
      </section>
      <section v-if="selectedModel.runtimeAdapter" class="sidebar-section">
        <div class="section-header">
          <div>
            <span class="section-kicker">PARAMETERS</span>
            <h2>参数</h2>
          </div>
          <span class="section-meta">{{ ready ? '可开始' : '未就绪' }}</span>
        </div>
        <label class="control-field"
          ><span>超分倍率</span
          ><gt-select
            :value="scale"
            :options="scaleOptions"
            @gt-change="emit('scale', String($event.detail.value))"
          ></gt-select
        ></label>
        <label class="control-field"
          ><span>Tile 模式</span
          ><gt-select
            :value="tile"
            :options="tileOptions"
            @gt-change="emit('tile', String($event.detail.value))"
          ></gt-select
        ></label>
        <div class="toggle-field">
          <gt-checkbox
            label="CUDA 半精度"
            :disabled="device !== 'cuda' || busy || currentJob"
            :checked="halfPrecision"
            @gt-change="emit('half', Boolean($event.detail.checked))"
          ></gt-checkbox
          ><span><small>仅 CUDA 后端可用</small></span>
        </div>
      </section>
      <section v-else class="sidebar-section">
        <h2>模型准备</h2>
        <p class="field-hint">
          {{ selectedModel.name }}
          需要独立模型插件与参数适配。可以先在模型库保存任务/后端配置并获取权重，目前不能提交给
          Real-CUGAN。
        </p>
        <p class="field-hint">{{ selectedModel.resources }}</p>
      </section>
      <section v-if="selectedModel.runtimeAdapter" class="sidebar-section">
        <h2>工作文件</h2>
        <div class="model-file-row">
          <span>{{ handles.weights?.name || '尚未选择 .pth 模型权重' }}</span
          ><gt-button
            size="sm"
            variant="secondary"
            :disabled="busy || currentJob"
            @gt-click="emit('pick', 'weights')"
            >选择权重</gt-button
          >
        </div>
        <div class="model-file-row">
          <span>{{ handles.output?.name || '尚未选择输出目录' }}</span
          ><gt-button
            size="sm"
            variant="secondary"
            :disabled="busy || currentJob"
            @gt-click="emit('pick', 'output')"
            >输出目录</gt-button
          >
        </div>
      </section>
      <section v-if="selectedModel.runtimeAdapter" class="sidebar-section sidebar-section--runtime">
        <gt-button size="sm" variant="primary" @gt-click="emit('runtime')"
          >管理 Python / CUDA / 包</gt-button
        >
        <div class="section-header">
          <div>
            <span class="section-kicker">RUNTIME</span>
            <h2>执行环境</h2>
          </div>
          <span class="live-dot"></span>
        </div>
        <label class="control-field"
          ><span>Python / Conda</span
          ><gt-select
            :value="environmentId"
            :options="environmentOptions"
            placeholder="选择基础环境"
            @gt-change="emit('environment', $event)"
          ></gt-select
        ></label>
        <p class="field-hint">{{ environmentHint }}</p>
        <div class="inline-actions">
          <gt-button variant="ghost" size="sm" :disabled="busy" @gt-click="emit('refresh')"
            >检测</gt-button
          ><gt-button
            variant="secondary"
            size="sm"
            :disabled="busy || !environments.length || Boolean(managedEnvironment)"
            @gt-click="emit('create')"
            >创建</gt-button
          >
        </div>
        <gt-button
          variant="secondary"
          block
          size="sm"
          :disabled="busy || !managedEnvironment || currentJob"
          @gt-click="emit('install')"
          >安装 {{ device === 'cuda' ? 'CUDA' : 'CPU' }} 依赖</gt-button
        >
      </section>
      <div class="sidebar-section__actions">
        <gt-button
          variant="primary"
          size="lg"
          block
          :disabled="busy || !ready"
          @gt-click="emit('start')"
          >开始处理</gt-button
        ><gt-button v-if="currentJob" variant="ghost" size="sm" block @gt-click="emit('cancel')"
          >取消任务</gt-button
        >
      </div>
    </div>
  </aside>
</template>
