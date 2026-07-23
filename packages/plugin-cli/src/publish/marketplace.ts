import fs from 'node:fs/promises';
import path from 'node:path';
import { displayCommand } from './github_release.js';
import type { CommandExecutor, CommandResult, CommandSpec, MarketplaceCatalogEntry, MarketplacePublishResult } from './publish_config.js';

const DEFAULT_CATALOG_REPOSITORY = 'Sakurapole/guyantools-plugin-marketplace';

interface MarketplaceCatalog {
  schemaVersion: '1.0';
  marketplaceId: string;
  name: string;
  plugins: MarketplaceCatalogEntry[];
  generatedAt?: string;
}

export interface MarketplaceUpdateOptions {
  catalogRepository?: string;
  catalogBranch?: string;
  catalogMode: 'pull-request' | 'direct';
  marketplaceId: string;
  catalogEntry: MarketplaceCatalogEntry;
  workspace: string;
  executor: CommandExecutor;
  run(command: CommandSpec): Promise<CommandResult>;
}

export async function updateMarketplaceCatalog(options: MarketplaceUpdateOptions): Promise<MarketplacePublishResult> {
  const repository = normalizeRepository(options.catalogRepository ?? DEFAULT_CATALOG_REPOSITORY);
  const branch = options.catalogBranch ?? 'main';
  await options.run({ command: 'gh', args: ['repo', 'clone', repository, options.workspace, '--', '--branch', branch, '--single-branch'] });
  const catalogPath = path.join(options.workspace, 'catalog.json');
  const catalog = validateCatalog(JSON.parse(await fs.readFile(catalogPath, 'utf8')));
  if (catalog.marketplaceId !== options.marketplaceId) throw new Error('PLUGIN_PUBLISH_CATALOG_MISMATCH: marketplace id does not match catalog');

  if (options.catalogMode === 'direct') {
    const permissions = await options.run({ command: 'gh', args: ['api', `repos/${repository}`, '--jq', '.permissions.push'] });
    if (permissions.stdout.trim() !== 'true') throw new Error('PLUGIN_PUBLISH_CATALOG_WRITE_DENIED: direct publication requires repository push permission');
  }

  const index = catalog.plugins.findIndex(plugin => plugin.id === options.catalogEntry.id);
  if (index === -1) catalog.plugins.push(options.catalogEntry);
  else catalog.plugins[index] = options.catalogEntry;
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  if (options.catalogMode === 'direct') {
    await options.run({ command: 'git', args: ['add', 'catalog.json'], cwd: options.workspace });
    await options.run({ command: 'git', args: ['commit', '-m', `Publish ${options.catalogEntry.id} ${options.catalogEntry.version}`], cwd: options.workspace });
    await options.run({ command: 'git', args: ['push', 'origin', branch], cwd: options.workspace });
    return { repository, branch, mode: 'direct' };
  }

  const publishBranch = `publish/${options.catalogEntry.id}-v${options.catalogEntry.version}`.replace(/[^A-Za-z0-9._/-]/gu, '-');
  await options.run({ command: 'git', args: ['checkout', '-b', publishBranch], cwd: options.workspace });
  await options.run({ command: 'git', args: ['add', 'catalog.json'], cwd: options.workspace });
  await options.run({ command: 'git', args: ['commit', '-m', `Publish ${options.catalogEntry.id} ${options.catalogEntry.version}`], cwd: options.workspace });
  await options.run({ command: 'git', args: ['push', '--set-upstream', 'origin', publishBranch], cwd: options.workspace });
  await options.run({ command: 'gh', args: ['pr', 'create', '--repo', repository, '--base', branch, '--head', publishBranch, '--title', `Publish ${options.catalogEntry.id} ${options.catalogEntry.version}`, '--body', `Publish ${options.catalogEntry.id} ${options.catalogEntry.version}.`], cwd: options.workspace });
  return { repository, branch: publishBranch, mode: 'pull-request' };
}

export function validateCatalog(value: unknown): MarketplaceCatalog {
  if (!value || typeof value !== 'object') throw new Error('PLUGIN_PUBLISH_CATALOG_INVALID: catalog must be an object');
  const catalog = value as Partial<MarketplaceCatalog>;
  if (catalog.schemaVersion !== '1.0' || typeof catalog.marketplaceId !== 'string' || typeof catalog.name !== 'string' || !Array.isArray(catalog.plugins)) {
    throw new Error('PLUGIN_PUBLISH_CATALOG_INVALID: catalog schema is invalid');
  }
  for (const plugin of catalog.plugins) {
    if (!plugin || typeof plugin.id !== 'string' || typeof plugin.name !== 'string' || typeof plugin.version !== 'string' || typeof plugin.repository !== 'string' || !['branch', 'tag', 'commit'].includes(plugin.refType ?? '') || typeof plugin.ref !== 'string' || !/^[0-9a-f]{7,64}$/iu.test(plugin.resolvedCommit) || !Array.isArray(plugin.permissions) || !Array.isArray(plugin.capabilities)) {
      throw new Error('PLUGIN_PUBLISH_CATALOG_INVALID: plugin entry is invalid');
    }
  }
  return catalog as MarketplaceCatalog;
}

export function plannedMarketplaceCommands(options: Pick<MarketplaceUpdateOptions, 'catalogRepository' | 'catalogBranch' | 'catalogMode' | 'catalogEntry'>): string[] {
  const repository = normalizeRepository(options.catalogRepository ?? DEFAULT_CATALOG_REPOSITORY);
  const branch = options.catalogBranch ?? 'main';
  const workspace = '<catalog-workspace>';
  const commitMessage = `Publish ${options.catalogEntry.id} ${options.catalogEntry.version}`;
  const commands = [displayCommand({ command: 'gh', args: ['repo', 'clone', repository, workspace, '--', '--branch', branch, '--single-branch'] })];
  if (options.catalogMode === 'direct') {
    commands.push(displayCommand({ command: 'gh', args: ['api', `repos/${repository}`, '--jq', '.permissions.push'] }));
    commands.push(displayCommand({ command: 'git', args: ['add', 'catalog.json'], cwd: workspace }));
    commands.push(displayCommand({ command: 'git', args: ['commit', '-m', commitMessage], cwd: workspace }));
    commands.push(displayCommand({ command: 'git', args: ['push', 'origin', branch], cwd: workspace }));
    return commands;
  }
  const publishBranch = `publish/${options.catalogEntry.id}-v${options.catalogEntry.version}`.replace(/[^A-Za-z0-9._/-]/gu, '-');
  commands.push(displayCommand({ command: 'git', args: ['checkout', '-b', publishBranch], cwd: workspace }));
  commands.push(displayCommand({ command: 'git', args: ['add', 'catalog.json'], cwd: workspace }));
  commands.push(displayCommand({ command: 'git', args: ['commit', '-m', commitMessage], cwd: workspace }));
  commands.push(displayCommand({ command: 'git', args: ['push', '--set-upstream', 'origin', publishBranch], cwd: workspace }));
  commands.push(displayCommand({ command: 'gh', args: ['pr', 'create', '--repo', repository, '--base', branch, '--head', publishBranch, '--title', commitMessage, '--body', `${commitMessage}.`], cwd: workspace }));
  return commands;
}

function normalizeRepository(value: string): string {
  const url = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/iu.exec(value);
  const normalized = url ? `${url[1]}/${url[2]}` : value;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(normalized)) throw new Error('PLUGIN_PUBLISH_CONFIG_INVALID: catalogRepository must be a GitHub repository');
  return normalized;
}
