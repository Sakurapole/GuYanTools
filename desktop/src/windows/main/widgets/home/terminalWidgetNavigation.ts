import { router } from '../../routes/router';
import { useBarStore } from '../../stores/bar_store';

export type TerminalHomeOpenTarget =
  | { kind: 'local'; profileId: string }
  | { kind: 'ssh'; profileId: string; cwd?: string };

export async function openTerminalProfileFromHome(target: TerminalHomeOpenTarget) {
  const barStore = useBarStore();
  const requestId = crypto.randomUUID();

  barStore.openTab('/terminal', '终端', 'terminal');
  const routeTarget = {
    path: '/terminal',
    query: {
      openTerminalRequestId: requestId,
      ...(target.kind === 'local'
        ? { openLocalProfileId: target.profileId }
        : { connectSshProfileId: target.profileId, ...(target.cwd ? { cwd: target.cwd } : {}) }),
    },
  };

  if (router.currentRoute.value.path === '/terminal') {
    await router.replace(routeTarget);
  } else {
    await router.push(routeTarget);
  }
  barStore.activateTabByUrl('/terminal');
}
