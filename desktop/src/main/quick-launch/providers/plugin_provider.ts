import { pluginHost } from '@/main/plugin-host';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

export const pluginProvider: QuickLaunchProvider = {
  id: 'plugin',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    const pages = pluginHost.listPages();
    const plugins = pluginHost.listPlugins();
    const results: QuickLaunchResult[] = [];

    for (const page of pages) {
      const match = scoreQuickLaunchFields(
        context.query,
        { value: page.title, weight: 72 },
        { value: page.description ?? '', weight: 32 },
        [
          { value: page.pluginId, weight: 24 },
          { value: page.routePath, weight: 26 },
        ],
      );
      if (!match) {
        continue;
      }

      results.push({
        id: `plugin-page:${page.pluginId}:${page.pageId}`,
        providerId: 'plugin',
        title: page.title,
        subtitle: compactSnippet(page.description || `插件页面 ${page.pluginId}`),
        keywords: [page.pluginId, page.routePath],
        score: match.score,
        highlights: {
          title: match.titleHighlights,
          subtitle: match.subtitleHighlights,
        },
        action: {
          type: 'open-plugin-page',
          pluginId: page.pluginId,
          pageId: page.pageId,
          routePath: page.routePath,
        },
      });
    }

    for (const plugin of plugins) {
      if (!plugin.enabled || plugin.status !== 'enabled') {
        continue;
      }

      for (const command of plugin.manifest.contributes.commands ?? []) {
        const match = scoreQuickLaunchFields(
          context.query,
          { value: command.title, weight: 68 },
          { value: command.description ?? plugin.manifest.displayName, weight: 28 },
          [
            { value: command.id, weight: 26 },
            { value: plugin.manifest.id, weight: 22 },
          ],
        );
        if (!match) {
          continue;
        }

        results.push({
          id: `plugin-command:${plugin.manifest.id}:${command.id}`,
          providerId: 'plugin',
          title: command.title,
          subtitle: compactSnippet(command.description || plugin.manifest.displayName),
          keywords: [command.id, plugin.manifest.id],
          score: match.score,
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: {
            type: 'execute-plugin-command',
            pluginId: plugin.manifest.id,
            commandId: command.id,
          },
        });
      }
    }

    return results.slice(0, context.limit);
  },
};
