<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  MODEL_CATALOG,
  TASKS,
  assetSize,
  filterModels,
  sanitizeConfiguration,
  taskLabel,
  type ImageTask,
  type ModelConfiguration,
  type ModelConfigurations,
} from './model_catalog';

const props = defineProps<{
  configurations: ModelConfigurations;
  currentModelId: string;
  query: string;
  taskFilter: string;
  saving: boolean;
  message: string;
}>();
const emit = defineEmits<{
  configure: [modelId: string, config: ModelConfiguration];
  select: [modelId: string];
  open: [url: string];
  filter: [task: string];
}>();
const detailId = ref(props.currentModelId);
const detail = computed(
  () => MODEL_CATALOG.find((model) => model.id === detailId.value) ?? MODEL_CATALOG[0]
);
const draft = ref(sanitizeConfiguration(detail.value, props.configurations[detail.value.id]));
const visibleModels = computed(() => filterModels(MODEL_CATALOG, props.taskFilter, props.query));
const taskOptions = [
  { label: '全部任务类型', value: 'all' },
  ...TASKS.map((task) => ({ label: task.label, value: task.id })),
];
const backendChoices = computed(() =>
  detail.value.nativeBackends.map((backend) => ({ label: backend.toUpperCase(), value: backend }))
);
const assetChoices = computed(() =>
  detail.value.assets.map((asset) => ({ label: asset.label, value: asset.id }))
);
const selectedAsset = computed(
  () =>
    detail.value.assets.find((asset) => asset.id === draft.value.assetId) ?? detail.value.assets[0]
);

watch([detailId, () => props.configurations], () => {
  draft.value = sanitizeConfiguration(detail.value, props.configurations[detail.value.id]);
});

function toggleTask(task: ImageTask, event: CustomEvent<{ checked: boolean }>) {
  if (event.detail.checked)
    draft.value.tasks = detail.value.tasks.filter(
      (item) => item === task || draft.value.tasks.includes(item)
    );
  else if (draft.value.tasks.length > 1)
    draft.value.tasks = draft.value.tasks.filter((item) => item !== task);
}
</script>

