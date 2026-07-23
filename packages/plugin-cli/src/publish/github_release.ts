import { execFile } from 'node:child_process';

export async function runGitHubRelease(commands: string[], dryRun: boolean, cwd = process.cwd()) {
  if (dryRun) return;
  if (!process.env.GH_TOKEN) throw new Error('PLUGIN_PUBLISH_CREDENTIALS_MISSING: set GH_TOKEN or authenticate gh');
  for (const command of commands) {
    if (!command.startsWith('gh ') && !command.startsWith('git ')) continue;
    await new Promise<void>((resolve, reject) => {
      const [binary, ...args] = command.split(' ').filter(Boolean);
      const child = execFile(binary, args, { shell: false, cwd });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`PLUGIN_PUBLISH_COMMAND_FAILED: ${code}`)));
    });
  }
}
