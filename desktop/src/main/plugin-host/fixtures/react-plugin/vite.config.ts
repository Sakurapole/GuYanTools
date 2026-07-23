import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  build: { outDir: 'dist', rollupOptions: { input: { index: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.html'), worker: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'worker.js') }, output: { entryFileNames: chunk => chunk.name === 'worker' ? 'worker.js' : 'assets/[name]-[hash].js' } } },
});
