<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ModelLibrary from './ModelLibrary.vue';
import RuntimeEnvironment from './RuntimeEnvironment.vue';
import ActivityBar from './components/workbench/ActivityBar.vue';
import ImageInputPreview from './components/workbench/ImageInputPreview.vue';
import ProcessingConfigSidebar from './components/workbench/ProcessingConfigSidebar.vue';
import ResultPreview from './components/workbench/ResultPreview.vue';
import TaskToolbar from './components/workbench/TaskToolbar.vue';
import WorkbenchSidebar from './components/workbench/WorkbenchSidebar.vue';
import type {
  Backend,
  Device,
  Environment,
  HandleKind,
  PluginApi,
  SelectedFile,
  WorkbenchNav,
} from './types/image-workbench';
import type { JobRecord } from '../../../../../src/contracts/plugin_media';
import {
  MODEL_CATALOG,
  TASKS,
  CATALOG_STORAGE_KEY,
  sanitizeConfigurations,
  sanitizeConfiguration,
  resolveSelection,
  canRunModel,
  createCuganOptions,
  taskLabel,
  type ModelConfiguration,
  type ModelConfigurations,
} from './model_catalog';
import { pluginNotifierKey } from './notifications';

const api = (window as Window & { pluginAPI?: PluginApi }).pluginAPI;
const notifier = inject(pluginNotifierKey);
const environments = ref<Environment[]>([]),
  environmentId = ref(''),
  device = ref<Device>('cpu'),
  backend = ref<Backend>('cpu'),
  taskType = ref('upscale'),
  modelId = ref('real-cugan'),
  scale = ref('2'),
  tile = ref('2'),
  halfPrecision = ref(false),
  busy = ref(false),
  dependenciesReady = ref(false),
  currentJob = ref<JobRecord | null>(null),
  errorMessage = ref(''),
  message = ref('正在检测本机运行环境…'),
  status = ref<'idle' | 'success' | 'danger'>('idle'),
  jobStatus = ref('就绪后可运行'),
  jobTitle = ref('等待开始'),
  jobDetail = ref('选择任务、模型、输入图片和运行后端后开始处理。'),
  activeNav = ref<WorkbenchNav>('workbench'),
  leftCollapsed = ref(false),
  rightCollapsed = ref(false);
const configurations = ref<ModelConfigurations>(sanitizeConfigurations(null));
const libraryQuery = ref('');
const libraryFilter = ref('all');
const librarySaving = ref(false);
const libraryMessage = ref('');
const disposers: Array<() => void> = [];
const handles = reactive<Record<HandleKind, SelectedFile | null>>({
  input: null,
  weights: null,
  output: null,
});
const backendOptions = [
  { value: 'cpu', label: 'CPU', detail: '通用兼容', available: true },
  { value: 'cuda', label: 'CUDA', detail: 'NVIDIA GPU', available: true },
  { value: 'tensorrt', label: 'TensorRT', detail: '需构建 engine', available: false },
  { value: 'onnxruntime', label: 'ONNX Runtime', detail: '多 EP 推理', available: false },
  { value: 'webgpu', label: 'WebGPU', detail: '浏览器 GPU', available: false },
] as const;
const modelOptions = MODEL_CATALOG;
const deviceOptions = [
    { label: 'CPU · 通用模式', value: 'cpu' },
    { label: 'NVIDIA CUDA 12.1', value: 'cuda' },
  ],
  scaleOptions = [
    { label: '2× · 细节优先', value: '2' },
    { label: '3× · 平衡', value: '3' },
    { label: '4× · 放大优先', value: '4' },
  ],
  tileOptions = [
    { label: '0 · 不切块', value: '0' },
    { label: '1 · 大切块', value: '1' },
    { label: '2 · 平衡', value: '2' },
    { label: '3 · 低显存', value: '3' },
    { label: '4 · 最低显存', value: '4' },
  ];
