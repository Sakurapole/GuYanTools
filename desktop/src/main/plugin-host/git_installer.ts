import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type GitCommandRunner = (args: string[], cwd?: string) => Promise<string>;

export interface GitInstallInput {
  url: string;
  destination: string;
  ref?: string;
  refType?: 'branch' | 'tag' | 'commit';
}

export interface GitInstallResult {
  resolvedCommit: string;
  packageSha256: string;
}

async function hashDirectory(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  files.sort();
  const digest = crypto.createHash('sha256');
  for (const file of files) {
    digest.update(path.relative(root, file).replaceAll(path.sep, '/'));
    digest.update('\0');
    digest.update(await fs.readFile(file));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function runGitCommand(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`PLUGIN_GIT_FAILED: ${stderr.trim() || `git exited with code ${code}`}`));
    });
  });
}

function validateGitUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('PLUGIN_GIT_URL_INVALID: repository URL is not valid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('PLUGIN_GIT_URL_INVALID: repository URL must be an HTTPS URL without credentials');
  }
}

export class GitPluginInstaller {
  constructor(
    private readonly runGit: GitCommandRunner = runGitCommand,
    private readonly hash = hashDirectory,
  ) {}

  async install(input: GitInstallInput): Promise<GitInstallResult> {
    validateGitUrl(input.url);
    if (input.refType && !input.ref) {
      throw new Error('PLUGIN_GIT_REF_INVALID: ref is required when refType is provided');
    }

    await this.runGit(['clone', '--depth', '1', input.url, input.destination]);

    if (input.ref) {
      const refType = input.refType ?? 'commit';
      if (!['branch', 'tag', 'commit'].includes(refType)) {
        throw new Error(`PLUGIN_GIT_REF_INVALID: unsupported ref type ${refType}`);
      }
      const fetchArgs = refType === 'commit'
        ? ['fetch', '--depth', '1', 'origin', input.ref]
        : ['fetch', '--depth', '1', 'origin', `refs/${refType === 'branch' ? 'heads' : 'tags'}/${input.ref}`];
      await this.runGit(fetchArgs, input.destination);
      await this.runGit(['checkout', '--detach', refType === 'branch' ? 'FETCH_HEAD' : input.ref], input.destination);
    }

    const resolvedCommit = (await this.runGit(['rev-parse', 'HEAD'], input.destination)).trim();
    if (!/^[0-9a-f]{7,64}$/i.test(resolvedCommit)) {
      throw new Error('PLUGIN_GIT_COMMIT_INVALID: git did not return a commit hash');
    }
    return { resolvedCommit, packageSha256: await this.hash(input.destination) };
  }
}
