import path from "path";
import { PLUGIN_INSTALL_DIR } from "../../common/constants/main_process_constants";
// import { PLGUIN } from "../@types/index.d.ts";

const configPath = path.join(PLUGIN_INSTALL_DIR, "./local-plugin.json");

let registry;
let pluginInstance;

(async () => {

})();

global.LOCAL_PLUGINS = {
  plguins: [],

  async downloadPlugin(plugin: PLGUIN) {

  }
}