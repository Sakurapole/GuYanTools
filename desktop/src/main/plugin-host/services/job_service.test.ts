import { describe, expect, it } from 'vitest';
import { JobService } from './job_service';

describe('JobService', () => {
  it('does not allow a plugin to update another plugin job', async () => {
    const records = new Map<string, any>([['job-1', { id: 'job-1', pluginId: 'plugin.one' }]]);
    const db = {
      createPluginJob: async (input: any) => input,
      listPluginJobs: async (pluginId: string) => Array.from(records.values()).filter(job => job.pluginId === pluginId),
      getPluginJob: async (id: string) => records.get(id) ?? null,
      updatePluginJob: async (id: string, input: any) => ({ ...records.get(id), ...input }),
      retryPluginJob: async (sourceId: string, newId: string) => ({ ...records.get(sourceId), id: newId, parentJobId: sourceId }),
    };
    const service = new JobService(db);
    await expect(service.update('plugin.two', 'job-1', { status: 'cancelled' })).rejects.toThrow('PLUGIN_JOB_OWNER_MISMATCH');
    const events: any[] = [];
    const unsubscribe = service.onEvent('plugin.one', job => events.push(job));
    const cancelled = await service.cancel('plugin.one', 'job-1');
    expect(cancelled.status).toBe('cancelled');
    const retry = await service.retry('plugin.one', 'job-1');
    expect(retry.parentJobId).toBe('job-1');
    expect(events).toHaveLength(2);
    unsubscribe();
  });

  it('recovers running jobs as paused after a restart', async () => {
    const records = new Map<string, any>([['job-running', { id: 'job-running', pluginId: 'plugin.one', status: 'running' }]]);
    const db = {
      listPluginJobs: async (pluginId: string) => Array.from(records.values()).filter(job => job.pluginId === pluginId),
      getPluginJob: async (id: string) => records.get(id) ?? null,
      updatePluginJob: async (id: string, input: any) => { const next = { ...records.get(id), ...input }; records.set(id, next); return next; },
    };
    const recovered = await new JobService(db as any).recoverRunning('plugin.one');
    expect(recovered).toEqual([expect.objectContaining({ id: 'job-running', status: 'paused', currentStep: 'recovered-after-restart' })]);
  });
});