const managedEnvironment = computed(
    () =>
      environments.value.find((item) => item.active) ??
      environments.value.find((item) => item.kind === 'managed')
  ),
  environmentOptions = computed(() =>
    environments.value.map((item) => ({ label: item.label, value: item.id }))
  ),
  selectedModel = computed(
    () => modelOptions.find((item) => item.id === modelId.value) ?? modelOptions[0]
  ),
  selectedBackend = computed(
    () => backendOptions.find((item) => item.value === backend.value) ?? backendOptions[0]
  ),
  ready = computed(() =>
    Boolean(
      managedEnvironment.value &&
      dependenciesReady.value &&
      handles.input &&
      handles.weights &&
      handles.output &&
      !currentJob.value &&
      selectedBackend.value.available &&
      canRunModel(selectedModel.value, taskType.value, backend.value) &&
      configurations.value[modelId.value].enabled &&
      configurations.value[modelId.value].tasks.includes(
        taskType.value as (typeof TASKS)[number]['id']
      )
    )
  ),
  progress = computed(() => Math.round((currentJob.value?.progress ?? 0) * 100)),
  progressVisible = computed(
    () => currentJob.value?.status === 'running' || currentJob.value?.status === 'queued'
  ),
  environmentHint = computed(() =>
    managedEnvironment.value
      ? `插件环境已就绪 · Python ${managedEnvironment.value.version ?? '3.10'}`
      : environments.value.length
        ? '选择基础环境并创建插件环境'
        : '未发现 Python；请先安装 Miniforge'
  ),
  inputLabel = computed(() => handles.input?.name ?? '选择一张图片'),
  inputSize = computed(() =>
    handles.input?.size ? `${Math.round(handles.input.size / 1024)} KB` : '—'
  );
