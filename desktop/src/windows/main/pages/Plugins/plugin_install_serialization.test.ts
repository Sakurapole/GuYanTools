import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import type { PluginPermission } from '@/contracts/plugin_host';
import { serializeApprovedPermissions } from './plugin_install_serialization';

describe('plugin install IPC payloads', () => {
  it('converts reactive permission arrays into structured-cloneable arrays', () => {
    const reactivePermissions = reactive<PluginPermission[]>(['network.fetch', 'downloads.manage']);

    expect(() => structuredClone(reactivePermissions)).toThrow();

    const serialized = serializeApprovedPermissions(reactivePermissions);
    expect(serialized).toEqual(['network.fetch', 'downloads.manage']);
    expect(() => structuredClone(serialized)).not.toThrow();
  });
});
