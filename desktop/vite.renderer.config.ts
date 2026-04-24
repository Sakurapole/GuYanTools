import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';

const isBuilderElectron = process.env.BUILDER_ELECTRON === 'true';

// https://vitejs.dev/config
export default defineConfig({
  base: isBuilderElectron ? './' : '/',
  cacheDir: '.vite/cache/main_window',
  optimizeDeps: {
    include: ['pinia']
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webview',
        },
      },
    }),
    vueDevTools(),
  ],
  css: {
    preprocessorOptions: {
      scss: {
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
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    ...(isBuilderElectron ? {
      outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
      emptyOutDir: true,
    } : {}),
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        func: path.resolve(__dirname, 'index_func.html'),
        terminal: path.resolve(__dirname, 'index_terminal.html'),
        splash: path.resolve(__dirname, 'splash.html'),
        notification: path.resolve(__dirname, 'notification.html'),
        tray_menu: path.resolve(__dirname, 'tray_menu.html'),
      }
    }
  }
});
