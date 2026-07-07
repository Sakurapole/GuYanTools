import { sshHost } from '@/main/ssh/host';
import type { SshProfile } from '@/contracts/ssh';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

function parseTags(profile: SshProfile) {
  if (!profile.tags) {
    return [];
  }

  try {
    const tags = JSON.parse(profile.tags);
    return Array.isArray(tags)
      ? tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export const sshProvider: QuickLaunchProvider = {
  id: 'ssh',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    const profiles = await sshHost.listProfiles();

    return profiles
      .map((profile): QuickLaunchResult | null => {
        const tags = parseTags(profile);
        const endpoint = `${profile.username}@${profile.host}:${profile.port}`;
        const subtitle = compactSnippet(endpoint);
        const match = scoreQuickLaunchFields(
          context.query,
          { value: profile.label, weight: 86 },
          { value: endpoint, weight: 46 },
          [
            { value: profile.host, weight: 42 },
            { value: profile.username, weight: 34 },
            ...tags.map((tag) => ({ value: tag, weight: 30 })),
          ],
        );
        if (!match) {
          return null;
        }

        return {
          id: `ssh:${profile.id}`,
          providerId: 'ssh',
          title: profile.label,
          subtitle,
          keywords: [profile.host, profile.username, ...tags],
          score: match.score,
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: {
            type: 'open-ssh-profile',
            profileId: profile.id,
          },
        } satisfies QuickLaunchResult;
      })
      .filter((item): item is QuickLaunchResult => Boolean(item))
      .slice(0, context.limit);
  },
};
