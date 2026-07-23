import { spawn } from 'node:child_process';
import type { CommandExecutor, CommandResult, CommandSpec } from './publish_config.js';

export const processCommandExecutor: CommandExecutor = {
  run(command) {
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command.command, command.args, { cwd: command.cwd, shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });
      child.once('error', error => reject(new Error(`PLUGIN_PUBLISH_COMMAND_FAILED: ${displayCommand(command)}: ${error.message}`)));
      child.once('close', code => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`PLUGIN_PUBLISH_COMMAND_FAILED: ${displayCommand(command)} (${code ?? 'unknown'}): ${stderr || stdout}`.trim()));
      });
    });
  },
};

export async function ensureGitHubCredentials(executor: CommandExecutor): Promise<'token' | 'gh'> {
  if (process.env.GH_TOKEN?.trim()) return 'token';
  try {
    await executor.run({ command: 'gh', args: ['auth', 'status'] });
    return 'gh';
  } catch {
    throw new Error('PLUGIN_PUBLISH_CREDENTIALS_MISSING: set GH_TOKEN or authenticate gh');
  }
}

export function displayCommand(command: CommandSpec): string {
  return [command.command, ...command.args.map(argument => /[\s"]/u.test(argument) ? JSON.stringify(argument) : argument)].join(' ');
}
