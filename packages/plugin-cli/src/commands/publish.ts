import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { validatePlugin } from './validate.js';
import { createCatalogEntry } from '../publish/catalog_entry.js';
import { runGitHubRelease } from '../publish/github_release.js';
import type { PublishConfig, PublishResult } from '../publish/publish_config.js';

export async function publish(options: { config: PublishConfig; dryRun?: boolean }): Promise<PublishResult> {
  const rootPath = path.resolve(options.config.rootPath ?? process.cwd());
  const manifest = await validatePlugin(rootPath);
  if (!options.config.repository.startsWith('https://')) throw new Error('PLUGIN_PUBLISH_CONFIG_INVALID: repository must be https');
  if (!options.config.marketplace) throw new Error('PLUGIN_PUBLISH_CONFIG_INVALID: marketplace is required');
  const tag = `v${manifest.version}`;
  const resolvedCommit = await gitCommit(rootPath, options.dryRun === true);
  const catalogEntry = createCatalogEntry(manifest, options.config.repository, tag, resolvedCommit);
  const releaseAssetPath = path.join(rootPath, `${manifest.id}-${manifest.version}.zip`);
  const noPush = process.argv.includes('--no-push');
  const commands = [`git tag ${tag}`];
  if (!noPush) commands.push(`git push origin ${tag}`);
  if (options.config.releaseAsset) commands.push(`gh release create ${tag} ${releaseAssetPath} --title ${tag}`);
  commands.push(options.config.catalogMode === 'pull-request' ? `gh pr create --title Publish-${manifest.id}-${manifest.version}` : `gh api repos/${options.config.marketplace}/contents/catalog.json`);
  if (options.config.catalogRepository) commands.push(`git clone ${options.config.catalogRepository} .guyantools/catalog-worktree`);
  await runGitHubRelease(commands, options.dryRun === true, rootPath);
  return { tag, releaseAssetPath, catalogEntry, commands };
}

async function gitCommit(rootPath: string, dryRun: boolean) {
  if (dryRun) return 'HEAD';
  return new Promise<string>((resolve, reject) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd: rootPath, shell: false }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
  });
}

export async function readPublishConfig(rootPath = process.cwd()): Promise<PublishConfig> {
  return JSON.parse(await fs.readFile(path.join(rootPath, '.guyantools', 'publish.json'), 'utf8')) as PublishConfig;
}
