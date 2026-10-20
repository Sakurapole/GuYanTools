import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(uiDir, '../../../../..');

export default defineConfig({
  root: uiDir,
  base: './',
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('gt-') } } }),
  ],
  resolve: { alias: { '@plugin-ui': path.resolve(repoRoot, 'packages/plugin-ui/src') } },
  build: {
    outDir: path.resolve(uiDir, '../dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
