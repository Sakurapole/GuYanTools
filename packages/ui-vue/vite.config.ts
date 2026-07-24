import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('gt-') } } })],
  build: {
    lib: { entry: path.resolve('src/index.ts'), formats: ['es'], fileName: 'index' },
    rollupOptions: {
      external: (id) => id === 'vue' || id === '@guyantools/ui-core' || id.startsWith('@guyantools/ui-core/'),
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: { environment: 'jsdom' },
});
