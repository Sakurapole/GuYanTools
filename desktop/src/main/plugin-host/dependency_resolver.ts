import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import { PluginApiError } from './plugin_api_error';
import type { CapabilityRouter } from './capability_router';

export interface PluginCapabilityDependency {
  capability: string;
  optional?: boolean;
}

export function validateDependencyDeclarations(dependencies: PluginCapabilityDependency[]) {
  for (const dependency of dependencies) {
    if (!dependency || typeof dependency.capability !== 'string' || !/^[a-z0-9][a-z0-9.-]*(\.[a-z0-9][a-z0-9-]*)?$/i.test(dependency.capability)) {
      throw new Error(`PLUGIN_DEPENDENCY_INVALID: ${String(dependency?.capability)}`);
    }
  }
}

/**
 * Resolves whether a plugin's declared capability dependencies are currently provided
 * by other enabled plugins.
 */
export function resolvePluginDependencies(
  record: Pick<InstalledPluginRecord, 'manifest'>,
  capabilityRouter: CapabilityRouter,
): { satisfied: boolean; missing: PluginCapabilityDependency[]; resolved: Array<{ dependency: string; providerPluginId: string; qualifiedId: string }> } {
  const dependencies = record.manifest.dependencies ?? [];
  const missing: PluginCapabilityDependency[] = [];
  const resolved: Array<{ dependency: string; providerPluginId: string; qualifiedId: string }> = [];
  const registered = capabilityRouter.list();

  for (const dependency of dependencies) {
    const qualified = registered.find(capability =>
      capability.qualifiedId === dependency.capability
      || capability.id === dependency.capability
      || capability.qualifiedId.endsWith(`.${dependency.capability}`),
    );
    if (qualified && qualified.pluginId !== record.manifest.id) {
      resolved.push({
        dependency: dependency.capability,
        providerPluginId: qualified.pluginId,
        qualifiedId: qualified.qualifiedId,
      });
      continue;
    }
    if (!dependency.optional) {
      missing.push(dependency);
    }
  }

  return {
    satisfied: missing.length === 0,
    missing,
    resolved,
  };
}

export function assertPluginDependencies(record: Pick<InstalledPluginRecord, 'manifest'>, capabilityRouter: CapabilityRouter) {
  const result = resolvePluginDependencies(record, capabilityRouter);
  if (!result.satisfied) {
    const names = result.missing.map(item => item.capability).join(', ');
    throw new PluginApiError('INCOMPATIBLE_HOST', `PLUGIN_DEPENDENCY_MISSING: ${names}`);
  }
  return result;
}
