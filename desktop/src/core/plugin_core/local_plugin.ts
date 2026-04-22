import fs from "fs-extra";
import path from "path";
import { PLUGIN_INSTALL_DIR } from "../../main/constants/paths";
import PluginManager from "./plugin_manager";
import { WebContentsView } from "electron";

const configPath = path.join(PLUGIN_INSTALL_DIR, "./guyan-local-plugin.json");

let registry;
let pluginInstance: PluginManager;

(async () => {
  console.log("Initializing plugin manager...");
  let plugins_info: PluginInfo[] = [];
  if (await fs.pathExists(configPath)) {
    console.log("async judge");
    plugins_info = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  } else {
    if (await fs.pathExists(PLUGIN_INSTALL_DIR)) {
      // write default config
      console.log("Plugin directory exists, but no config found. Creating default config.");
      await fs.writeJSON(configPath, [], { spaces: 2 });
      console.log("Default config created at:", configPath);
    } else {
      await fs.mkdir(PLUGIN_INSTALL_DIR, { recursive: true });
      console.log("Plugin directory created at:", PLUGIN_INSTALL_DIR);
      await fs.writeJSON(configPath, [], { spaces: 2 });
      console.log("Default config created at:", configPath);
    }
  }
  global.LOCAL_PLUGINS.plguins = plugins_info;

  // console.log(global.LOCAL_PLUGINS);

  pluginInstance = new PluginManager({
    baseDir: PLUGIN_INSTALL_DIR,
    registry: registry ? registry : 'https://registry.npmmirror.com/'
  });
})();

global.LOCAL_PLUGINS = {
  plguins: [],

  async downloadPlugin(plugin: PluginInfo) {

    console.log(`Downloading plugin: ${plugin.name}`);

  },

  async importFromLocalFiles() {

  },

  async getPluginWebContentsView(plugin: PluginInfo, windowOptions: { width: number, height: number, x: number, y: number }): Promise<WebContentsView> {
    console.log("Creating WebContentsView for plugin:", plugin.name);
    console.log("Current directory:", __dirname);

    // 构建preload脚本路径
    const preloadPath = path.join(__dirname, '..', '..', '.vite', 'build', 'preload.plugin.js');
    console.log("Preload script path:", preloadPath);

    // 构建插件文件路径
    const pluginFilePath = path.join(PLUGIN_INSTALL_DIR, "node_modules", plugin.name, plugin.main);
    console.log("Plugin file path:", pluginFilePath);

    // 检查文件是否存在
    if (!await fs.pathExists(pluginFilePath)) {
      throw new Error(`Plugin file not found: ${pluginFilePath}`);
    }

    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        webSecurity: false,
        nodeIntegration: true,
        contextIsolation: true,
        webviewTag: true,
        devTools: true,
      }
    });

    // 监听页面加载完成事件
    webContentsView.webContents.on('did-finish-load', () => {
      console.log("Plugin page loaded successfully");
      // 自动打开开发者工具
      webContentsView.webContents.openDevTools();
    });

    // 监听加载失败事件
    webContentsView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error("Plugin page failed to load:", {
        errorCode,
        errorDescription,
        validatedURL
      });
    });
 
    // 监听控制台消息
    webContentsView.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`Plugin console [${level}]:`, message, `at ${sourceId}:${line}`);
    });

    const pluginUrl = `file://${pluginFilePath}`;
    console.log("Loading plugin URL:", pluginUrl);

    try {
      await webContentsView.webContents.loadURL(pluginUrl);
    } catch (error) {
      console.error("Failed to load plugin URL:", error);
      throw error;
    }

    webContentsView.setBounds({ x: windowOptions.x, y: windowOptions.y, width: windowOptions.width, height: windowOptions.height });

    return webContentsView;
  },

}

console.log("Plugin manager initialized.");
export { pluginInstance };

