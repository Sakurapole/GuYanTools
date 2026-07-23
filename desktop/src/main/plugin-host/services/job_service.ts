import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { JobRecord } from '@/contracts/plugin_media';

type JobStore = {
  createPluginJob(input: unknown): Promise<unknown>;
  listPluginJobs(pluginId: string): Promise<unknown[]>;
  updatePluginJob(id: string, input: unknown): Promise<unknown>;
  getPluginJob(id: string): Promise<unknown | null>;
  retryPluginJob(sourceId: string, newId: string): Promise<unknown>;
};

export class JobService {
  private readonly events = new EventEmitter();

  constructor(private readonly db: JobStore) {}

  async create(pluginId: string, kind: string, input: unknown, parentJobId?: string) {
    const job = await this.db.createPluginJob({ id: crypto.randomUUID(), pluginId, kind, inputJson: JSON.stringify(input), parentJobId }) as JobRecord;
    this.events.emit(pluginId, job);
    return job;
  }

  async list(pluginId: string) {
    return this.db.listPluginJobs(pluginId) as Promise<JobRecord[]>;
  }

  async update(pluginId: string, id: string, input: unknown) {
    await this.get(pluginId, id);
    const job = await this.db.updatePluginJob(id, input) as JobRecord;
    this.events.emit(pluginId, job);
    return job;
  }

  async get(pluginId: string, id: string) {
    const job = await this.db.getPluginJob(id) as JobRecord | null;
    if (!job || job.pluginId !== pluginId) throw new Error('PLUGIN_JOB_OWNER_MISMATCH');
    return job;
  }

  async cancel(pluginId: string, id: string) {
    return this.update(pluginId, id, { status: 'cancelled' });
  }

  async retry(pluginId: string, sourceId: string) {
    await this.get(pluginId, sourceId);
    const job = await this.db.retryPluginJob(sourceId, crypto.randomUUID()) as JobRecord;
    this.events.emit(pluginId, job);
    return job;
  }

  onEvent(pluginId: string, listener: (job: JobRecord) => void) {
    this.events.on(pluginId, listener);
    return () => this.events.off(pluginId, listener);
  }

  async recoverRunning(pluginId: string) {
    const jobs = await this.list(pluginId);
    return Promise.all(jobs.filter(job => job.status === 'running').map(job => this.update(pluginId, job.id, { status: 'paused', currentStep: 'recovered-after-restart' })));
  }
}
