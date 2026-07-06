const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/main/sync/providers/webdav_provider.ts');
const source = fs.readFileSync(file, 'utf8');
const required = [
  'class WebDavSyncProvider',
  'normalizeWebDavEndpoint',
  'createWebDavBasicAuthHeader',
  'https://dav.jianguoyun.com/dav/',
  'GuYanTools/Sync',
  'devices/',
  'profiles/',
  'objects/',
  'assets/',
  'MKCOL',
  'PROPFIND',
  'PUT',
];
const missing = required.filter((token) => !source.includes(token));
if (missing.length > 0) {
  console.error(`Missing WebDAV provider tokens: ${missing.join(', ')}`);
  process.exit(1);
}
const secretStore = fs.readFileSync(path.join(root, 'src/main/sync/secret_store.ts'), 'utf8');
const secretRequired = ['safeStorage', 'saveSyncSecret', 'readSyncSecret', 'sync-secrets'];
const missingSecret = secretRequired.filter((token) => !secretStore.includes(token));
if (missingSecret.length > 0) {
  console.error(`Missing sync secret store tokens: ${missingSecret.join(', ')}`);
  process.exit(1);
}

console.log('WebDAV provider surface verified.');
