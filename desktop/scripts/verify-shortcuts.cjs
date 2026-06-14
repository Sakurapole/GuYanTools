const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

const checks = [
  ['desktop/src/contracts/shortcuts.ts', [
    'RetrySystemShortcutInput',
    'RetrySystemShortcutResult',
    'retrySystemShortcut: (input: RetrySystemShortcutInput) => Promise<RetrySystemShortcutResult>',
  ]],
  ['desktop/src/main/shortcuts/ipc.ts', [
    'RetrySystemShortcutInput',
    "shortcuts:retry-system",
    'shortcutService.retrySystemShortcut(input)',
  ]],
  ['desktop/src/main/shortcuts/service.ts', [
    'async retrySystemShortcut',
    'registerConfiguredShortcut',
    'RetrySystemShortcutInput',
    'RetrySystemShortcutResult',
    '注册成功。',
    '注册失败，可能仍被系统或其他应用占用。',
  ]],
  ['desktop/src/preload.ts', [
    'retrySystemShortcut: (input) => ipcRenderer.invoke',
    "shortcuts:retry-system",
  ]],
  ['desktop/src/windows/main/pages/Settings.vue', [
    'shortcutRetryingKeys',
    'canRetrySystemShortcut',
    'retrySystemShortcut',
    '重新注册',
    '正在注册',
    'shortcut-status-row',
  ]],
  ['desktop/package.json', [
    '"verify:shortcuts": "node scripts/verify-shortcuts.cjs"',
  ]],
];

let failed = false;

for (const [relativePath, markers] of checks) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[shortcuts] missing file: ${relativePath}`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  for (const marker of markers) {
    if (!content.includes(marker)) {
      console.error(`[shortcuts] ${relativePath} missing marker: ${marker}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('[shortcuts] manual retry markers verified');
