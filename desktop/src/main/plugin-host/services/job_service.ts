import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { JobRecord } from '@/contracts/plugin_media';
import { PluginApiError } from '../plugin_api_error';
import type { PluginQuotaService } from '../quota';

type JobStore = {
  createPluginJob(input: unknown): Promise<unknown>;
  listPluginJobs(pluginId: string): Promise<unknown[]>;
  updatePluginJob(id: string, input: unknown): Promise<unknown>;
  getPluginJob(id: string): Promise<unknown | null>;
  retryPluginJob(sourceId: string, newId: string): Promise<unknown>;
};

export class JobService {
  private readonly events = new EventEmitter();

  constructor(
    private readonly db: JobStore,
    private readonly quota?: PluginQuotaService
  ) {
    this.events.setMaxListeners(50);
  }

  async create(pluginId: string, kind: string, input: unknown, parentJobId?: string) {
    if (this.quota && !this.quota.tryAcquireJobSlot(pluginId)) {
      throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_JOB_QUOTA');
    }
    let job: JobRecord;
    try {
      job = (await this.db.createPluginJob({
        id: crypto.randomUUID(),
        pluginId,
        kind,
        inputJson: JSON.stringify(input),
        parentJobId,
      })) as JobRecord;
    } catch (error) {
      this.quota?.releaseJobSlot(pluginId);
      throw error;
    }
    this.quota?.trackJobSlot(pluginId, job.id);
    this.events.emit(pluginId, job);
    return job;
  }

  async list(pluginId: string) {
    return this.db.listPluginJobs(pluginId) as Promise<JobRecord[]>;
  }

  async update(pluginId: string, id: string, input: unknown) {
    const previous = await this.get(pluginId, id);
    const nextStatus = input && typeof input === 'object' && 'status' in input
      ? (input as { status?: unknown }).status
      : undefined;
    const resuming = previous.status === 'paused' && nextStatus === 'running';
    if (resuming && this.quota && !this.quota.tryAcquireJobSlot(pluginId)) {
      throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_JOB_QUOTA');
    }
    let job: JobRecord;
    try {
      job = (await this.db.updatePluginJob(id, input)) as JobRecord;
    } catch (error) {
      if (resuming) this.quota?.releaseJobSlot(pluginId);
      throw error;
    }
    if (resuming) this.quota?.trackJobSlot(pluginId, job.id);
    if (isReleasedJobStatus(job.status)) {
      this.quota?.releaseJobSlotForJob(pluginId, job.id);
    }
    this.events.emit(pluginId, job);
    return job;
  }

  async get(pluginId: string, id: string) {
    const job = (await this.db.getPluginJob(id)) as JobRecord | null;
    if (!job) throw new PluginApiError('JOB_NOT_FOUND', `PLUGIN_JOB_NOT_FOUND: ${id}`);
    if (job.pluginId !== pluginId)
      throw new PluginApiError('OWNER_MISMATCH', 'PLUGIN_JOB_OWNER_MISMATCH');
    return job;
  }

  async cancel(pluginId: string, id: string) {
    return this.update(pluginId, id, { status: 'cancelled' });
  }

  async retry(pluginId: string, sourceId: string) {
    await this.get(pluginId, sourceId);
    if (this.quota && !this.quota.tryAcquireJobSlot(pluginId)) {
      throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_JOB_QUOTA');
    }
    let job: JobRecord;
    try {
      job = (await this.db.retryPluginJob(sourceId, crypto.randomUUID())) as JobRecord;
    } catch (error) {
      this.quota?.releaseJobSlot(pluginId);
      throw error;
    }
    this.quota?.trackJobSlot(pluginId, job.id);
    this.events.emit(pluginId, job);
    return job;
  }

  onEvent(pluginId: string, listener: (job: JobRecord) => void) {
    this.events.on(pluginId, listener);
    return () => this.events.off(pluginId, listener);
  }

  offPlugin(pluginId: string) {
    this.events.removeAllListeners(pluginId);
  }

  async recoverRunning(pluginId: string) {
    const jobs = await this.list(pluginId);
    return Promise.all(
      jobs
        .filter((job) => job.status === 'running')
        .map((job) =>
          this.update(pluginId, job.id, {
            status: 'paused',
            currentStep: 'recovered-after-restart',
          })
        )
    );
  }
}

function isReleasedJobStatus(status: string) {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'paused';
}
