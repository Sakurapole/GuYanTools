import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

class PluginManager {
  public baseDir: string;
  readonly registry: string;

  pluginCaches: PluginCache = {};

  constructor(options: PluginManagerOptions) {
    if (!fs.existsSync(options.baseDir)) {
      fs.mkdirSync(options.baseDir, { recursive: true });
      fs.writeFileSync(
        `${options.baseDir}/package.json`,
        '{"dependencies":{}}'
      );
    }

    this.baseDir = options.baseDir;
    this.registry = options.registry || 'https://registry.npmmirror.com/'
  }

  async getPluginInfo(pluginName: string, pluginPath?: string): Promise<PluginInfo> {
    let pluginInfo: PluginInfo;
    const infoPath = pluginPath || path.resolve(this.baseDir, 'node_modules', pluginName, 'package.json');
    if (await fs.pathExists(infoPath)) {
      pluginInfo = JSON.parse(await fs.readFileSync(infoPath, 'utf-8')) as PluginInfo;
    } else {
      const res = await axios.get(`https://cdn.jsdelivr.net/npm/${pluginName}/plugin.json`);
      pluginInfo = JSON.parse(res.data) as PluginInfo;
    }

    return pluginInfo;
  }

  async upgradePlugin(pluginName: string): Promise<void> {
    const pluginPackageJson = JSON.parse(
      fs.readFileSync(`${this.baseDir}/package.json`, 'utf-8')
    );
    const pluginRegistryUrl = `https://registry.npmmirror.com/${pluginName}`

    try {
      const installedVersion = pluginPackageJson.dependencies[pluginName].replace('^', '');
      let latestVersion = this.pluginCaches[pluginName];
      if (!latestVersion) {
        const { data } = await axios.get(pluginRegistryUrl, { timeout: 2000 });
        latestVersion = data['dist-tags'].latest;
        this.pluginCaches[pluginName] = latestVersion;
      }
      if (latestVersion > installedVersion) {
        await this.install([pluginName], { isDev: false });
      }
    } catch (e) {
      console.log(e);
    }
  }

  async install(plugins: Array<string>, options: { isDev: boolean }): Promise<void> {
    const installCmd = options.isDev ? 'link' : 'install';
    await this.execCommand(installCmd, plugins);
  }

  async udpate(...plugins: string[]): Promise<void> {
    await this.execCommand('update', plugins);
  }

  async uninstall(plguins: string[], options: { isDev: boolean }): Promise<void> {
    const uninstallCmd = options.isDev ? 'unlink' : 'uninstall';
    await this.execCommand(uninstallCmd, plguins);
  }

  async list() {
    const installInfo = JSON.parse(
      await fs.readFile(`${this.baseDir}/package.json`, 'utf-8')
    );
    const plugins: string[] = [];
    for (const adapter in installInfo.dependencies) {
      plugins.push(adapter);
    }
    return plugins;
  }

  private async execCommand(cmd: string, modules: string[]): Promise<void> {
    return new Promise((resolve: any, reject: any) => {
      let args: string[] = [cmd].concat(
        cmd !== 'uninstall' && cmd !== 'link' ? modules.map((m) => `${m}@latest`) : modules
      );
      if (cmd !== 'link') {
        args = args.concat('--color=always')
          .concat('--save')
          .concat(`--registry=${this.registry}`);
      }

      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const npm = spawn(npmCommand, args, {
        cwd: this.baseDir,
      });

      console.log(args);

      let output = '';
      npm.stdout.on('data', (data: string) => {
        output += data;
      }).pipe(process.stdout)

      npm.stderr
        .on('data', (data: string) => {
          output += data; // 获取报错日志
        })
        .pipe(process.stderr);

      npm.on('close', (code: number) => {
        if (!code) {
          resolve({ code: 0, data: output }); // 如果没有报错就输出正常日志
        } else {
          reject({ code: code, data: output }); // 如果报错就输出报错日志
        }
      });
    })
  }
}

export default PluginManager;
