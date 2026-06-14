<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AiResearchJob, AiResearchRunOptions } from '@/contracts/ai';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect, { type UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { notifyError, notifySuccess } from '@/windows/main/composables/useInAppNotification';
import { useAiConfigStore } from '@/windows/main/stores/ai_config_store';
import { useAiResearchStore } from '@/windows/main/stores/ai_research_store';
import { useKnowledgeStore } from '@/windows/main/stores/knowledge_store';

const researchStore = useAiResearchStore();
const aiConfigStore = useAiConfigStore();
const knowledgeStore = useKnowledgeStore();

const query = ref('');
const webMode = ref<'force' | 'off'>('force');
const knowledgeMode = ref<'force' | 'off'>('force');
const maxSources = ref('10');

const sourceModeOptions: UiSelectOption[] = [
  { label: '启用', value: 'force' },
  { label: '关闭', value: 'off' },
];

const selectedJob = computed(() => researchStore.activeJob);
const selectedSources = computed(() => researchStore.activeSources);
const canStart = computed(() => query.value.trim().length > 0 && !researchStore.starting);
const maxSourcesValue = computed(() => {
  const value = Number(maxSources.value);
  return Number.isFinite(value) && value > 0 ? Math.min(24, Math.max(3, Math.floor(value))) : 10;
});

onMounted(async () => {
  researchStore.ensureSubscription();
  await Promise.all([
    researchStore.refresh(),
    aiConfigStore.refresh(),
  ]);
});

onBeforeUnmount(() => {
  researchStore.dispose();
});

async function startResearch() {
  const options: AiResearchRunOptions = {
    providerId: aiConfigStore.defaultProvider?.id,
    modelId: aiConfigStore.defaultModel?.id,
    libraryId: aiConfigStore.config.research.defaultKnowledgeLibraryId,
    spaceId: aiConfigStore.config.research.defaultKnowledgeSpaceId,
    webSearchMode: webMode.value,
    knowledgeSearchMode: knowledgeMode.value,
    maxSources: maxSourcesValue.value,
  };
  try {
    await researchStore.start({
      query: query.value,
      options,
    });
    query.value = '';
  } catch (error) {
    notifyError(error, '启动 Deep Research 失败');
  }
}

async function cancelJob(job: AiResearchJob) {
  try {
    await researchStore.cancel(job.id);
  } catch (error) {
    notifyError(error, '取消 Deep Research 失败');
  }
}

async function retryJob(job: AiResearchJob) {
  try {
    await researchStore.retry({ jobId: job.id });
  } catch (error) {
    notifyError(error, '重试 Deep Research 失败');
  }
}

async function copyReport(job: AiResearchJob) {
  if (!job.reportMarkdown) return;
  await navigator.clipboard.writeText(job.reportMarkdown);
  notifySuccess('报告已复制', 'Deep Research');
}

async function saveReportToKnowledge(job: AiResearchJob) {
  if (!job.reportMarkdown) return;
  const page = await knowledgeStore.createDocumentExcerptPage({
    title: job.title,
    contentMarkdown: job.reportMarkdown,
    contentText: job.reportMarkdown,
    propertiesJson: JSON.stringify({
      sourceType: 'ai_research_report',
      sourceResearchJobId: job.id,
      query: job.query,
      savedAt: new Date().toISOString(),
    }),
  });
  if (page) {
    notifySuccess('Research 报告已保存为知识页', 'Deep Research');
  }
}

function stageLabel(job: AiResearchJob) {
  if (job.status === 'succeeded') return '完成';
  if (job.status === 'failed') return '失败';
  if (job.status === 'cancelled') return '已取消';
  if (job.stage === 'plan') return '规划';
  if (job.stage === 'search') return '检索';
  if (job.stage === 'read') return '阅读';
  if (job.stage === 'synthesize') return '合成';
  if (job.stage === 'citation_check') return '核验引用';
  return '准备';
}

function statusIcon(job: AiResearchJob) {
  if (job.status === 'succeeded') return 'iconify:lucide:check-circle-2';
  if (job.status === 'failed') return 'iconify:lucide:circle-alert';
  if (job.status === 'cancelled') return 'iconify:lucide:circle-slash';
  return 'iconify:lucide:loader-circle';
}
</script>

<template>
  <section class="ai-research-panel" aria-label="Deep Research">
    <header class="ai-research-panel__header">
      <div>
        <h2>Deep Research</h2>
        <p>固定流程检索 web 与知识库，生成可审计报告。</p>
      </div>
      <UiButton size="sm" variant="secondary" :disabled="researchStore.loading" @click="researchStore.refresh">
        <template #prefix>
          <IconRenderer icon="iconify:lucide:refresh-cw" :size="14" />
        </template>
        刷新
      </UiButton>
    </header>

    <div class="ai-research-panel__composer">
      <UiTextarea
        v-model="query"
        :rows="4"
        resize="none"
        placeholder="输入研究主题"
        :disabled="researchStore.starting"
      />
      <div class="ai-research-panel__controls">
        <UiSelect v-model="webMode" size="sm" :options="sourceModeOptions" placeholder="Web" />
        <UiSelect v-model="knowledgeMode" size="sm" :options="sourceModeOptions" placeholder="知识库" />
        <UiInput v-model="maxSources" size="sm" type="number" min="3" max="24" placeholder="来源数" />
        <UiButton variant="primary" :disabled="!canStart" @click="startResearch">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:search-check" :size="14" />
          </template>
          开始研究
        </UiButton>
      </div>
      <p v-if="researchStore.error" class="ai-research-panel__error">{{ researchStore.error }}</p>
    </div>

    <div class="ai-research-panel__body">
      <aside class="ai-research-panel__jobs">
        <button
          v-for="job in researchStore.jobs"
          :key="job.id"
          type="button"
          class="ai-research-panel__job"
          :class="{ 'ai-research-panel__job--active': selectedJob?.id === job.id }"
          @click="researchStore.setActiveJob(job.id)"
        >
          <IconRenderer :icon="statusIcon(job)" :size="15" />
          <span>{{ job.title }}</span>
          <small>{{ stageLabel(job) }} · {{ Math.round(job.progress) }}%</small>
        </button>
        <p v-if="!researchStore.jobs.length" class="ai-research-panel__empty">暂无研究任务</p>
      </aside>

      <main v-if="selectedJob" class="ai-research-panel__detail">
        <header class="ai-research-panel__job-header">
          <div>
            <h3>{{ selectedJob.title }}</h3>
            <p>{{ selectedJob.query }}</p>
          </div>
          <div class="ai-research-panel__job-actions">
            <UiButton
              v-if="selectedJob.status === 'queued' || selectedJob.status === 'running'"
              size="sm"
              variant="danger"
              @click="cancelJob(selectedJob)"
            >
              取消
            </UiButton>
            <UiButton
              v-if="selectedJob.status === 'failed' || selectedJob.status === 'cancelled'"
              size="sm"
              variant="secondary"
              @click="retryJob(selectedJob)"
            >
              重试
            </UiButton>
            <UiButton size="sm" variant="secondary" :disabled="!selectedJob.reportMarkdown" @click="copyReport(selectedJob)">
              复制
            </UiButton>
            <UiButton size="sm" variant="secondary" :disabled="!selectedJob.reportMarkdown" @click="saveReportToKnowledge(selectedJob)">
              保存到知识库
            </UiButton>
          </div>
        </header>

        <div class="ai-research-panel__progress" :aria-label="`${Math.round(selectedJob.progress)}%`">
          <span :style="{ width: `${Math.max(2, Math.min(100, selectedJob.progress))}%` }" />
        </div>

        <section class="ai-research-panel__sources">
          <h4>来源</h4>
          <article v-for="source in selectedSources" :key="source.id">
            <strong>{{ source.title }}</strong>
            <small>{{ source.sourceType }}{{ source.url ? ` · ${source.url}` : '' }}</small>
            <p>{{ source.summary || source.snippet }}</p>
          </article>
          <p v-if="!selectedSources.length" class="ai-research-panel__empty">等待检索来源</p>
        </section>

        <section class="ai-research-panel__report">
          <h4>报告</h4>
          <pre v-if="selectedJob.reportMarkdown">{{ selectedJob.reportMarkdown }}</pre>
          <p v-else-if="selectedJob.errorMessage" class="ai-research-panel__error">{{ selectedJob.errorMessage }}</p>
          <p v-else class="ai-research-panel__empty">{{ stageLabel(selectedJob) }}中</p>
        </section>
      </main>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.ai-research-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--ui-surface-bg);
}

