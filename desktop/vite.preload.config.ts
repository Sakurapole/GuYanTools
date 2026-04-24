import path from 'path';
import { defineConfig } from 'vite';

const isBuilderElectron = process.env.BUILDER_ELECTRON === 'true';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: isBuilderElectron ? {
    ssr: path.resolve(__dirname, 'src/preload.ts'),
    outDir: path.resolve(__dirname, '.vite/build'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: ['electron'],
      output: {
        format: 'cjs',
        entryFileNames: 'preload.js',
      },
    },
  } : undefined,
});
