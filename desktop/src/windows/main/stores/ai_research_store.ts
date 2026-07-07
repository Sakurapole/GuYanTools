import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AiResearchEvent,
  AiResearchJob,
  AiResearchSource,
  RetryAiResearchPayload,
  StartAiResearchPayload,
} from '@/contracts/ai';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useAiResearchStore = defineStore('ai-research', () => {
  const jobs = ref<AiResearchJob[]>([]);
  const sourcesByJob = ref<Record<string, AiResearchSource[]>>({});
  const activeJobId = ref('');
  const loading = ref(false);
  const starting = ref(false);
  const error = ref('');
  let unsubscribe: (() => void) | null = null;

  const activeJob = computed(() =>
    jobs.value.find((job) => job.id === activeJobId.value) ?? jobs.value[0] ?? null,
  );
  const activeSources = computed(() =>
    activeJob.value ? sourcesByJob.value[activeJob.value.id] ?? activeJob.value.sources ?? [] : [],
  );
  const runningJobs = computed(() => jobs.value.filter((job) => job.status === 'queued' || job.status === 'running'));

  function ensureSubscription() {
    if (unsubscribe || !window.aiApi) {
      return;
    }
    unsubscribe = window.aiApi.onResearchEvent(handleResearchEvent);
  }

  async function refresh() {
    if (!window.aiApi) {
      return jobs.value;
    }
    ensureSubscription();
    loading.value = true;
    error.value = '';
    try {
      const nextJobs = await window.aiApi.listResearchJobs({ limit: 50 });
      jobs.value = nextJobs;
      sourcesByJob.value = Object.fromEntries(
        nextJobs.map((job) => [job.id, job.sources ?? []]),
      );
      if (!activeJobId.value && nextJobs[0]) {
        activeJobId.value = nextJobs[0].id;
      }
      return nextJobs;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  async function start(input: StartAiResearchPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI Research API');
    }
    ensureSubscription();
    starting.value = true;
    error.value = '';
    try {
      const job = await window.aiApi.startResearch(clone(input));
      upsertJob(job);
      activeJobId.value = job.id;
      return job;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      starting.value = false;
    }
  }

  async function retry(input: RetryAiResearchPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI Research API');
    }
    ensureSubscription();
    const job = await window.aiApi.retryResearch(clone(input));
    upsertJob(job);
    activeJobId.value = job.id;
    return job;
  }

  async function cancel(jobId: string) {
    if (!window.aiApi) {
      return null;
    }
    const job = await window.aiApi.cancelResearch(jobId);
    upsertJob(job);
    return job;
  }

  async function loadSources(jobId: string) {
    if (!window.aiApi || !jobId) {
      return [];
    }
    const sources = await window.aiApi.listResearchSources(jobId);
    sourcesByJob.value = {
      ...sourcesByJob.value,
      [jobId]: sources,
    };
    return sources;
  }

  function setActiveJob(jobId: string) {
    activeJobId.value = jobId;
    if (!sourcesByJob.value[jobId]) {
      loadSources(jobId).catch((): undefined => undefined);
    }
  }

  function handleResearchEvent(event: AiResearchEvent) {
    if (event.type === 'research-job') {
      upsertJob(event.job);
      return;
    }
    if (event.type === 'research-source') {
      const current = sourcesByJob.value[event.jobId] ?? [];
      if (current.some((source) => source.id === event.source.id)) {
        return;
      }
      sourcesByJob.value = {
        ...sourcesByJob.value,
        [event.jobId]: [...current, event.source],
      };
      return;
    }
    if (event.type === 'research-error') {
      error.value = event.message;
    }
  }

  function upsertJob(job: AiResearchJob) {
    const current = jobs.value.filter((item) => item.id !== job.id);
    jobs.value = [job, ...current].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (job.sources) {
      sourcesByJob.value = {
        ...sourcesByJob.value,
        [job.id]: job.sources,
      };
    }
  }

  function dispose() {
    unsubscribe?.();
    unsubscribe = null;
  }

  return {
    jobs,
    sourcesByJob,
    activeJobId,
    activeJob,
    activeSources,
    runningJobs,
    loading,
    starting,
    error,
    ensureSubscription,
    refresh,
    start,
    retry,
    cancel,
    loadSources,
    setActiveJob,
    dispose,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAiResearchStore, import.meta.hot));
}
