const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.dart',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.rs',
  '.scss',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml',
]);
const ignoredSegments = new Set([
  '.git',
  '.local',
  '.vite',
  'dist',
  'node_modules',
  'out',
  'target',
  'tmp',
  'vendor',
]);
const scanRoots = [
  '.github',
  'desktop/scripts',
  'desktop/src',
  'docs',
  'mobile/lib',
  'mobile/test',
  'multi_platform_core/migrations',
  'multi_platform_core/src',
  'sync_server/migrations',
  'sync_server/scripts',
  'sync_server/src',
];

const invalidFiles = [];
for (const scanRoot of scanRoots) {
  walk(path.join(root, scanRoot));
}

if (invalidFiles.length > 0) {
  console.error('Non UTF-8 source files detected:');
  for (const file of invalidFiles) {
    console.error(`- ${path.relative(root, file).replace(/\\/g, '/')}`);
  }
  process.exit(1);
}

console.log('Source encoding checks passed.');

function walk(target) {
  if (!fs.existsSync(target)) {
    return;
  }

  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const name = path.basename(target);
    if (ignoredSegments.has(name)) {
      return;
    }
    for (const entry of fs.readdirSync(target)) {
      walk(path.join(target, entry));
    }
    return;
  }

  if (!stat.isFile() || !textExtensions.has(path.extname(target))) {
    return;
  }

  const bytes = fs.readFileSync(target);
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) {
    invalidFiles.push(target);
  }
}
