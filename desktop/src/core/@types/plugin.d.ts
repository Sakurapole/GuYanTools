type PLGUIN = {
  name: string;
  isDev: boolean;
}

interface PluginManagerOptions {
  baseDir: string;
  registry?: string;
}

interface PluginCache {
  [key: string]: string;
}

interface PluginInfo {
  id?: string;
  type?: "ui" | "system";
  name: string;
  pluginName?: string;
  author?: string;
  description?: string;
  main: string;
  version?: string;
  logo?: string;
  displayName?: string;
  pluginApiVersion?: string;
  hostVersionRange?: string;
  trustLevel?: "sandboxed" | "trusted";
  runtime?: "ui" | "worker" | "hybrid" | "host";
  entry?: string;
  permissions?: string[];
  contributes?: Record<string, unknown>;
}
