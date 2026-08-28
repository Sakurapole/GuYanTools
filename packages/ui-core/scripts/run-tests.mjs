import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const testExitCode = await run(pnpm, ['exec', 'stencil-test', '--project', 'spec', ...process.argv.slice(2)]);
const buildExitCode = await run(pnpm, ['run', 'build']);

process.exitCode = testExitCode || buildExitCode;
