import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import react from '@vitejs/plugin-react';
import type { UserConfig } from 'vite';

export interface GuYanPluginViteOptions {
  framework: 'vue' | 'react';
  uiEntry: string;
  workerEntry?: string;
  manifestPath?: string;
  outDir?: string;
}

export function defineGuYanPluginConfig(options: GuYanPluginViteOptions): UserConfig {
  const uiEntry = path.resolve(options.uiEntry);
  const workerEntry = options.workerEntry ? path.resolve(options.workerEntry) : undefined;
  return {
    root: path.dirname(uiEntry),
    base: './',
    plugins: [options.framework === 'vue' ? vue() : react()],
    server: { host: '127.0.0.1' },
    build: {
      outDir: options.outDir ?? path.resolve('dist'),
      emptyOutDir: true,
      rollupOptions: {
        external: ['fsevents', 'vite', '@vitejs/plugin-vue', '@vitejs/plugin-react', /^node:/],
        input: workerEntry ? { index: uiEntry, worker: workerEntry } : { index: uiEntry },
        output: {
          entryFileNames: chunk => chunk.name === 'worker' ? 'worker.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
}
