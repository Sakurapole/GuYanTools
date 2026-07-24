import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve('src/index.ts'),
        vue: path.resolve('src/vue.ts'),
        react: path.resolve('src/react.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'react',
        'vue',
        '@guyantools/ui-core',
        '@guyantools/ui-vue',
        '@stencil/react-output-target/runtime',
        /^@guyantools\/ui-core\//,
      ],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
