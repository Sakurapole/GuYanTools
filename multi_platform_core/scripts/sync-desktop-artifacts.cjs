const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..');
const desktopCoreRoot = path.join(workspaceRoot, 'desktop', 'node_modules', '@guyantools', 'core');

if (!fs.existsSync(desktopCoreRoot)) {
  process.exit(0);
}

const artifacts = fs
  .readdirSync(packageRoot)
  .filter((name) => name.endsWith('.node') || ['index.js', 'index.d.ts', 'package.json'].includes(name));

for (const artifact of artifacts) {
  const source = path.join(packageRoot, artifact);
  const target = path.join(desktopCoreRoot, artifact);

  try {
    fs.copyFileSync(source, target);
  } catch (error) {
    if (error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      throw new Error(
        `Unable to sync ${artifact} to desktop/node_modules/@guyantools/core. Close any running GuYanTools/Electron process that is using the native module, then retry.`
      );
    }

    throw error;
  }
}

console.log(`Synced native artifacts to ${desktopCoreRoot}`);
