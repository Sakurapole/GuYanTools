import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');

const configMap = {
  main: 'vite.main.config.ts',
  preload: 'vite.preload.config.ts',
  'preload-plugin': 'vite.preload-plugin.config.ts',
  renderer: 'vite.renderer.config.ts',
};

const target = process.argv[2];
if (!target || !configMap[target]) {
  console.error(`Unknown Vite build target: ${target ?? '<missing>'}`);
  process.exit(1);
}

process.env.BUILDER_ELECTRON = 'true';

await build({
  configFile: path.join(desktopRoot, configMap[target]),
});
