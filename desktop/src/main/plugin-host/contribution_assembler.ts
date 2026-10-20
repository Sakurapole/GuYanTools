import type {
  InstalledPluginRecord,
  PluginBackgroundTaskContribution,
  PluginCommandContribution,
  PluginMenuContribution,
  PluginPageDescriptor,
  PluginShortcutContribution,
  PluginWidgetContribution,
} from '../../contracts/plugin_host';
import { getPluginPageRoutePath } from '../../contracts/plugin_host';

export interface QualifiedPluginContribution<T> {
  pluginId: string;
  contribution: T;
}

export class PluginContributionAssembler {
  private isEnabled(record: InstalledPluginRecord) {
    return record.enabled && record.status === 'enabled';
  }

  listPages(records: InstalledPluginRecord[]): PluginPageDescriptor[] {
    const pages: PluginPageDescriptor[] = [];

    for (const record of records) {
      if (!this.isEnabled(record)) continue;

      const contributions = record.manifest.contributes.pages ?? [];
      for (const page of contributions) {
        pages.push({
          pluginId: record.manifest.id,
          pageId: page.id,
          title: page.title,
          routePath: page.routePath ?? getPluginPageRoutePath(record.manifest.id, page.id),
          icon: page.icon,
          description: page.description,
          trustLevel: record.manifest.trustLevel,
          showDevToolsButton: record.manifest.ui?.showDevToolsButton === true,
        });
      }
    }

    return pages.sort((a, b) => a.title.localeCompare(b.title));
  }

  listWidgets(
    records: InstalledPluginRecord[]
  ): QualifiedPluginContribution<PluginWidgetContribution>[] {
    return this.collect(records, (record) => record.manifest.contributes.widgets ?? []);
  }

  listCommands(
    records: InstalledPluginRecord[]
  ): QualifiedPluginContribution<PluginCommandContribution>[] {
    return this.collect(records, (record) => record.manifest.contributes.commands ?? []);
  }

  listMenus(
    records: InstalledPluginRecord[]
  ): QualifiedPluginContribution<PluginMenuContribution>[] {
    return this.collect(records, (record) => record.manifest.contributes.menus ?? []);
  }

  listShortcuts(
    records: InstalledPluginRecord[]
  ): QualifiedPluginContribution<PluginShortcutContribution>[] {
    return this.collect(records, (record) => record.manifest.contributes.shortcuts ?? []);
  }

  listBackgroundTasks(
    records: InstalledPluginRecord[]
  ): QualifiedPluginContribution<PluginBackgroundTaskContribution>[] {
    return this.collect(records, (record) => record.manifest.contributes.backgroundTasks ?? []);
  }

  listAll(records: InstalledPluginRecord[]) {
    return {
      pages: this.listPages(records),
      widgets: this.listWidgets(records),
      commands: this.listCommands(records),
      menus: this.listMenus(records),
      shortcuts: this.listShortcuts(records),
      backgroundTasks: this.listBackgroundTasks(records),
    };
  }

  private collect<T>(
    records: InstalledPluginRecord[],
    pick: (record: InstalledPluginRecord) => T[]
  ): QualifiedPluginContribution<T>[] {
    const result: QualifiedPluginContribution<T>[] = [];
    for (const record of records) {
      if (!this.isEnabled(record)) continue;
      for (const contribution of pick(record)) {
        result.push({ pluginId: record.manifest.id, contribution });
      }
    }
    return result;
  }
}
