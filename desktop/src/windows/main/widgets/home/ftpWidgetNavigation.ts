import type { FtpProfile } from '@/contracts/ftp';
import { router } from '../../routes/router';
import { useBarStore } from '../../stores/bar_store';
import { useFtpStore } from '../../stores/ftp_store';

export async function openFtpProfileFromHome(profile: FtpProfile, remotePath?: string) {
  const ftpStore = useFtpStore();
  const barStore = useBarStore();
  const targetPath = remotePath || profile.defaultRemotePath || '/';
  const requestId = crypto.randomUUID();

  ftpStore.setPendingOpenRequest({
    requestId,
    source: 'profile',
    profileId: profile.id,
    label: profile.label,
    remotePath: targetPath,
  });

  barStore.openTab('/ftp', '文件传输', 'ftp');
  const routeTarget = {
    path: '/ftp',
    query: { openRequest: requestId },
  };

  if (router.currentRoute.value.path === '/ftp') {
    await router.replace(routeTarget);
  } else {
    await router.push(routeTarget);
  }
  barStore.activateTabByUrl('/ftp');
}
