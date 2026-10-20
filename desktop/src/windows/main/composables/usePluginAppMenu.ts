import { ref, shallowRef } from 'vue';
import type { PluginContributionsSummary } from '@/contracts/plugin_host';
import { notifyError } from './useInAppNotification';

type PluginAppMenuItem = PluginContributionsSummary['menus'][number];

export function usePluginAppMenu() {
  const visible = ref(false);
  const items = shallowRef<PluginAppMenuItem[]>([]);
  let revision = 0;

  async function open(): Promise<void> {
    const request = ++revision;
    visible.value = true;
    items.value = [];
    const api = window.pluginHostApi;
    if (!api) return;
    try {
      const contributions = await api.listContributions();
      if (request !== revision || !visible.value) return;
      items.value = contributions.menus.filter(({ contribution }) => contribution.target === 'app');
    } catch (error) {
      if (request === revision) notifyError(error, '插件菜单加载失败');
    }
  }

  function close(): void {
    ++revision;
    visible.value = false;
    items.value = [];
  }

  async function execute(item: PluginAppMenuItem): Promise<void> {
    close();
    try {
      await window.pluginHostApi?.executePluginCommand(item.pluginId, item.contribution.commandId);
    } catch (error) {
      notifyError(error, `插件命令执行失败：${item.contribution.title}`);
    }
  }

  return { visible, items, open, close, execute };
}
