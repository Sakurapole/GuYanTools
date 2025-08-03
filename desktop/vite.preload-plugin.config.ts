import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/core/plugin_core/preload.plugin.ts',
      formats: ['cjs'],
      fileName: () => 'preload-plugin.js'
    },
    outDir: '.vite/build',
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron']
    }
  }
});