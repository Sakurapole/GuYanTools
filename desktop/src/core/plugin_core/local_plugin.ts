import fs from "fs-extra";
import path from "path";
import { PLUGIN_INSTALL_DIR } from "../../common/constants/main_process_constants";
import PluginManager from "./plugin_manager";
// import { PLGUIN } from "../@types/index.d.ts";

const configPath = path.join(PLUGIN_INSTALL_DIR, "./local-plugin.json");

let registry;
let pluginInstance: PluginManager;

(async () => {
  console.log("Initializing plugin manager...");
  let plugins_info: PLGUIN[] = [];
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
    }
  }
  global.LOCAL_PLUGINS.plguins = plugins_info;

  console.log(global.LOCAL_PLUGINS);

  pluginInstance = new PluginManager({
    baseDir: PLUGIN_INSTALL_DIR,
    registry: registry ? registry : 'https://registry.npmmirror.com/'
  });
})();

global.LOCAL_PLUGINS = {
  plguins: [],

  async downloadPlugin(plugin: PLGUIN) {

    console.log(`Downloading plugin: ${plugin.name}`);

  }
}
console.log("Plugin manager initialized.");
export { pluginInstance };

