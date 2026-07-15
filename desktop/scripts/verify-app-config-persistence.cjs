const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const managerPath = path.join(root, 'src/main/app-config/manager.ts');

const managerSource = fs.readFileSync(managerPath, 'utf8');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const settingsTabIdsMatch = managerSource.match(/const SETTINGS_TAB_IDS: AppSettingsTabId\[] = \[([\s\S]*?)\];/);
if (!settingsTabIdsMatch) {
  fail('App config manager must define SETTINGS_TAB_IDS.');
}

if (!settingsTabIdsMatch[1].includes("'sync-center'")) {
  fail('SETTINGS_TAB_IDS must include sync-center so tab personalization is not dropped on normalize.');
}

if (!managerSource.includes('Failed to write normalized app config. Keeping parsed settings in memory.')) {
  fail('readConfigFromDisk must not restore defaults when normalized config write-back fails.');
}

if (!managerSource.includes('Failed to normalize app config. Keeping parsed settings file untouched.')) {
  fail('readConfigFromDisk must keep the parsed settings file untouched when normalization fails.');
}

if (managerSource.includes('const payload = await fs.readJSON(APP_CONFIG_FILE);\n      const normalized = normalizeAppConfig(payload);\n      await fs.writeJSON(APP_CONFIG_FILE')) {
  fail('readConfigFromDisk still couples read, normalize, and write-back in one destructive recovery block.');
}

console.log('App config persistence safeguards verified.');
