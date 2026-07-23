import { execFile } from 'node:child_process';

export async function runGitHubRelease(commands: string[], dryRun: boolean) {
  if (dryRun) return;
  if (!process.env.GH_TOKEN) throw new Error('PLUGIN_PUBLISH_CREDENTIALS_MISSING: set GH_TOKEN or authenticate gh');
  for (const command of commands) {
    if (!command.startsWith('gh ')) continue;
    await new Promise<void>((resolve, reject) => {
      const args = command.slice(3).split(' ').filter(Boolean);
      const child = execFile('gh', args, { shell: false });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`PLUGIN_PUBLISH_COMMAND_FAILED: ${code}`)));
    });
  }
}
