import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        importers: [],
      }
    }
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, './index_func.html')
    }
  }
});
