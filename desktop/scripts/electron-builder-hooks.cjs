const fs = require('node:fs/promises');
const path = require('node:path');

const CORE_FILES = [
  'index.js',
  'index.d.ts',
  'package.json',
  'multi-platform-core.win32-x64-msvc.node',
  'multi-platform-core.win32-arm64-msvc.node',
  'multi-platform-core.darwin-x64.node',
  'multi-platform-core.darwin-arm64.node',
  'multi-platform-core.linux-x64-gnu.node',
  'multi-platform-core.linux-arm64-gnu.node',
];

async function copyNativeCorePackageFiles(targetRoot) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const coreRoot = path.join(projectRoot, 'multi_platform_core');
  const packageRoot = path.join(targetRoot, 'node_modules', '@guyantools', 'core');

  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });

  for (const file of CORE_FILES) {
    const source = path.join(coreRoot, file);
    try {
      await fs.copyFile(source, path.join(packageRoot, file));
    } catch (error) {
      if (error && error.code === 'ENOENT' && file.endsWith('.node')) {
        continue;
      }
      throw error;
    }
  }
}

async function beforePack(context) {
  await copyNativeCorePackageFiles(context.packager.projectDir);
}

module.exports = {
  beforePack,
};
