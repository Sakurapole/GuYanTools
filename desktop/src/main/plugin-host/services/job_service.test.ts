import { describe, expect, it } from 'vitest';
import { JobService } from './job_service';
import { PluginQuotaService } from '../quota';

describe('JobService', () => {
  it('does not allow a plugin to update another plugin job', async () => {
    const records = new Map<string, any>([['job-1', { id: 'job-1', pluginId: 'plugin.one' }]]);
    const db = {
      createPluginJob: async (input: any) => input,
      listPluginJobs: async (pluginId: string) =>
        Array.from(records.values()).filter((job) => job.pluginId === pluginId),
      getPluginJob: async (id: string) => records.get(id) ?? null,
      updatePluginJob: async (id: string, input: any) => ({ ...records.get(id), ...input }),
      retryPluginJob: async (sourceId: string, newId: string) => ({
        ...records.get(sourceId),
        id: newId,
        parentJobId: sourceId,
      }),
    };
    const service = new JobService(db);
    await expect(service.update('plugin.two', 'job-1', { status: 'cancelled' })).rejects.toThrow(
      'PLUGIN_JOB_OWNER_MISMATCH'
    );
    const events: any[] = [];
    const unsubscribe = service.onEvent('plugin.one', (job) => events.push(job));
    const cancelled = await service.cancel('plugin.one', 'job-1');
    expect(cancelled.status).toBe('cancelled');
    const retry = await service.retry('plugin.one', 'job-1');
    expect(retry.parentJobId).toBe('job-1');
    expect(events).toHaveLength(2);
    unsubscribe();
  });

  it('recovers running jobs as paused after a restart', async () => {
    const records = new Map<string, any>([
      ['job-running', { id: 'job-running', pluginId: 'plugin.one', status: 'running' }],
    ]);
    const db = {
      listPluginJobs: async (pluginId: string) =>
        Array.from(records.values()).filter((job) => job.pluginId === pluginId),
      getPluginJob: async (id: string) => records.get(id) ?? null,
      updatePluginJob: async (id: string, input: any) => {
        const next = { ...records.get(id), ...input };
        records.set(id, next);
        return next;
      },
    };
    const recovered = await new JobService(db as any).recoverRunning('plugin.one');
    expect(recovered).toEqual([
      expect.objectContaining({
        id: 'job-running',
        status: 'paused',
        currentStep: 'recovered-after-restart',
      }),
    ]);
  });

  it.each(['completed', 'failed', 'cancelled', 'paused'])('releases quota on %s', async (status) => {
    const records = new Map<string, any>([
      ['job-1', { id: 'job-1', pluginId: 'plugin.one', status: 'running' }],
    ]);
    const db = {
      getPluginJob: async (id: string) => records.get(id) ?? null,
      updatePluginJob: async (id: string, input: any) => {
        const next = { ...records.get(id), ...input };
        records.set(id, next);
        return next;
      },
    };
    const quota = new PluginQuotaService({ jobConcurrency: 1 });
    quota.tryAcquireJobSlot('plugin.one');
    quota.trackJobSlot('plugin.one', 'job-1');
    const service = new JobService(db as any, quota);

    await service.update('plugin.one', 'job-1', { status });
    await service.update('plugin.one', 'job-1', { status });

    expect(quota.tryAcquireJobSlot('plugin.one')).toBe(true);
    expect(quota.tryAcquireJobSlot('plugin.one')).toBe(false);
  });

  it('releases a quota slot when job creation fails', async () => {
    const quota = new PluginQuotaService({ jobConcurrency: 1 });
    const service = new JobService(
      { createPluginJob: async () => { throw new Error('database unavailable'); } } as any,
      quota
    );

    await expect(service.create('plugin.one', 'test', {})).rejects.toThrow('database unavailable');
    expect(quota.tryAcquireJobSlot('plugin.one')).toBe(true);
  });

  it('limits jobs through the shared service quota', async () => {
    const quota = new PluginQuotaService({ jobConcurrency: 1 });
    const db = {
      createPluginJob: async (input: any) => ({ ...input, status: 'queued' }),
    };
    const service = new JobService(db as any, quota);
    await service.create('plugin.one', 'test', {});
    await expect(service.create('plugin.one', 'test', {})).rejects.toThrow('PLUGIN_JOB_QUOTA');
  });

  it('reacquires a quota slot before resuming a paused job', async () => {
    const records = new Map<string, any>([
      ['paused', { id: 'paused', pluginId: 'plugin.one', status: 'paused' }],
    ]);
    const db = {
      getPluginJob: async (id: string) => records.get(id) ?? null,
      updatePluginJob: async (id: string, input: any) => {
        const next = { ...records.get(id), ...input };
        records.set(id, next);
        return next;
      },
    };
    const quota = new PluginQuotaService({ jobConcurrency: 1 });
    const service = new JobService(db as any, quota);

    await service.update('plugin.one', 'paused', { status: 'running' });
    expect(quota.tryAcquireJobSlot('plugin.one')).toBe(false);
    await service.update('plugin.one', 'paused', { status: 'paused' });
    expect(quota.tryAcquireJobSlot('plugin.one')).toBe(true);
  });

  it('keeps a paused job paused when its resume slot is unavailable', async () => {
    const record = { id: 'paused', pluginId: 'plugin.one', status: 'paused' };
    const updatePluginJob = async (_id: string, input: any) => ({ ...record, ...input });
    const quota = new PluginQuotaService({ jobConcurrency: 1 });
    quota.tryAcquireJobSlot('plugin.one');
    const service = new JobService({ getPluginJob: async () => record, updatePluginJob } as any, quota);

    await expect(service.update('plugin.one', 'paused', { status: 'running' })).rejects.toThrow('PLUGIN_JOB_QUOTA');
    expect(record.status).toBe('paused');
    expect(quota.tryAcquireJobSlot('plugin.one')).toBe(false);
  });
});
