const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const consumers = [
  'src/windows/main/App.vue',
  'src/windows/main/components/AppNotificationHost.vue',
  'src/windows/main/components/topbar/topbar.vue',
  'src/windows/main/pages/Plugins/Plugins.vue',
  'src/windows/main/pages/Settings.vue',
];

for (const consumer of consumers) {
  const source = fs.readFileSync(path.join(root, consumer), 'utf8');
  if (!source.includes("from '@guyantools/ui-vue'")) {
    throw new Error(`Shared UI package import missing: ${consumer}`);
  }
}

console.log('shared UI library compatibility verified');
