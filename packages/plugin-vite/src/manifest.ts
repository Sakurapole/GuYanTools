import fs from 'node:fs/promises';
import path from 'node:path';

const DEV_FIELDS = ['dev', 'devServer', 'uiUrl', 'workerUrl'] as const;

export function validateProductionManifest(
  manifest: unknown
): asserts manifest is Record<string, any> {
  if (!manifest || typeof manifest !== 'object')
    throw new Error('PLUGIN_MANIFEST_INVALID: manifest must be an object');
  const value = manifest as Record<string, any>;
  if (value.workerRuntime !== undefined && value.workerRuntime !== 'browser')
    throw new Error('PLUGIN_RUNTIME_INVALID: third-party workerRuntime must be browser');
  if (value.trustLevel !== undefined && value.trustLevel !== 'sandboxed')
    throw new Error('PLUGIN_TRUST_UNSUPPORTED: third-party plugins must be sandboxed');
  const allowedContributions = new Set([
    'pages', 'widgets', 'commands', 'menus', 'shortcuts', 'backgroundTasks',
  ]);
  if (value.contributes !== undefined) {
    if (!value.contributes || typeof value.contributes !== 'object' || Array.isArray(value.contributes))
      throw new Error('PLUGIN_CONTRIBUTION_INVALID: contributes must be an object');
    for (const key of Object.keys(value.contributes))
      if (!allowedContributions.has(key))
        throw new Error(`PLUGIN_CONTRIBUTION_INVALID: contributes.${key} is unsupported`);
    const commands = value.contributes.commands ?? [];
    if (!Array.isArray(commands)) throw new Error('PLUGIN_CONTRIBUTION_INVALID: commands must be an array');
    const commandIds = new Set<string>();
    for (const command of commands) {
      if (typeof command?.id !== 'string' || !command.id.startsWith(`${value.id}.`) || commandIds.has(command.id))
        throw new Error('PLUGIN_CONTRIBUTION_INVALID: invalid or duplicate command');
      commandIds.add(command.id);
    }
    for (const field of ['menus', 'shortcuts', 'backgroundTasks']) {
      const entries = value.contributes[field] ?? [];
      if (!Array.isArray(entries)) throw new Error(`PLUGIN_CONTRIBUTION_INVALID: ${field} must be an array`);
      const ids = new Set<string>();
      for (const entry of entries) {
        const id = entry?.id;
        const commandId = field === 'backgroundTasks' ? id : entry?.commandId;
        if (typeof id !== 'string' || ids.has(id) || !commandIds.has(commandId) ||
          (field === 'backgroundTasks' &&
            (typeof entry.schedule !== 'string' || !/^every:[1-9]\d*m$/.test(entry.schedule) || entry.event !== undefined)))
          throw new Error(`PLUGIN_CONTRIBUTION_INVALID: ${field} references an invalid command`);
        ids.add(id);
      }
    }
    if ((value.contributes.backgroundTasks?.length ?? 0) > 0 &&
      (!value.permissions?.includes('background.run') || !value.permissions?.includes('commands.execute')))
      throw new Error('PLUGIN_PERMISSION_INVALID: backgroundTasks require background.run and commands.execute');
  }
  for (const field of DEV_FIELDS)
    if (field in value)
      throw new Error(`PLUGIN_MANIFEST_DEV_FIELD: ${field} is not allowed in production`);
  if (!value.entry || typeof value.entry !== 'object')
    throw new Error('PLUGIN_ENTRY_INVALID: manifest entry is required');
  for (const [kind, entry] of Object.entries(value.entry)) {
    if (typeof entry !== 'string' || path.isAbsolute(entry) || path.win32.isAbsolute(entry) ||
      entry.split(/[\\/]/).includes('..') || /^[a-z][a-z\d+.-]*:/i.test(entry))
      throw new Error(`PLUGIN_ENTRY_INVALID: entry.${kind} must be relative`);
  }
  if (value.entry.worker !== undefined && !/\.html?$/i.test(value.entry.worker))
    throw new Error('PLUGIN_ENTRY_INVALID: entry.worker must be HTML');
}

export async function copyProductionManifest(
  manifestPath: string | undefined,
  outDir: string,
  entries: { ui?: string; worker?: string }
) {
  if (!manifestPath) return;
  const input = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, any>;
  validateProductionManifest(input);
  const output = {
    ...input,
    entry: {
      ...(input.entry ?? {}),
      ...(entries.ui ? { ui: entries.ui } : {}),
      ...(entries.worker ? { worker: entries.worker } : {}),
    },
  };
  await fs.writeFile(
    path.join(outDir, 'guyantools.plugin.json'),
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8'
  );
}
