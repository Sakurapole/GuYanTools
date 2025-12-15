import path from 'path';
import { defineConfig } from 'vite';

// 自定义插件来处理 .node 文件
function nativeNodePlugin() {
  return {
    name: 'native-node-plugin',
    resolveId(id: string) {
      // 处理 .node 文件的解析,标记为外部依赖
      if (id.endsWith('.node') || id.includes('.node?')) {
        return { id, external: true };
      }
      return null;
    },
    // 加载时也标记为外部
    load(id: string) {
      if (id.endsWith('.node') || id.includes('.node?')) {
        return { code: '', moduleSideEffects: false };
      }
      return null;
    }
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [nativeNodePlugin()],
  resolve: {
    // 确保可以解析 .node 文件
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.node'],
    alias: {
      '@guyantools/core': path.resolve(__dirname, '../multi_platform_core/index.js')
    }
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
        // 将原生模块和相关依赖标记为外部,不打包
        /\.node$/,
        /multi-platform-core.*\.node/,
        '@guyantools/core'
      ]
    }
  },
  optimizeDeps: {
    // 排除原生模块
    exclude: ['@guyantools/core']
  }
});
