import { describe, expect, it } from 'vitest';
import { PluginContextGuard, type PluginAuditEvent } from './context_guard';

const context = { pluginId: 'guyantools.example', runtime: 'worker', trustLevel: 'sandboxed', permissions: ['jobs.manage'] } as any;

describe('PluginContextGuard', () => {
  it('audits allowed, denied, and ownership checks', () => {
    const events: PluginAuditEvent[] = [];
    const guard = new PluginContextGuard(event => events.push(event));
    guard.requirePermission(context, 'jobs.manage');
    expect(() => guard.requirePermission(context, 'files.read')).toThrow('PLUGIN_PERMISSION_DENIED');
    expect(() => guard.requireOwner(context, 'other.plugin')).toThrow('PLUGIN_OWNER_MISMATCH');
    expect(events.map(event => event.result)).toEqual(['allowed', 'denied', 'denied']);
    expect(events.every(event => event.runtime === 'worker')).toBe(true);
  });
});
