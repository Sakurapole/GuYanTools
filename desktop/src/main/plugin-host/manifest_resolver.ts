import fs from 'fs-extra';
import path from 'path';
import type {
  PluginManifest,
  PluginPermission,
  PluginRuntimeKind,
  PluginTrustLevel,
  ResolvedPluginEntryPaths,
} from '@/contracts/plugin_host';

const DEFAULT_PLUGIN_API_VERSION = '1.0.0';
const DEFAULT_HOST_VERSION_RANGE = '>=1.0.0';

type PackageJsonLike = {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  guyanToolsPlugin?: Partial<PluginManifest> & { entry?: string | PluginManifest['entry'] };
};

function ensureArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

const VALID_PERMISSIONS = new Set<PluginPermission>([
  'workspace.read',
  'data.user.read',
  'data.project.read',
  'data.project.write',
  'data.settings.read',
  'data.settings.write',
  'storage.self',
  'navigation.open',
  'ui.contribute',
  'commands.execute',
  'system.dialog',
  'system.clipboard',
  'system.notifications',
  'system.shortcuts',
  'background.run',
  'network.fetch',
  'downloads.manage',
  'jobs.manage',
  'files.read',
  'files.write',
  'tools.ffmpeg',
  'media.preview',
  'media.transcode',
  'media.tag',
  'secrets.self',
  'observability.logs',
]);

const VALID_CAPABILITY_KINDS = new Set(['media-source', 'metadata-provider', 'transformer', 'importer']);

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

export function validatePluginManifest(input: unknown): asserts input is PluginManifest {
  if (!input || typeof input !== 'object') {
    fail('PLUGIN_MANIFEST_INVALID', 'manifest must be an object');
  }

  const manifest = input as Partial<PluginManifest>;
  if (typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(manifest.id)) {
    fail('PLUGIN_MANIFEST_INVALID', 'id must contain lowercase letters, numbers, dots, or hyphens');
  }

  if (manifest.trustLevel !== 'sandboxed') {
    fail('PLUGIN_TRUST_UNSUPPORTED', 'market plugins must use sandboxed trust level');
  }

  if (manifest.schemaVersion !== '1.0' || typeof manifest.version !== 'string') {
    fail('PLUGIN_MANIFEST_INVALID', 'schemaVersion and version are required');
  }

  if (!Array.isArray(manifest.permissions) || manifest.permissions.some(permission => !VALID_PERMISSIONS.has(permission as PluginPermission))) {
    fail('PLUGIN_PERMISSION_UNKNOWN', 'permissions must use the host allowlist');
  }

  if (!Array.isArray(manifest.capabilities)) {
    fail('PLUGIN_CAPABILITIES_REQUIRED', 'capabilities must be declared separately from permissions');
  }

  const capabilityIds = new Set<string>();
  for (const capability of manifest.capabilities) {
    if (!capability || typeof capability !== 'object' || typeof capability.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(capability.id)) {
      fail('PLUGIN_CAPABILITY_INVALID', 'capability id is invalid');
    }
    if (capabilityIds.has(capability.id)) {
      fail('PLUGIN_CAPABILITY_INVALID', `duplicate capability id: ${capability.id}`);
    }
    capabilityIds.add(capability.id);
    if (!VALID_CAPABILITY_KINDS.has(capability.kind) || !Array.isArray(capability.operations) || capability.operations.length === 0 || capability.operations.some(operation => typeof operation !== 'string' || operation.length === 0)) {
      fail('PLUGIN_CAPABILITY_INVALID', `capability ${capability.id} has invalid kind or operations`);
    }
    if (capability.match !== undefined) {
      const match = capability.match;
      if (!match || typeof match !== 'object') {
        fail('PLUGIN_CAPABILITY_INVALID', `capability ${capability.id} has an invalid match`);
      }
      if (match.hosts !== undefined && (!Array.isArray(match.hosts) || match.hosts.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)))) {
        fail('PLUGIN_CAPABILITY_INVALID', `capability ${capability.id} has invalid host matches`);
      }
      if (match.schemes !== undefined && (!Array.isArray(match.schemes) || match.schemes.some(scheme => typeof scheme !== 'string' || !/^[a-z][a-z0-9+.-]*$/i.test(scheme)))) {
        fail('PLUGIN_CAPABILITY_INVALID', `capability ${capability.id} has invalid scheme matches`);
      }
      if (match.mimeTypes !== undefined && (!Array.isArray(match.mimeTypes) || match.mimeTypes.some(mimeType => typeof mimeType !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)))) {
        fail('PLUGIN_CAPABILITY_INVALID', `capability ${capability.id} has invalid mime type matches`);
      }
    }
  }

  const entry = manifest.entry;
  if (!entry || typeof entry !== 'object') {
    fail('PLUGIN_ENTRY_INVALID', 'entry must declare ui and/or worker paths');
  }
  if (manifest.runtime === 'ui' && typeof entry.ui !== 'string') {
    fail('PLUGIN_ENTRY_INVALID', 'ui runtime requires entry.ui');
  }
  if (manifest.runtime === 'worker' && typeof entry.worker !== 'string') {
    fail('PLUGIN_ENTRY_INVALID', 'worker runtime requires entry.worker');
  }
  if (manifest.runtime === 'hybrid' && (typeof entry.ui !== 'string' || typeof entry.worker !== 'string')) {
    fail('PLUGIN_ENTRY_INVALID', 'hybrid runtime requires entry.ui and entry.worker');
  }
  if (!['ui', 'worker', 'hybrid'].includes(manifest.runtime ?? '')) {
    fail('PLUGIN_RUNTIME_INVALID', 'runtime must be ui, worker, or hybrid');
  }
}

