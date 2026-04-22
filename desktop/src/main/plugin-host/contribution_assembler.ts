import type { InstalledPluginRecord, PluginPageDescriptor } from '@/contracts/plugin_host';

export class PluginContributionAssembler {
  listPages(records: InstalledPluginRecord[]): PluginPageDescriptor[] {
    const pages: PluginPageDescriptor[] = [];

    for (const record of records) {
      if (!record.enabled || record.status !== 'enabled') {
        continue;
      }

      const contributions = record.manifest.contributes.pages ?? [];
      for (const page of contributions) {
        pages.push({
          pluginId: record.manifest.id,
          pageId: page.id,
          title: page.title,
          routePath: page.routePath ?? `/plugins/runtime/${record.manifest.id}/${page.id}`,
          icon: page.icon,
          description: page.description,
          trustLevel: record.manifest.trustLevel,
        });
      }
    }

    return pages.sort((a, b) => a.title.localeCompare(b.title));
  }
}
