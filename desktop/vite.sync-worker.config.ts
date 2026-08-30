import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    // The Forge plugin resolves this entry as a main target. Disable its
    // default library mode so this remains a standalone SSR worker bundle.
    lib: false,
    ssr: path.resolve(__dirname, 'src/main/sync/sync_worker_entry.ts'),
    outDir: path.resolve(__dirname, '.vite/build'),
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron', '@guyantools/core'],
      output: { format: 'cjs', entryFileNames: 'sync-worker.js' },
    },
  },
});
