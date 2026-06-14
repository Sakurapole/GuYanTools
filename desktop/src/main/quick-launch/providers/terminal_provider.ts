import { appConfigManager } from '@/main/app-config/manager';
import { terminalHost } from '@/main/terminal/host';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

export const terminalProvider: QuickLaunchProvider = {
  id: 'terminal',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    const config = await appConfigManager.getConfig();
    const profiles = terminalHost.listProfiles();
    const localConfigById = new Map(config.features.terminal.localProfiles.map((profile) => [profile.id, profile]));

    return profiles
      .map((profile) => {
        const localConfig = localConfigById.get(profile.id);
        const command = [profile.command, ...(profile.args ?? [])].filter(Boolean).join(' ');
        const subtitle = compactSnippet(command || localConfig?.cwd || '打开本地终端');
        const match = scoreQuickLaunchFields(
          context.query,
          { value: profile.label, weight: 88 },
          { value: subtitle, weight: 44 },
          [
            { value: profile.id, weight: 30 },
            { value: profile.command, weight: 34 },
            { value: localConfig?.cwd ?? '', weight: 28 },
          ],
        );
        if (!match) {
          return null;
        }

        return {
          id: `terminal:${profile.id}`,
          providerId: 'terminal',
          title: profile.label,
          subtitle,
          detail: localConfig?.cwd,
          keywords: [profile.id, profile.command, localConfig?.cwd ?? ''],
          score: match.score,
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: {
            type: 'open-terminal-profile',
            profileId: profile.id,
          },
        } satisfies QuickLaunchResult;
      })
      .filter((item): item is QuickLaunchResult => Boolean(item))
      .slice(0, context.limit);
  },
};