function setError(cause: unknown, notify = true): void {
  errorMessage.value = cause instanceof Error ? cause.message : String(cause);
  status.value = 'danger';
  if (notify) void notifier?.notify('error', cause, '操作失败');
}
function clearError(): void {
  errorMessage.value = '';
  if (status.value === 'danger') status.value = 'idle';
}
async function runAction(task: () => Promise<void>): Promise<void> {
  clearError();
  busy.value = true;
  try {
    await task();
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}
async function refreshEnvironments(): Promise<void> {
  if (!api) throw new Error('插件运行时不可用，请从 GuYanTools 插件页面打开。');
  environments.value = await api.models.listPython();
  if (managedEnvironment.value) environmentId.value = managedEnvironment.value.id;
  dependenciesReady.value =
    Boolean(managedEnvironment.value) && (await api.models.checkDependencies(device.value));
  message.value = managedEnvironment.value
    ? '运行环境已准备，可以继续配置任务。'
    : '请选择环境并完成依赖安装。';
  void notifier?.notify('info', message.value, '运行环境');
}
async function changeDevice(event: Event): Promise<void> {
  device.value = String((event as CustomEvent<{ value: Device }>).detail.value) as Device;
  await runAction(async () => {
    dependenciesReady.value = false;
    if (!api) throw new Error('插件运行时不可用。');
    dependenciesReady.value = await api.models.checkDependencies(device.value);
    message.value = dependenciesReady.value
      ? '设备依赖已就绪。'
      : '依赖尚未安装，请安装所选设备依赖。';
    void notifier?.notify(
      dependenciesReady.value ? 'success' : 'warning',
      message.value,
      '运行设备'
    );
  });
}
function changeEnvironment(event: Event): void {
  environmentId.value = String((event as CustomEvent<{ value: string }>).detail.value);
}
async function createEnvironment(): Promise<void> {
  await runAction(async () => {
    if (!api || !environmentId.value) throw new Error('请先选择一个 Python 或 Conda 环境。');
    await api.models.createEnvironment(environmentId.value);
    await refreshEnvironments();
    status.value = 'success';
    void notifier?.notify('success', '插件运行环境已创建。', '运行环境');
  });
}
async function installDependencies(): Promise<void> {
  await runAction(async () => {
    if (!api || !managedEnvironment.value) throw new Error('请先创建插件环境。');
    const job = await api.models.installDependencies(device.value);
    currentJob.value = job;
    showJob(job);
  });
}
async function pick(kind: HandleKind): Promise<void> {
  await runAction(async () => {
    if (!api) throw new Error('插件运行时不可用。');
    const selected = await api.models.pickFile(kind);
    if (selected) {
      handles[kind] = selected;
      void notifier?.notify(
        'success',
        `已选择${kind === 'input' ? '输入图片' : kind === 'weights' ? '模型权重' : '输出目录'}。`,
        '文件选择'
      );
    }
  });
}
async function startInference(): Promise<void> {
  await runAction(async () => {
    if (!api || !ready.value) throw new Error('请先完成运行环境、依赖、文件和后端配置。');
    const job = await api.models.startInference({
      inputId: handles.input!.id,
      weightsId: handles.weights!.id,
      outputId: handles.output!.id,
      options: createCuganOptions(
        device.value,
        Number(scale.value),
        Number(tile.value),
        halfPrecision.value
      ),
    });
    currentJob.value = job;
    showJob(job);
    message.value = '任务已提交，正在准备模型与输入。';
  });
}
async function cancelJob(): Promise<void> {
  await runAction(async () => {
    if (api && currentJob.value) showJob(await api.models.cancel(currentJob.value.id));
  });
}
function showJob(job: JobRecord): void {
  currentJob.value = job;
  jobStatus.value = `${job.status}${job.currentStep ? ` · ${job.currentStep}` : ''}`;
  jobTitle.value =
    job.status === 'running' ? '正在处理图片' : job.status === 'queued' ? '任务排队中' : job.status;
  jobDetail.value = job.currentStep || '任务状态已更新。';
  void notifier?.job(job);
  if (job.status === 'failed') setError(job.error || '任务失败。', false);
  if (['completed', 'failed', 'cancelled'].includes(job.status)) currentJob.value = null;
}
function selectTask(id: string): void {
  taskType.value = id;
  if (!selectedModel.value.tasks.includes(id as (typeof TASKS)[number]['id'])) {
    libraryFilter.value = id;
    activeNav.value = 'models';
  }
}
async function selectBackend(value: string): Promise<void> {
  if (busy.value || currentJob.value || !canRunModel(selectedModel.value, taskType.value, value))
    return;
  backend.value = value as Backend;
  halfPrecision.value = false;
  await changeDevice(new CustomEvent('gt-change', { detail: { value } }));
}

async function openModelLink(url: string): Promise<void> {
  await runAction(async () => {
    if (!api) throw new Error('请从 GuYanTools 打开此页面以访问模型来源。');
    await api.system.openExternal(url);
  });
}

async function persistLibrary(
  next: ModelConfigurations,
  selectedId = modelId.value
): Promise<boolean> {
  if (!api?.storage) {
    libraryMessage.value = '当前运行时没有插件私有存储，请从 GuYanTools 打开并批准 storage.self。';
    void notifier?.notify('error', libraryMessage.value, '模型配置');
    return false;
  }
  librarySaving.value = true;
  try {
    await api.storage.set(CATALOG_STORAGE_KEY, {
      schemaVersion: 1,
      models: next,
      selectedModelId: selectedId,
    });
    configurations.value = next;
    libraryMessage.value = '模型配置已保存到本机。保存配置不会安装权重。';
    return true;
  } catch (cause) {
    libraryMessage.value = `保存失败，请检查插件私有存储权限 (storage.self)：${cause instanceof Error ? cause.message : String(cause)}`;
    void notifier?.notify('error', cause, '模型配置');
    return false;
  } finally {
    librarySaving.value = false;
  }
}

async function saveModelConfiguration(id: string, config: ModelConfiguration) {
  const model = MODEL_CATALOG.find((item) => item.id === id);
  if (!model || currentJob.value) {
    libraryMessage.value = '任务运行中，请结束任务后修改模型配置。';
    return;
  }
  const next = { ...configurations.value, [id]: sanitizeConfiguration(model, config) };
  if (await persistLibrary(next)) {
    void notifier?.notify('success', '模型配置已保存到本机。', '模型配置');
    if (id === modelId.value) await applyModelSelection(id);
  }
}

async function applyModelSelection(id: string) {
  const model = MODEL_CATALOG.find((item) => item.id === id);
  if (!model || currentJob.value || !configurations.value[id].enabled) return;
  const selection = resolveSelection(model, configurations.value[id], taskType.value);
  if (id !== modelId.value) handles.weights = null;
  modelId.value = selection.modelId;
  taskType.value = selection.task;
  backend.value = selection.backend;
  halfPrecision.value = false;
  if (selection.backend === 'cpu' || selection.backend === 'cuda') device.value = selection.backend;
  dependenciesReady.value = false;
  if (model.runtimeAdapter) await runAction(refreshEnvironments);
}

async function selectLibraryModel(id: string) {
  if (busy.value || currentJob.value) {
    libraryMessage.value = '任务运行中，请结束后切换模型。';
    return;
  }
  const model = MODEL_CATALOG.find((item) => item.id === id);
  if (!model) return;
  if (await persistLibrary(configurations.value, id)) {
    await applyModelSelection(id);
    void notifier?.notify('success', `已切换到模型：${model.name}。`, '模型配置');
    activeNav.value = 'workbench';
  }
}
onMounted(async () => {
  if (window.matchMedia('(max-width: 820px)').matches) {
    leftCollapsed.value = true;
    rightCollapsed.value = true;
  }
  if (!api) {
    setError('插件运行时不可用，请从 GuYanTools 插件页面打开。');
    return;
  }
  const offJobs = api.jobs.onEvent(showJob);
  if (typeof offJobs === 'function') disposers.push(offJobs);
  try {
    if (api.storage) {
      const saved = (await api.storage.get(CATALOG_STORAGE_KEY)) as {
        models?: unknown;
        selectedModelId?: string;
      } | null;
      configurations.value = sanitizeConfigurations(saved?.models);
      if (
        saved?.selectedModelId &&
        MODEL_CATALOG.some((model) => model.id === saved.selectedModelId) &&
        configurations.value[saved.selectedModelId].enabled
      )
        await applyModelSelection(saved.selectedModelId);
    }
  } catch {
    libraryMessage.value = '请在插件权限中批准 storage.self，以保存和恢复本地模型配置。';
    void notifier?.notify('warning', libraryMessage.value, '模型配置');
  }
  try {
    const theme = await api.ui.getTheme();
    document.documentElement.dataset.theme = theme.mode;
    const offTheme = api.ui.onThemeChanged((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme.mode;
    });
    if (typeof offTheme === 'function') disposers.push(offTheme);
    await refreshEnvironments();
    status.value = 'success';
  } catch (cause) {
    setError(cause);
  }
});
onBeforeUnmount(() => disposers.forEach((dispose) => dispose()));
</script>

<template>
  <main
    class="image-workbench"
    :class="{
      'image-workbench--left-collapsed': leftCollapsed,
      'image-workbench--right-collapsed': rightCollapsed,
    }"
  >
    <WorkbenchSidebar
      :active-nav="activeNav"
      @toggle="leftCollapsed = !leftCollapsed"
      @navigate="
        activeNav = $event;
        if ($event === 'models') libraryFilter = 'all';
      "
    />
    <section class="workbench-content">
      <div v-if="activeNav === 'models' || rightCollapsed" class="workbench-tools">
        <gt-input
          v-if="activeNav === 'models'"
          :value="libraryQuery"
          aria-label="搜索本地模型"
          placeholder="搜索模型、任务类型或作者"
          size="sm"
          @gt-input="libraryQuery = String($event.detail.value)"
        />
        <gt-button
          class="mobile-config-button"
          variant="primary"
          size="sm"
          @gt-click="rightCollapsed = false"
          >打开配置</gt-button
        >
      </div>
      <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
      <ModelLibrary
        v-if="activeNav === 'models'"
        :configurations="configurations"
        :current-model-id="modelId"
        :query="libraryQuery"
        :task-filter="libraryFilter"
        :saving="librarySaving || Boolean(currentJob)"
        :message="libraryMessage"
        @filter="libraryFilter = $event"
        @configure="saveModelConfiguration"
        @select="selectLibraryModel"
        @open="openModelLink"
      />
      <RuntimeEnvironment
        v-if="activeNav === 'runtime'"
        :models="api?.models"
        :jobs="api?.jobs"
        :storage="api?.storage"
        :job-running="Boolean(currentJob)"
        @job="showJob"
        @changed="runAction(refreshEnvironments)"
        @open="openModelLink"
      />
      <section class="workspace-grid">
        <div v-show="activeNav !== 'models' && activeNav !== 'runtime'" class="workspace-main">
          <TaskToolbar
            :task-type="taskType"
            :disabled="busy || Boolean(currentJob)"
            @select="selectTask"
          />
          <ImageInputPreview
            :input-label="inputLabel"
            :input-size="inputSize"
            :has-input="Boolean(handles.input)"
            :disabled="busy"
            @pick="pick('input')"
          />
          <ResultPreview />
        </div>
        <ProcessingConfigSidebar
          v-if="activeNav !== 'models' && activeNav !== 'runtime'"
          :selected-model="selectedModel"
          :configuration="configurations[modelId]"
          :selected-backend="selectedBackend"
          :backend="backend"
          :backend-options="backendOptions"
          :task-type="taskType"
          :can-run="canRunModel"
          :ready="ready"
          :scale="scale"
          :tile="tile"
          :half-precision="halfPrecision"
          :device="device"
          :busy="busy"
          :current-job="Boolean(currentJob)"
          :handles="handles"
          :environment-id="environmentId"
          :environment-options="environmentOptions"
          :environment-hint="environmentHint"
          :environments="environments"
          :managed-environment="managedEnvironment"
          :scale-options="scaleOptions"
          :tile-options="tileOptions"
          @toggle="rightCollapsed = !rightCollapsed"
          @models="
            activeNav = 'models';
            libraryFilter = 'all';
          "
          @backend="selectBackend"
          @scale="scale = $event"
          @tile="tile = $event"
          @half="halfPrecision = $event"
          @pick="pick"
          @runtime="activeNav = 'runtime'"
          @environment="changeEnvironment"
          @refresh="runAction(refreshEnvironments)"
          @create="createEnvironment"
          @install="installDependencies"
          @start="startInference"
          @cancel="cancelJob"
        />
      </section>
      <ActivityBar
        :running="Boolean(currentJob)"
        :failed="currentJob?.status === 'failed'"
        :title="jobTitle"
        :detail="currentJob ? jobDetail : message"
        :progress-visible="progressVisible"
        :progress="progress"
        :backend-label="selectedBackend.label"
        :model-name="selectedModel.name"
        :status="status"
      />
    </section>
  </main>
</template>
