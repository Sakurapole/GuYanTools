import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // 不要压缩,便于调试
    minify: false,
    // 确保 CommonJS 模块被正确处理
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/multi_platform_core/, /node_modules/]
    },
    rollupOptions: {
      external: [
        '@guyantools/core'
      ]
    }
  },
  optimizeDeps: {
    // 排除原生模块
    exclude: ['@guyantools/core']
  }
});
