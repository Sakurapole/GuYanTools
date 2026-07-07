import { ftpHost } from '@/main/ftp/host';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

export const ftpProvider: QuickLaunchProvider = {
  id: 'ftp',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    const profiles = await ftpHost.listProfiles();

    return profiles
      .map((profile): QuickLaunchResult | null => {
        const endpoint = `${profile.protocol}://${profile.username ? `${profile.username}@` : ''}${profile.host}:${profile.port}`;
        const subtitle = compactSnippet(endpoint);
        const match = scoreQuickLaunchFields(
          context.query,
          { value: profile.label, weight: 84 },
          { value: endpoint, weight: 44 },
          [
            { value: profile.host, weight: 38 },
            { value: profile.username, weight: 30 },
            { value: profile.defaultRemotePath, weight: 28 },
            { value: profile.defaultLocalPath, weight: 24 },
          ],
        );
        if (!match) {
          return null;
        }

        return {
          id: `ftp:${profile.id}`,
          providerId: 'ftp',
          title: profile.label,
          subtitle,
          detail: profile.defaultRemotePath || profile.defaultLocalPath,
          keywords: [
            profile.host,
            profile.username,
            profile.defaultRemotePath,
            profile.defaultLocalPath,
          ],
          score: match.score,
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: {
            type: 'open-ftp-profile',
            profileId: profile.id,
          },
        } satisfies QuickLaunchResult;
      })
      .filter((item): item is QuickLaunchResult => Boolean(item))
      .slice(0, context.limit);
  },
};
