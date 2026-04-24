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
  build: {
    ...(isBuilderElectron ? {
      ssr: path.resolve(__dirname, 'src/main/index.ts'),
      outDir: path.resolve(__dirname, '.vite/build'),
      emptyOutDir: true,
    } : {}),
    // 不要压缩,便于调试
    minify: false,
    // 确保 CommonJS 模块被正确处理
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/multi_platform_core/, /node_modules/]
    },
    rollupOptions: {
      external: [
        'electron',
        '@guyantools/core'
      ],
      output: isBuilderElectron ? {
        format: 'cjs',
        entryFileNames: 'index.js',
      } : undefined,
    }
  },
  define: isBuilderElectron ? {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'),
    SPLASH_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    SPLASH_WINDOW_VITE_NAME: JSON.stringify('main_window'),
    FUNC_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    FUNC_WINDOW_VITE_NAME: JSON.stringify('main_window'),
  } : undefined,
  optimizeDeps: {
    // 排除原生模块
    exclude: ['@guyantools/core']
  }
});