function normalizeEntry(input: Partial<PluginManifest> & { entry?: string | PluginManifest['entry'] }, packageJson?: PackageJsonLike): PluginManifest['entry'] {
  const rawEntry = input.entry ?? packageJson?.main ?? 'index.html';
  if (typeof rawEntry === 'string') {
    return { ui: rawEntry };
  }
  return rawEntry;
}

function toManifestShape(input: Partial<PluginManifest> & { entry?: string | PluginManifest['entry'] }, packageJson?: PackageJsonLike): PluginManifest {
  const name = input.name ?? packageJson?.name ?? input.id ?? 'unknown-plugin';
  const entry = normalizeEntry(input, packageJson);

  return {
    schemaVersion: '1.0',
    id: input.id ?? name,
    name,
    version: input.version ?? packageJson?.version ?? '0.0.0',
    displayName: input.displayName ?? name,
    description: input.description ?? packageJson?.description ?? '',
    pluginApiVersion: input.pluginApiVersion ?? DEFAULT_PLUGIN_API_VERSION,
    hostVersionRange: input.hostVersionRange ?? DEFAULT_HOST_VERSION_RANGE,
    trustLevel: (input.trustLevel ?? 'sandboxed') as PluginTrustLevel,
    runtime: (input.runtime ?? 'ui') as PluginRuntimeKind,
    entry,
    permissions: ensureArray(input.permissions) as PluginPermission[],
    capabilities: ensureArray(input.capabilities),
    contributes: input.contributes ?? {},
  };
}

export class PluginManifestResolver {
  async resolveFromDirectory(directoryPath: string): Promise<{ manifest: PluginManifest; resolvedEntryPaths: ResolvedPluginEntryPaths }> {
    const pluginJsonPath = path.join(directoryPath, 'guyantools.plugin.json');
    const legacyPluginJsonPath = path.join(directoryPath, 'plugin.json');
    const packageJsonPath = path.join(directoryPath, 'package.json');

    let manifestSource: Partial<PluginManifest> | null = null;
    let packageJson: PackageJsonLike | undefined;

    if (await fs.pathExists(pluginJsonPath)) {
      manifestSource = await fs.readJSON(pluginJsonPath);
    } else if (await fs.pathExists(legacyPluginJsonPath)) {
      manifestSource = await fs.readJSON(legacyPluginJsonPath);
    }

    if (await fs.pathExists(packageJsonPath)) {
      packageJson = await fs.readJSON(packageJsonPath);
      if (!manifestSource && packageJson.guyanToolsPlugin) {
        manifestSource = packageJson.guyanToolsPlugin;
      }
    }

    if (!manifestSource) {
      if (!packageJson) {
        throw new Error(`No plugin manifest found in ${directoryPath}`);
      }

      manifestSource = {
        id: packageJson.name,
        name: packageJson.name,
        version: packageJson.version,
        displayName: packageJson.name,
        description: packageJson.description,
        entry: { ui: packageJson.main ?? 'index.html' },
      };
    }

    const manifest = toManifestShape(manifestSource, packageJson);
    validatePluginManifest(manifest);
    const resolvedEntryPaths: ResolvedPluginEntryPaths = {};
    const rootPath = path.resolve(directoryPath);
    const rootPrefix = `${rootPath}${path.sep}`;
    for (const [kind, relativeEntry] of Object.entries(manifest.entry)) {
      if (!relativeEntry) {
        continue;
      }
      const resolvedEntryPath = path.resolve(rootPath, relativeEntry);
      if (resolvedEntryPath !== rootPath && !resolvedEntryPath.startsWith(rootPrefix)) {
        fail('PLUGIN_ENTRY_INVALID', `entry.${kind} escapes the plugin directory`);
      }
      if (!await fs.pathExists(resolvedEntryPath)) {
        throw new Error(`Plugin entry not found: ${resolvedEntryPath}`);
      }
      const entryStats = await fs.lstat(resolvedEntryPath);
      if (entryStats.isSymbolicLink()) {
        throw new Error(`Plugin entry must not be a symbolic link: ${resolvedEntryPath}`);
      }
      if (!entryStats.isFile()) {
        throw new Error(`Plugin entry is not a file: ${resolvedEntryPath}`);
      }
      resolvedEntryPaths[kind as keyof typeof resolvedEntryPaths] = resolvedEntryPath;
    }

    return { manifest, resolvedEntryPaths };
  }

  async resolveFromPath(inputPath: string) {
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      return this.resolveFromDirectory(inputPath);
    }

    if (!['guyantools.plugin.json', 'plugin.json'].includes(path.basename(inputPath))) {
      throw new Error('Local plugin input must be a plugin directory or guyantools.plugin.json');
    }

    return this.resolveFromDirectory(path.dirname(inputPath));
  }
}
