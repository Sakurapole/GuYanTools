import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

export class PluginPaths {
  readonly root: string;
  readonly packages: string;
  readonly current: string;
  readonly data: string;
  readonly cache: string;
  readonly logs: string;

  constructor(userDataDir: string) {
    this.root = path.join(userDataDir, 'guyantools-plugins');
    this.packages = path.join(this.root, 'packages');
    this.current = path.join(this.root, 'current');
    this.data = path.join(this.root, 'data');
    this.cache = path.join(this.root, 'cache');
    this.logs = path.join(this.root, 'logs');
  }

  async initialize() {
    await Promise.all([
      fs.ensureDir(this.packages),
      fs.ensureDir(this.current),
      fs.ensureDir(this.data),
      fs.ensureDir(this.cache),
      fs.ensureDir(this.logs),
    ]);
  }

  packageVersion(pluginId: string, commit: string) {
    return path.join(this.packages, pluginId, commit);
  }

  currentPath(pluginId: string) {
    return path.join(this.current, pluginId);
  }

  dataPath(pluginId: string) {
    return path.join(this.data, pluginId);
  }

  cachePath(pluginId: string) {
    return path.join(this.cache, pluginId);
  }

  logsPath(pluginId: string) {
    return path.join(this.logs, pluginId);
  }

  async createTemp(prefix = 'plugin-') {
    await this.initialize();
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  async activate(pluginId: string, sourcePath: string) {
    await this.initialize();
    const destination = this.currentPath(pluginId);
    const staging = await fs.mkdtemp(path.join(this.current, `.${pluginId}.`));
    await fs.copy(sourcePath, staging, { dereference: true });
    const previous = `${destination}.previous`;
    await fs.remove(previous);
    if (await fs.pathExists(destination)) {
      await fs.rename(destination, previous);
    }
    try {
      await fs.rename(staging, destination);
    } catch (error) {
      if (await fs.pathExists(previous) && !(await fs.pathExists(destination))) {
        await fs.rename(previous, destination);
      }
      throw error;
    }
    return { destination, previous: (await fs.pathExists(previous)) ? previous : undefined };
  }

  async remove(pluginId: string) {
    await Promise.all([
      fs.remove(this.currentPath(pluginId)),
      fs.remove(path.join(this.packages, pluginId)),
      fs.remove(this.dataPath(pluginId)),
      fs.remove(this.cachePath(pluginId)),
      fs.remove(this.logsPath(pluginId)),
    ]);
  }
}
