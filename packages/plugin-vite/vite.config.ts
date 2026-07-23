import { defineConfig } from 'vite';

export default defineConfig({ build: { lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' }, outDir: 'dist', emptyOutDir: false, rollupOptions: { external: ['fsevents', 'vite', '@vitejs/plugin-vue', '@vitejs/plugin-react', /^node:/] } } });
