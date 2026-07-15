import {
  APP_INTERNAL_FUNCTIONS,
  type AppInternalFunctionDefinition,
} from '@/contracts/app_config';
import type { HomeLayoutDto, HomeWidgetDto } from '@/contracts/home_layout';
import type { WidgetAction } from '@/contracts/home_widget';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { dbManager } from '@/core/database';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

function routeVisible(item: AppInternalFunctionDefinition) {
  return !item.devOnly || Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL) || process.env.NODE_ENV === 'development';
}

function deserializeJson<T>(json: unknown): T | undefined {
  if (!json) return undefined;
  if (typeof json === 'object') return json as T;
  if (typeof json !== 'string') return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

function deserializeHomeLayout(layout: any): HomeLayoutDto {
  return {
    workspaceKey: layout.workspaceKey,
    categories: (layout.categories ?? []).map((category: any) => ({
      ...category,
      action: deserializeJson(category.action),
      backgroundStyle: deserializeJson(category.backgroundStyle),
      widgets: (category.widgets ?? []).map((widget: any) => ({
        ...widget,
        action: deserializeJson<WidgetAction>(widget.action),
        backgroundStyle: deserializeJson(widget.backgroundStyle),
        widgetConfig: deserializeJson(widget.widgetConfig),
      })),
    })),
  };
}

async function searchHomeWebpageActions(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
  if (!dbManager.isInitialized()) {
    return [];
  }

  const db = dbManager.getDatabase();
  const workspaceKey = await db.getActiveHomeWorkspaceKey();
  const layout = deserializeHomeLayout(await db.getHomeLayout(workspaceKey));
  const widgets = layout.categories.flatMap(category => category.widgets);

  return widgets
    .map((widget: HomeWidgetDto): QuickLaunchResult | null => {
      const action = widget.action;
      if (widget.hidden || widget.widgetType !== 'shortcut' || action?.type !== 'open_webpage' || !action.url) {
        return null;
      }

      const title = widget.label || action.url;
      const subtitle = `打开网页 · ${action.url}`;
      const match = scoreQuickLaunchFields(
        context.query,
        { value: title, weight: 86 },
        { value: subtitle, weight: 54 },
        [
          { value: action.url, weight: 64 },
          { value: widget.icon ?? '', weight: 18 },
        ],
      );
      if (!match) {
        return null;
      }

      const route = `/webview?url=${encodeURIComponent(action.url)}`;
      return {
        id: `home-webpage:${widget.id}`,
        providerId: 'internal-route',
        title,
        subtitle: compactSnippet(subtitle),
        detail: action.url,
        keywords: [action.url, 'webview', '网页', '打开网页'],
        score: match.score,
        highlights: {
          title: match.titleHighlights,
          subtitle: match.subtitleHighlights,
        },
        action: {
          type: 'open-route',
          route,
        },
      } satisfies QuickLaunchResult;
    })
    .filter((item): item is QuickLaunchResult => Boolean(item))
    .slice(0, context.limit);
}

export const internalRouteProvider: QuickLaunchProvider = {
  id: 'internal-route',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    const internalResults = APP_INTERNAL_FUNCTIONS
      .filter(routeVisible)
      .map((item): QuickLaunchResult | null => {
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

    const webpageResults = await searchHomeWebpageActions(context);
    return internalResults
      .concat(webpageResults)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, context.limit);
  },
};
