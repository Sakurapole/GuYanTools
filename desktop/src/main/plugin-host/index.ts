import path from 'path';
import { BrowserWindow } from 'electron';
import { PLUGIN_INSTALL_DIR } from '../constants/paths';
import PluginManager from '../../core/plugin_core/plugin_manager';
import { appConfigManager } from '../app-config/manager';
import type {
  InstalledPluginRecord,
  PluginHostSummary,
  PluginPageDescriptor,
  PluginViewportBounds,
} from '@/contracts/plugin_host';
import { HostServiceRegistry } from './host_services';
import { PluginContributionAssembler } from './contribution_assembler';
import { PluginLifecycleManager } from './lifecycle_manager';
import { PluginManifestResolver } from './manifest_resolver';
import { PluginPermissionManager } from './permission_manager';
import { PluginRegistry } from './plugin_registry';
import { PluginRuntimeRouter } from './runtime_router';

const REGISTRY_FILE = path.join(PLUGIN_INSTALL_DIR, 'guyantools-plugin-registry.json');

export class PluginHost {
  private readonly pluginManager = new PluginManager({ baseDir: PLUGIN_INSTALL_DIR });
  private readonly registry = new PluginRegistry(REGISTRY_FILE);
  private readonly hostServices = new HostServiceRegistry();
  private readonly manifestResolver = new PluginManifestResolver();
  private readonly permissionManager = new PluginPermissionManager();
  private readonly contributionAssembler = new PluginContributionAssembler();
  private readonly lifecycleManager = new PluginLifecycleManager(
    this.registry,
    this.manifestResolver,
    this.permissionManager,
    this.pluginManager,
    PLUGIN_INSTALL_DIR,
  );
  private readonly runtimeRouter = new PluginRuntimeRouter(
    this.hostServices,
    path.join(__dirname, '..', '..', '.vite', 'build', 'preload.plugin.js'),
    () => appConfigManager.getCachedConfig().plugins.unloadAfterMinutes,
  );
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.registry.initialize();
    this.initialized = true;
  }

  bindMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.hostServices.bindMainWindow(mainWindow);
  }

  getRuntimeContext(webContentsId: number) {
    return this.runtimeRouter.getRuntimeContext(webContentsId);
  }

  getHostSummary(): PluginHostSummary {
    return {
      apiVersion: '1.0.0',
      pluginDirectory: PLUGIN_INSTALL_DIR,
      registryFile: REGISTRY_FILE,
      capabilities: this.hostServices.getCapabilitySummary(),
    };
  }

  listPlugins(): InstalledPluginRecord[] {
    return this.registry.list();
  }

  listPages(): PluginPageDescriptor[] {
    return this.contributionAssembler.listPages(this.registry.list());
  }

  async installPluginFromPackage(packageName: string) {
    return this.lifecycleManager.installFromPackage(packageName);
  }

  async registerLocalPlugin(inputPath: string) {
    return this.lifecycleManager.registerLocalPlugin(inputPath);
  }

  async enablePlugin(pluginId: string) {
    return this.lifecycleManager.enable(pluginId);
  }

  async disablePlugin(pluginId: string) {
    if (this.mainWindow) {
      await this.runtimeRouter.unmountUiPage(this.mainWindow, pluginId);
    }

    return this.lifecycleManager.disable(pluginId);
  }

  async mountPage(pluginId: string, pageId: string, bounds: PluginViewportBounds) {
    if (!this.mainWindow) {
      throw new Error('Main window is not bound to plugin host');
    }

    const record = this.registry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    await this.runtimeRouter.mountUiPage(this.mainWindow, record, pageId, bounds);
  }

  async updateMountedPageBounds(bounds: PluginViewportBounds) {
    if (!this.mainWindow) {
      return;
    }

    await this.runtimeRouter.updateMountedBounds(this.mainWindow, bounds);
  }

  async unmountPage(pluginId?: string) {
    if (!this.mainWindow) {
      return;
    }

    await this.runtimeRouter.unmountUiPage(this.mainWindow, pluginId);
  }

  async getPluginStorageValue(pluginId: string, key: string) {
    return this.hostServices.storage.getPluginState(pluginId, key);
  }

  async setPluginStorageValue(pluginId: string, key: string, value: unknown) {
    await this.hostServices.storage.setPluginState(pluginId, key, value);
  }

  getHostServices() {
    return this.hostServices;
  }
}

export const pluginHost = new PluginHost();