<template>
  <section class="model-library" aria-label="本地模型库">
    <header class="model-library__header">
      <div>
        <h2>本地模型库</h2>
        <p>{{ MODEL_CATALOG.length }} 个真实模型与权重变体 · 来源核对于 2026-10-04</p>
      </div>
      <gt-select
        aria-label="按任务筛选模型"
        :value="taskFilter"
        :options="taskOptions"
        size="sm"
        @gt-change="emit('filter', String($event.detail.value))"
      />
    </header>
    <p class="model-library__notice">
      选择模型可配置任务范围、默认后端与下载资产。权重准备、环境安装和推理适配分别展示；目录中的新模型需要对应模型插件才能运行。
    </p>
    <div class="model-library__layout">
      <div class="model-library__list" aria-label="模型列表">
        <p v-if="!visibleModels.length" class="model-library__empty" role="status">
          没有匹配模型。尝试更换关键词或任务类型。
        </p>
        <gt-card
          v-for="model in visibleModels"
          :key="model.id"
          class="model-library__item"
          :class="{ 'model-library__item--selected': detailId === model.id }"
          padding="sm"
        >
          <div class="model-library__item-heading">
            <h3>{{ configurations[model.id]?.alias || model.name }}</h3>
            <gt-badge :tone="currentModelId === model.id ? 'info' : 'neutral'">{{
              currentModelId === model.id ? '当前模型' : '可配置'
            }}</gt-badge>
          </div>
          <small>{{ model.author }} · {{ model.version }}</small>
          <p>{{ model.description }}</p>
          <div class="model-library__tags">
            <gt-badge v-for="task in model.tasks" :key="task" tone="neutral">{{
              taskLabel(task)
            }}</gt-badge>
          </div>
          <div class="model-library__item-footer">
            <span>{{ model.license }}</span
            ><gt-button
              size="sm"
              variant="secondary"
              :active="detailId === model.id"
              @gt-click="detailId = model.id"
              >配置模型</gt-button
            >
          </div>
        </gt-card>
      </div>
      <section class="model-library__detail" aria-label="模型配置">
        <div class="model-library__detail-heading">
          <h3>{{ detail.name }}</h3>
          <gt-badge :tone="detail.runtimeAdapter ? 'success' : 'warning'">{{
            detail.runtimeAdapter ? '推理适配已接入' : '待接入模型插件'
          }}</gt-badge>
        </div>
        <p>{{ detail.description }}</p>
        <div class="model-library__links">
          <gt-button size="sm" variant="ghost" @gt-click="emit('open', detail.sourceUrl)"
            >官方来源</gt-button
          ><gt-button size="sm" variant="ghost" @gt-click="emit('open', detail.licenseUrl)"
            >查看许可</gt-button
          >
        </div>
        <p v-if="detail.licenseNote" class="model-library__license">{{ detail.licenseNote }}</p>
        <label class="control-field"
          ><span>显示名称（可选）</span
          ><gt-input
            aria-label="模型显示名称"
            :value="draft.alias"
            :placeholder="detail.name"
            size="sm"
            @gt-input="draft.alias = String($event.detail.value)"
        /></label>
        <gt-checkbox
          label="在工作台启用此模型配置"
          :checked="draft.enabled"
          @gt-change="draft.enabled = Boolean($event.detail.checked)"
        />
        <fieldset class="model-library__task-config">
          <legend>支持的任务类型</legend>
          <p>只能选择上游已声明的能力，至少保留一类。</p>
          <gt-checkbox
            v-for="task in detail.tasks"
            :key="task"
            :label="taskLabel(task)"
            :checked="draft.tasks.includes(task)"
            :disabled="draft.tasks.length === 1 && draft.tasks.includes(task)"
            @gt-change="toggleTask(task, $event)"
          />
        </fieldset>
        <label class="control-field"
          ><span>默认本地后端（上游支持）</span
          ><gt-select
            aria-label="默认本地后端"
            :value="draft.backend"
            :options="backendChoices"
            size="sm"
            @gt-change="draft.backend = $event.detail.value"
        /></label>
        <p class="field-hint">
          TensorRT / ONNX / WebGPU 不会由 PyTorch 权重自动获得，需要经验证的转换产物与对应适配。
        </p>
        <label class="control-field"
          ><span>默认下载资产</span
          ><gt-select
            aria-label="默认下载资产"
            :value="draft.assetId"
            :options="assetChoices"
            size="sm"
            @gt-change="draft.assetId = String($event.detail.value)"
        /></label>
        <section class="model-library__asset" aria-label="权重下载信息">
          <strong>{{ selectedAsset.label }}</strong
          ><span>{{ selectedAsset.format }} · {{ assetSize(selectedAsset.sizeBytes) }}</span>
          <span>{{
            selectedAsset.kind === 'snapshot'
              ? '完整仓库目录，包含多个必要文件'
              : selectedAsset.kind === 'directory'
                ? '上游下载页，按说明手动获取'
                : selectedAsset.kind === 'archive'
                  ? '权重压缩包，需要解压'
                  : '权重文件直链'
          }}</span>
          <code>{{ selectedAsset.url }}</code>
          <span
            >{{
              selectedAsset.verification === 'head-verified'
                ? '已确认链接可访问（HEAD）'
                : selectedAsset.verification === 'auth-required'
                  ? '需要来源站点授权'
                  : '链接可用性未确认'
            }}
            · {{ selectedAsset.checkedAt }}</span
          >
          <span
            >SHA-256：{{
              selectedAsset.sha256 ? '发布者已提供，见下方' : '上游未公布，不作为校验完成'
            }}</span
          ><code v-if="selectedAsset.sha256">{{ selectedAsset.sha256 }}</code>
          <gt-button
            size="sm"
            variant="secondary"
            :disabled="selectedAsset.verification === 'unreachable'"
            @gt-click="emit('open', selectedAsset.url)"
            >{{
              selectedAsset.kind === 'file' || selectedAsset.kind === 'archive'
                ? '打开权重下载链接'
                : '打开完整下载目录'
            }}</gt-button
          >
        </section>
        <p v-if="detail.snapshotNote" class="field-hint">{{ detail.snapshotNote }}</p>
        <p class="field-hint">{{ detail.resources }}</p>
        <dl>
          <dt>输入</dt>
          <dd>{{ detail.inputs.join(' / ') }}</dd>
          <dt>模型 ID</dt>
          <dd>{{ detail.id }}</dd>
          <template v-if="detail.revision"
            ><dt>固定 revision</dt>
            <dd>
              <code>{{ detail.revision }}</code>
            </dd></template
          >
        </dl>
        <div class="model-library__actions">
          <gt-button
            variant="primary"
            size="sm"
            :disabled="saving"
            @gt-click="emit('configure', detail.id, sanitizeConfiguration(detail, draft))"
            >{{ saving ? '保存中…' : '保存模型配置' }}</gt-button
          ><gt-button
            variant="secondary"
            size="sm"
            :disabled="saving || !configurations[detail.id]?.enabled"
            @gt-click="emit('select', detail.id)"
            >使用已保存配置</gt-button
          >
        </div>
        <p class="model-library__save-message" aria-live="polite">{{ message }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.model-library {
  margin-top: 20px;
  min-width: 0;
}
.model-library__header,
.model-library__item-heading,
.model-library__item-footer,
.model-library__detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.model-library__header gt-select {
  width: 190px;
  flex: 0 0 190px;
}
.model-library__header p,
.model-library__notice,
small,
dt {
  color: var(--gt-color-text-muted);
  font-size: 12px;
  line-height: 1.55;
}
.model-library__header p {
  margin-top: 6px;
}
.model-library__notice {
  margin: 16px 0;
  padding: 12px;
  background: var(--gt-color-surface-muted);
  border-radius: var(--gt-radius-sm);
}
.model-library__layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.95fr) minmax(300px, 1.05fr);
  gap: 18px;
  height: max(320px, calc(100dvh - 240px));
  align-items: stretch;
}
.model-library__list {
  display: grid;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  align-content: start;
  overflow: auto;
  padding-right: 4px;
}
.model-library__item::part(base) {
  box-shadow: none;
  border: 1px solid var(--gt-color-border);
  border-radius: var(--gt-radius-md);
}
.model-library__item--selected::part(base) {
  border-color: var(--gt-color-primary);
  background: color-mix(in srgb, var(--gt-color-primary) 6%, var(--gt-color-surface));
}
.model-library h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.model-library__item p,
.model-library__detail > p {
  font-size: 12px;
  line-height: 1.65;
  margin: 10px 0;
}
.model-library__item small {
  display: block;
  margin-top: 5px;
}
.model-library__tags,
.model-library__links,
.model-library__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.model-library__item-footer {
  margin-top: 12px;
  font-size: 11px;
  color: var(--gt-color-text-muted);
}
.model-library__detail {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: var(--gt-color-surface);
  border: 1px solid var(--gt-color-border);
  border-radius: var(--gt-radius-md);
}
.model-library__detail .control-field {
  margin: 14px 0;
}
.model-library__task-config {
  display: grid;
  gap: 8px;
  margin: 14px 0;
  padding: 12px;
  border: 1px solid var(--gt-color-border);
  border-radius: var(--gt-radius-sm);
}
.model-library__task-config legend {
  font-size: 12px;
  font-weight: 600;
}
.model-library__task-config p {
  font-size: 11px;
  color: var(--gt-color-text-muted);
}
.model-library__asset {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: var(--gt-radius-sm);
  background: var(--gt-color-surface-muted);
  font-size: 11px;
  line-height: 1.55;
}
.model-library code {
  overflow-wrap: anywhere;
  white-space: normal;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  user-select: text;
}
.model-library__license {
  color: var(--gt-color-danger);
}
.model-library dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px 14px;
  margin: 16px 0;
}
.model-library dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}
.model-library__save-message {
  min-height: 18px;
  font-size: 11px;
  color: var(--gt-color-text-muted);
}
.model-library__empty {
  padding: 28px 12px;
  color: var(--gt-color-text-muted);
}
@media (max-width: 1150px) {
  .model-library__layout {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
  .model-library__list {
    max-height: 420px;
  }
  .model-library__header {
    flex-wrap: wrap;
  }
}
</style>
