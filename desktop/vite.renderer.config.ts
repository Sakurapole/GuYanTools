import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vitejs.dev/config
export default defineConfig({
  optimizeDeps: {
    include: ['pinia']
  },
  plugins: [vue(), vueDevTools()],
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        importers: [],
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {

  },
  build: {
    rollupOptions: {
    }
  }
});
