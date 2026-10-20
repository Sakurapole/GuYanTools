import { type Component, reactive, ref, shallowRef } from 'vue';
import { notifyError } from './useInAppNotification';

/**
 * 右键菜单项定义
 */
export interface ContextMenuItem {
  /** 唯一标识 */
  id: string;
  /** 显示文本 */
  label: string;
  /** 图标组件（Vue component） */
  icon?: Component;
  /** 图标 props（传递给图标组件的属性） */
  iconProps?: Record<string, unknown>;
  /** 是否为危险操作（红色高亮） */
  danger?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 此项之前是否插入分割线 */
  divided?: boolean;
  /** 子菜单项 */
  children?: ContextMenuItem[];
  /** 点击后执行的动作 */
  action?: () => void;
}

// ─── 全局单例状态 ───
const visible = ref(false);
const position = reactive({ x: 0, y: 0 });
const items = shallowRef<ContextMenuItem[]>([]);
let menuRevision = 0;

/**
 * 打开右键菜单（自动关闭已打开的菜单）
 */
function open(x: number, y: number, menuItems: ContextMenuItem[]) {
  const revision = ++menuRevision;
  items.value = menuItems;
  position.x = x;
  position.y = y;
  visible.value = true;
  const api = typeof window === 'undefined' ? undefined : window.pluginHostApi;
  if (!api) return;
  void api
    .listContributions()
    .then((summary) => {
      if (!visible.value || revision !== menuRevision) return;
      const pluginItems = summary.menus
        .filter(({ contribution }) => contribution.target === 'context')
        .map(({ pluginId, contribution }): ContextMenuItem => ({
          id: `plugin-context:${pluginId}:${contribution.id}`,
          label: contribution.title,
          action: () => {
            void api.executePluginCommand(pluginId, contribution.commandId).catch((error) => {
              notifyError(error, `插件命令执行失败：${contribution.title}`);
            });
          },
        }));
      if (pluginItems.length) {
        items.value = [
          ...menuItems,
          {
            id: 'plugin-context-contributions',
            label: '插件',
            divided: menuItems.length > 0,
            children: pluginItems,
          },
        ];
      }
    })
    .catch((error) => {
      console.warn('[ContextMenu] Failed to load plugin contributions:', error);
    });
}

/**
 * 关闭右键菜单
 */
function close() {
  ++menuRevision;
  visible.value = false;
  items.value = [];
}

/**
 * 全局右键菜单管理 composable（单例）
 *
 * 核心特性：
 * - 全局唯一菜单实例，任何地方调用 `open()` 会自动关闭上一个菜单
 * - 数据驱动：通过传入 `ContextMenuItem[]` 定义菜单内容
 * - 渲染由 `GlobalContextMenu.vue` 组件负责
 */
export function useContextMenu() {
  return { visible, position, items, open, close };
}