.ai-research-panel__header,
.ai-research-panel__composer,
.ai-research-panel__job-header {
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-research-panel__header,
.ai-research-panel__job-header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.ai-research-panel h2,
.ai-research-panel h3,
.ai-research-panel h4,
.ai-research-panel p {
  margin: 0;
}

.ai-research-panel h2 {
  font-size: 1rem;
}

.ai-research-panel h3 {
  font-size: 0.95rem;
}

.ai-research-panel h4 {
  color: var(--ui-text-muted);
  font-size: 0.8rem;
}

.ai-research-panel p,
.ai-research-panel small {
  color: var(--ui-text-muted);
  font-size: 0.78rem;
  line-height: 1.5;
}

.ai-research-panel__composer {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
}

.ai-research-panel__controls,
.ai-research-panel__job-actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ai-research-panel__controls :deep(.ui-select) {
  width: 118px;
}

.ai-research-panel__controls :deep(.ui-input) {
  width: 96px;
}

.ai-research-panel__body {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  min-height: 0;
}

.ai-research-panel__jobs {
  min-width: 0;
  overflow: auto;
  border-right: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-muted);
}

.ai-research-panel__job {
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 8px;
  padding: 10px 12px;
  border: 0;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  color: var(--ui-text-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ai-research-panel__job span,
.ai-research-panel__job small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-research-panel__job small {
  grid-column: 2;
}

.ai-research-panel__job--active {
  background: var(--ui-surface-base);
}

.ai-research-panel__detail {
  display: grid;
  grid-template-rows: auto auto minmax(120px, 0.8fr) minmax(0, 1.2fr);
  min-width: 0;
  min-height: 0;
}

.ai-research-panel__progress {
  height: 4px;
  overflow: hidden;
  background: var(--ui-surface-muted);
}

.ai-research-panel__progress span {
  display: block;
  height: 100%;
  background: var(--ui-primary-color);
}

.ai-research-panel__sources,
.ai-research-panel__report {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  overflow: auto;
  padding: 14px 16px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-research-panel__sources article {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-base);
}

.ai-research-panel__sources strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-research-panel__report pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ui-text-primary);
  font-family: inherit;
  font-size: 0.86rem;
  line-height: 1.7;
}

.ai-research-panel__error {
  color: var(--ui-danger-color);
}

.ai-research-panel__empty {
  padding: 10px 0;
}

@media (max-width: 980px) {
  .ai-research-panel__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-research-panel__jobs {
    max-height: 180px;
    border-right: 0;
  }
}
</style>
