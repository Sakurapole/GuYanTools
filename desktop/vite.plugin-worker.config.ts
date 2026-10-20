import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    ssr: path.resolve(__dirname, 'src/main/plugin-host/utility_worker_entry.ts'),
    outDir: path.resolve(__dirname, '.vite/build'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: ['electron', '@guyantools/core'],
      output: { format: 'cjs', entryFileNames: 'plugin-worker.js' },
    },
  },
});
