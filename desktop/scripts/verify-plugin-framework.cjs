const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const commands = [
  ['pnpm', ['--dir', 'packages/ui-core', 'exec', 'stencil-test', '--project', 'spec']],
  ['pnpm', ['--dir', 'packages/ui-core', 'run', 'build']],
  ['pnpm', ['--dir', 'packages/ui-vue', 'run', 'build']],
  ['pnpm', ['--dir', 'packages/ui-vue', 'exec', 'vitest', 'run']],
  ['pnpm', ['--dir', 'packages/plugin-ui', 'run', 'build']],
  ['pnpm', ['--dir', 'packages/plugin-sdk', 'run', 'build']],
  ['pnpm', ['--dir', 'packages/plugin-vite', 'run', 'build']],
  ['pnpm', ['--dir', 'packages/plugin-cli', 'run', 'build']],
  ['pnpm', ['--dir', 'packages/plugin-cli', 'exec', 'vitest', 'run', 'tests/create.test.ts', 'tests/dev.test.ts', 'tests/pack.test.ts', 'tests/publish.test.ts']],
  ['pnpm', ['--dir', 'desktop', 'exec', 'vitest', 'run', 'src/main/plugin-host', 'src/windows/main/pages/Plugins/plugin_dev_session.test.ts']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const name of ['vue-plugin', 'react-plugin']) {
  const fixture = path.join(root, 'desktop/src/main/plugin-host/fixtures', name);
  const result = spawnSync('pnpm', ['--dir', 'packages/plugin-vite', 'exec', 'vite', 'build', '--config', path.join(fixture, 'vite.config.ts')], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  for (const file of ['guyantools.plugin.json', 'index.html', 'worker.js']) if (!fs.existsSync(path.join(fixture, file))) throw new Error(`Missing fixture file: ${name}/${file}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'guyantools.plugin.json'), 'utf8'));
  for (const field of ['dev', 'devServer', 'uiUrl', 'workerUrl']) if (field in manifest) throw new Error(`Development field in fixture: ${name}/${field}`);
  for (const file of ['index.html', 'worker.js']) if (!fs.existsSync(path.join(fixture, 'dist', file))) throw new Error(`Missing fixture output: ${name}/dist/${file}`);
  const entry = fs.readFileSync(path.join(fixture, 'index.html'), 'utf8');
  if (!entry.includes('gt-card') || !entry.includes('gt-button')) throw new Error(`Missing gt element in fixture: ${name}`);
}
console.log('plugin framework verification passed');
