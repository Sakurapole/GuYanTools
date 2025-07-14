import vue from '@vitejs/plugin-vue';
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
  server: {

  },
  build: {
    rollupOptions: {
    }
  }
});
