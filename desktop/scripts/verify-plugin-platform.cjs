const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  'src/contracts/plugin_media.ts',
  'src/main/plugin-host/marketplace_resolver.ts',
  'src/main/plugin-host/plugin_paths.ts',
  'src/main/plugin-host/context_guard.ts',
  'src/main/plugin-host/services/network_service.ts',
  'src/main/plugin-host/services/file_grant_service.ts',
  'src/main/plugin-host/services/downloads_service.ts',
  'src/main/plugin-host/services/job_service.ts',
  'src/main/plugin-host/services/media_service.ts',
  'src/main/plugin-host/services/secret_service.ts',
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing plugin platform file: ${relative}`);
}

const hostFiles = [
  'src/main/plugin-host/manifest_resolver.ts',
  'src/main/plugin-host/marketplace_resolver.ts',
  'src/main/plugin-host/services/network_service.ts',
  'src/main/plugin-host/services/media_service.ts',
];
for (const relative of hostFiles) {
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  if (/bilibili|SESSDATA|\bBV[0-9A-Z]{4,}\b/i.test(content)) throw new Error(`Site-specific coupling found in ${relative}`);
}

const runtime = fs.readFileSync(path.join(root, 'src/main/plugin-host/runtime_security.ts'), 'utf8');
for (const token of ['sandbox: true', 'nodeIntegration: false', 'webSecurity: true', 'webviewTag: false']) {
  if (!runtime.includes(token)) throw new Error(`Runtime security invariant missing: ${token}`);
}

const pluginPage = fs.readFileSync(path.join(root, 'src/windows/main/pages/Plugins/Plugins.vue'), 'utf8');
for (const token of ['installSource', 'manifest.version', 'resolvedCommit', 'manifest.permissions', 'approvedPermissions', 'manifest.capabilities', 'plugin.status', 'errorMessage']) {
  if (!pluginPage.includes(token)) throw new Error(`Plugin management UI field missing: ${token}`);
}
console.log('plugin platform verification passed');
