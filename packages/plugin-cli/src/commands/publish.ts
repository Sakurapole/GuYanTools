import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validatePlugin } from './validate.js';
import { packPlugin } from './pack.js';
import { createCatalogEntry } from '../publish/catalog_entry.js';
import { displayCommand, ensureGitHubCredentials, processCommandExecutor } from '../publish/github_release.js';
import { plannedMarketplaceCommands, updateMarketplaceCatalog } from '../publish/marketplace.js';
import type { CommandExecutor, CommandSpec, PackedPlugin, PublishConfig, PublishResult } from '../publish/publish_config.js';

export interface PublishOptions {
  config: PublishConfig;
  dryRun?: boolean;
  noPush?: boolean;
  catalogMode?: 'pull-request' | 'direct';
  executor?: CommandExecutor;
  pack?: (rootPath: string) => Promise<PackedPlugin>;
  catalogWorkspace?: string;
}

export async function publish(options: PublishOptions): Promise<PublishResult> {
  const rootPath = path.resolve(options.config.rootPath ?? process.cwd());
  const config = { ...options.config, catalogMode: options.catalogMode ?? options.config.catalogMode };
  if (config.catalogMode === 'direct' && !config.allowDirectPublish) throw new Error('PLUGIN_PUBLISH_DIRECT_CONFIRMATION_REQUIRED');
  if (!isHttpsUrl(config.repository)) throw new Error('PLUGIN_PUBLISH_CONFIG_INVALID: repository must be https');
  if (!config.marketplace) throw new Error('PLUGIN_PUBLISH_CONFIG_INVALID: marketplace is required');

  const manifest = await validatePlugin(rootPath);
  const tag = `v${stringValue(manifest, 'version')}`;
  const packed = await (options.pack ?? packPlugin)(rootPath);
  const executor = options.executor ?? processCommandExecutor;
  const commandPlan: string[] = [];
  const run = async (command: CommandSpec) => {
    commandPlan.push(displayCommand(command));
    if (!options.dryRun) return executor.run(command);
    return { stdout: '', stderr: '' };
  };
  if (!options.dryRun) {
    if (await ensureGitHubCredentials(executor) === 'gh') commandPlan.push(displayCommand({ command: 'gh', args: ['auth', 'status'] }));
  }
  const resolvedCommit = options.dryRun ? 'HEAD' : (await run({ command: 'git', args: ['rev-parse', 'HEAD'], cwd: rootPath })).stdout.trim();
  const catalogEntry = createCatalogEntry(manifest, config.repository, tag, resolvedCommit);

  if (options.dryRun) {
    commandPlan.push(displayCommand({ command: 'git', args: ['tag', '-a', tag, '-m', `Release ${tag}`], cwd: rootPath }));
    if (!options.noPush) {
      commandPlan.push(displayCommand({ command: 'git', args: ['push', 'origin', tag], cwd: rootPath }));
      if (config.releaseAsset) commandPlan.push(displayCommand({ command: 'gh', args: ['release', 'create', tag, packed.archive, '--title', tag], cwd: rootPath }));
      commandPlan.push(...plannedMarketplaceCommands({ ...config, catalogEntry }));
    }
    return { tag, releaseAssetPath: packed.archive, sha256: packed.sha256, catalogEntry, commands: commandPlan };
  }

  await run({ command: 'git', args: ['tag', '-a', tag, '-m', `Release ${tag}`], cwd: rootPath });
  if (options.noPush) return { tag, releaseAssetPath: packed.archive, sha256: packed.sha256, catalogEntry, commands: commandPlan };

  await run({ command: 'git', args: ['push', 'origin', tag], cwd: rootPath });
  if (config.releaseAsset) await run({ command: 'gh', args: ['release', 'create', tag, packed.archive, '--title', tag], cwd: rootPath });
  const providedWorkspace = options.catalogWorkspace;
  const workspace = providedWorkspace ?? await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-marketplace-'));
  try {
    const marketplace = await updateMarketplaceCatalog({
      catalogRepository: config.catalogRepository,
      catalogBranch: config.catalogBranch,
      catalogMode: config.catalogMode,
      marketplaceId: config.marketplace,
      catalogEntry,
      workspace,
      executor,
      run,
    });
    return { tag, releaseAssetPath: packed.archive, sha256: packed.sha256, catalogEntry, commands: commandPlan, marketplace };
  } finally {
    if (!providedWorkspace) await fs.rm(workspace, { recursive: true, force: true });
  }
}

function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function stringValue(manifest: Record<string, unknown>, key: string): string {
  const value = manifest[key];
  if (typeof value !== 'string' || !value) throw new Error(`PLUGIN_PUBLISH_MANIFEST_INVALID: ${key} is required`);
  return value;
}

export async function readPublishConfig(rootPath = process.cwd()): Promise<PublishConfig> {
  return JSON.parse(await fs.readFile(path.join(rootPath, '.guyantools', 'publish.json'), 'utf8')) as PublishConfig;
}
