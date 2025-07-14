type PLGUIN = {
  name: string;
  isDev: boolean;
}

interface PluginManagerOptions {
  baseDir: string;
  registry?: string;
}

interface PluginCache {
  [key: string]: number;
}

interface PluginInfo {
  // 插件类型
  type: "adapter";
  // 插件名称 rubick-adapter-xxx
  name: string;
  // 可读插件名称
  pluginName: string;
  // 作者
  author: string;
  // 描述
  description: string;
  // 入口文件
  main: string;
  // 版本
  version: string;
  // logo地址
  logo: string;
}