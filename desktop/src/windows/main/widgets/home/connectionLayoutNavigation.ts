import { router } from '../../routes/router';
import { useBarStore } from '../../stores/bar_store';
import type { ConnectionLayoutConfig } from '../../session_layouts';

export async function openConnectionLayoutFromHome(layout: ConnectionLayoutConfig) {
  const barStore = useBarStore();
  const requestId = crypto.randomUUID();
  const routePath = layout.surface === 'terminal' ? '/terminal' : '/ftp';
  const routeTitle = layout.surface === 'terminal' ? '终端' : '传输';
  const routeIcon = layout.surface === 'terminal' ? 'terminal' : 'ftp';
  const routeTarget = {
    path: routePath,
    query: {
      openConnectionLayoutRequestId: requestId,
      openConnectionLayoutId: layout.id,
    },
  };

  barStore.openTab(routePath, routeTitle, routeIcon);
  if (router.currentRoute.value.path === routePath) {
    await router.replace(routeTarget);
  } else {
    await router.push(routeTarget);
  }
  barStore.activateTabByUrl(routePath);
}
