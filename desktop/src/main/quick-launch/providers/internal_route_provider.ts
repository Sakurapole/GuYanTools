import {
  APP_INTERNAL_FUNCTIONS,
  type AppInternalFunctionDefinition,
} from '@/contracts/app_config';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

function routeVisible(item: AppInternalFunctionDefinition) {
  return !item.devOnly || Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL) || process.env.NODE_ENV === 'development';
}

export const internalRouteProvider: QuickLaunchProvider = {
  id: 'internal-route',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    return APP_INTERNAL_FUNCTIONS
      .filter(routeVisible)
      .map((item) => {
        const match = scoreQuickLaunchFields(
          context.query,
          { value: item.label, weight: 90 },
          { value: item.description, weight: 48 },
          [
            { value: item.id, weight: 42 },
            { value: item.route, weight: 42 },
          ],
        );
        if (!match) {
          return null;
        }

        return {
          id: `internal-route:${item.id}`,
          providerId: 'internal-route',
          title: item.label,
          subtitle: compactSnippet(item.description),
          keywords: [item.id, item.route],
          score: match.score,
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: {
            type: 'open-route',
            route: item.route,
          },
        } satisfies QuickLaunchResult;
      })
      .filter((item): item is QuickLaunchResult => Boolean(item))
      .slice(0, context.limit);
  },
};
