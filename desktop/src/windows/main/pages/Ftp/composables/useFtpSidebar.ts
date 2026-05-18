import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import AddIcon from '@/windows/main/components/svgs/icons/AddIcon.vue';
import DeleteIcon from '@/windows/main/components/svgs/icons/DeleteIcon.vue';
import EditIcon from '@/windows/main/components/svgs/icons/EditIcon.vue';
import OpenIcon from '@/windows/main/components/svgs/icons/OpenIcon.vue';
import SettingsIcon from '@/windows/main/components/svgs/icons/SettingsIcon.vue';
import { useFtpStore } from '@/windows/main/stores/ftp_store';
import type { ContextMenuItem } from '@/windows/main/composables/useContextMenu';
import type { UiTreeDropPayload, UiTreeEventPayload, UiTreeNodeData } from '@/windows/main/components/ui/ui_tree';
import type { FtpConnectionDescriptor, FtpProfile, FtpSessionFolder } from '@/contracts/ftp';
import type { ConfigTreeNode } from '../types';

const CONFIG_TREE_UNGROUPED_ID = 'ftp-config-ungrouped';

type UseFtpSidebarOptions = {
  ftpStore: ReturnType<typeof useFtpStore>;
  activeSession: ComputedRef<FtpConnectionDescriptor | null>;
  editingFolderId: Ref<string>;
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
  openCreateDialog: (folderId?: string) => void;
  openCreateFolderDialog: (parentId?: string) => void;
  openEditDialog: (profile: FtpProfile) => void;
  openEditFolderDialog: (folder: FtpSessionFolder) => void;
  removeFolder: (folder: FtpSessionFolder) => Promise<void>;
  removeProfile: (profile: FtpProfile) => Promise<void>;
  connectProfile: (profile: FtpProfile) => Promise<void>;
};

export function useFtpSidebar(options: UseFtpSidebarOptions) {
  const sidebarCollapsed = ref(false);
  const selectedConfigNodeId = ref('');
  const configTreeExpandedIds = ref<string[]>([]);
  const configTreeHydrated = ref(false);

  const flattenedFolders = computed(() => flattenFolders());
  const folderSelectOptions = computed(() => [
    { label: '未分组', value: '' },
    ...flattenedFolders.value.map((item) => ({
      label: `${'  '.repeat(item.depth)}${item.folder.label}`,
      value: item.folder.id,
    })),
  ]);
  const folderParentOptions = computed(() => [
    { label: '根目录', value: '' },
    ...flattenedFolders.value
      .filter((item) => item.folder.id !== options.editingFolderId.value)
      .map((item) => ({
        label: `${'  '.repeat(item.depth)}${item.folder.label}`,
        value: item.folder.id,
      })),
  ]);
  const ungroupedProfiles = computed(() =>
    options.ftpStore.profiles
      .filter((profile) => !profile.folderId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN')),
  );
  const restoreFailureProfiles = computed(() =>
    options.ftpStore.restoreFailures
      .map((item) => ({
        ...item,
        profile: options.ftpStore.profiles.find((profile) => profile.id === item.profileId) ?? null,
      }))
      .filter((item) => item.profile),
  );
  const selectedConfigTreeNodeId = computed(() =>
    selectedConfigNodeId.value || (options.activeSession.value ? `profile:${options.activeSession.value.profileId}` : ''),
  );
  const configTreeNodes = computed<ConfigTreeNode[]>(() => buildConfigTreeNodes());

  watch(() => options.activeSession.value?.profileId, (profileId) => {
    if (profileId) {
      selectedConfigNodeId.value = profileTreeNodeId(profileId);
    }
  }, { immediate: true });

  watch([configTreeNodes, selectedConfigTreeNodeId], ([nodes, selectedId]) => {
    const expandableIds = collectExpandableIds(nodes);
    const nextExpanded = configTreeHydrated.value
      ? configTreeExpandedIds.value.filter((id) => expandableIds.includes(id))
      : [...expandableIds];
    const ancestorIds = selectedId ? collectAncestorNodeIds(nodes, selectedId) : [];
    configTreeExpandedIds.value = Array.from(new Set([...nextExpanded, ...ancestorIds]));
    configTreeHydrated.value = true;
  }, { immediate: true });

  function flattenFolders(parentId?: string, depth = 0): Array<{ folder: FtpSessionFolder; depth: number }> {
    const nodes = options.ftpStore.folders
      .filter((folder) => (folder.parentId ?? '') === (parentId ?? ''))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt);
    const output: Array<{ folder: FtpSessionFolder; depth: number }> = [];
    for (const folder of nodes) {
      output.push({ folder, depth });
      output.push(...flattenFolders(folder.id, depth + 1));
    }
    return output;
  }

  function profilesInFolder(folderId: string) {
    return options.ftpStore.profiles
      .filter((profile) => profile.folderId === folderId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'));
  }

  function folderTreeNodeId(id: string) {
    return `folder:${id}`;
  }

  function profileTreeNodeId(id: string) {
    return `profile:${id}`;
  }

  function countProfilesInFolder(folderId: string): number {
    const directProfiles = profilesInFolder(folderId).length;
    const childFolders = options.ftpStore.folders.filter((folder) => folder.parentId === folderId);
    return directProfiles + childFolders.reduce((total, folder) => total + countProfilesInFolder(folder.id), 0);
  }

  function buildProfileTreeNode(profile: FtpProfile): ConfigTreeNode {
    return {
      id: profileTreeNodeId(profile.id),
      label: profile.label,
      tooltip: profile.label,
      iconText: profile.protocol.toUpperCase(),
      selectable: true,
      kind: 'profile',
      data: profile,
    };
  }

  function buildFolderTreeNode(folder: FtpSessionFolder): ConfigTreeNode {
    const childFolders = options.ftpStore.folders
      .filter((item) => item.parentId === folder.id)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
      .map((item) => buildFolderTreeNode(item));
    const childProfiles = profilesInFolder(folder.id).map((profile) => buildProfileTreeNode(profile));
    const totalProfiles = countProfilesInFolder(folder.id);

    return {
      id: folderTreeNodeId(folder.id),
      label: folder.label,
      badge: totalProfiles ? String(totalProfiles) : '',
      selectable: false,
      kind: 'folder',
      data: folder,
      children: [...childFolders, ...childProfiles],
    };
  }

  function buildConfigTreeNodes(): ConfigTreeNode[] {
    const rootFolders = options.ftpStore.folders
      .filter((folder) => !folder.parentId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
      .map((folder) => buildFolderTreeNode(folder));
    const rootProfiles = ungroupedProfiles.value.map((profile) => buildProfileTreeNode(profile));

    if (rootProfiles.length) {
      rootFolders.unshift({
        id: CONFIG_TREE_UNGROUPED_ID,
        label: '未分组',
        badge: String(rootProfiles.length),
        selectable: false,
        kind: 'group',
        children: rootProfiles,
      });
    }

    return rootFolders;
  }

  function runProfilePrimaryAction(profile: FtpProfile) {
    const linkedSession = options.ftpStore.sessions.find((session) => session.profileId === profile.id);
    if (linkedSession) {
      options.ftpStore.focusSession(linkedSession.sessionId);
      return;
    }

    void options.connectProfile(profile);
  }

  function collectExpandableIds(nodes: ConfigTreeNode[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      if (node.children?.length) {
        ids.push(node.id, ...collectExpandableIds(node.children as ConfigTreeNode[]));
      }
    }
    return ids;
  }

  function collectAncestorNodeIds(nodes: ConfigTreeNode[], targetId: string, parents: string[] = []): string[] {
    for (const node of nodes) {
      if (node.id === targetId) {
        return parents;
      }
      if (node.children?.length) {
        const found = collectAncestorNodeIds(node.children as ConfigTreeNode[], targetId, [...parents, node.id]);
        if (found.length) {
          return found;
        }
      }
    }
    return [];
  }

  function handleConfigTreeSelect(node: UiTreeNodeData) {
    const configNode = node as ConfigTreeNode;
    selectedConfigNodeId.value = configNode.id;
  }

  function handleConfigTreeActivate(node: UiTreeNodeData) {
    const configNode = node as ConfigTreeNode;
    if (configNode.kind !== 'profile') {
      handleConfigTreeSelect(node);
      return;
    }

    runProfilePrimaryAction(configNode.data as FtpProfile);
  }

  function openConfigNodeContextMenu(payload: UiTreeEventPayload) {
    const node = payload.node as ConfigTreeNode;
    if (node.kind === 'profile' && node.data) {
      const profile = node.data as FtpProfile;
      const linkedSessions = options.ftpStore.sessions.filter((session) => session.profileId === profile.id);
      const latestSession = linkedSessions[linkedSessions.length - 1];
      options.openContextMenu(payload.event.clientX, payload.event.clientY, [
        {
          id: `config-new-connection-${profile.id}`,
          label: '新建连接',
          icon: AddIcon,
          action: () => {
            void options.connectProfile(profile);
          },
        },
        ...(latestSession ? [{
          id: `config-focus-latest-${profile.id}`,
          label: '切换到最近会话',
          icon: OpenIcon,
          action: () => {
            options.ftpStore.focusSession(latestSession.sessionId);
          },
        }] : []),
        {
          id: `config-edit-${profile.id}`,
          label: '编辑配置',
          icon: EditIcon,
          divided: true,
          action: () => options.openEditDialog(profile),
        },
        {
          id: `config-delete-${profile.id}`,
          label: '删除配置',
          icon: DeleteIcon,
          danger: true,
          action: () => {
            void options.removeProfile(profile);
          },
        },
      ]);
      return;
    }

    if (node.kind === 'folder' && node.data) {
      const folder = node.data as FtpSessionFolder;
      options.openContextMenu(payload.event.clientX, payload.event.clientY, [
        {
          id: `folder-new-profile-${folder.id}`,
          label: '新建连接',
          icon: AddIcon,
          action: () => options.openCreateDialog(folder.id),
        },
        {
          id: `folder-new-child-${folder.id}`,
          label: '新建子分组',
          icon: AddIcon,
          action: () => options.openCreateFolderDialog(folder.id),
        },
        {
          id: `folder-edit-${folder.id}`,
          label: '编辑分组',
          icon: EditIcon,
          divided: true,
          action: () => options.openEditFolderDialog(folder),
        },
        {
          id: `folder-delete-${folder.id}`,
          label: '删除分组',
          icon: DeleteIcon,
          danger: true,
          action: () => {
            void options.removeFolder(folder);
          },
        },
      ]);
      return;
    }

    if (node.kind === 'group') {
      options.openContextMenu(payload.event.clientX, payload.event.clientY, [
        {
          id: 'group-new-profile',
          label: '新建未分组连接',
          icon: AddIcon,
          action: () => options.openCreateDialog(),
        },
        {
          id: 'group-new-folder',
          label: '新建分组',
          icon: AddIcon,
          divided: true,
          action: () => options.openCreateFolderDialog(),
        },
      ]);
    }
  }

  function buildCollapsedConfigMenuItems(nodes: ConfigTreeNode[]): ContextMenuItem[] {
    return nodes.map((node) => {
      if (node.kind === 'profile' && node.data) {
        const profile = node.data as FtpProfile;
        const linkedSession = options.ftpStore.sessions.find((session) => session.profileId === profile.id);
        return {
          id: `collapsed-${node.id}`,
          label: linkedSession ? `${profile.label} · 已连接` : profile.label,
          icon: linkedSession ? OpenIcon : SettingsIcon,
          action: () => runProfilePrimaryAction(profile),
        } satisfies ContextMenuItem;
      }

      return {
        id: `collapsed-${node.id}`,
        label: node.label,
        icon: OpenIcon,
        children: node.children?.length ? buildCollapsedConfigMenuItems(node.children as ConfigTreeNode[]) : undefined,
      } satisfies ContextMenuItem;
    });
  }

  function toggleSidebarCollapsed() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    options.closeContextMenu();
  }

  function openCollapsedConfigsMenu(event: MouseEvent | FocusEvent) {
    if (!sidebarCollapsed.value || !configTreeNodes.value.length) {
      return;
    }

    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    options.openContextMenu(rect.right + 8, rect.top, buildCollapsedConfigMenuItems(configTreeNodes.value));
  }

  function sessionStatusTone(status: string) {
    if (status === 'connecting') return 'connecting';
    if (status === 'disconnected') return 'disconnected';
    return 'connected';
  }

  async function handleConfigTreeDrop(payload: UiTreeDropPayload) {
    const draggedNode = payload.draggedNode as ConfigTreeNode;
    const targetNode = payload.node as ConfigTreeNode;
    if (draggedNode.id === targetNode.id) return;

    if (draggedNode.kind === 'profile' && draggedNode.data) {
      await moveProfileNode(draggedNode.data as FtpProfile, targetNode);
      return;
    }

    if (draggedNode.kind === 'folder' && draggedNode.data) {
      await moveFolderNode(draggedNode.data as FtpSessionFolder, targetNode);
    }
  }

  async function moveProfileNode(profile: FtpProfile, targetNode: ConfigTreeNode) {
    if (targetNode.kind === 'folder' && targetNode.data) {
      const folder = targetNode.data as FtpSessionFolder;
      const sortOrder = nextProfileSortOrder(folder.id);
      await options.ftpStore.updateProfile({ id: profile.id, folderId: folder.id, sortOrder });
      return;
    }

    if (targetNode.kind === 'group') {
      const sortOrder = nextProfileSortOrder('');
      await options.ftpStore.updateProfile({ id: profile.id, folderId: '', sortOrder });
      return;
    }

    if (targetNode.kind === 'profile' && targetNode.data) {
      const targetProfile = targetNode.data as FtpProfile;
      await reorderProfiles(profile, targetProfile.folderId ?? '', targetProfile.id);
    }
  }

  async function moveFolderNode(folder: FtpSessionFolder, targetNode: ConfigTreeNode) {
    if (targetNode.kind === 'folder' && targetNode.data) {
      const targetFolder = targetNode.data as FtpSessionFolder;
      const sortOrder = nextFolderSortOrder(targetFolder.id);
      await options.ftpStore.updateFolder({ id: folder.id, parentId: targetFolder.id, sortOrder });
      return;
    }

    if (targetNode.kind === 'group') {
      const sortOrder = nextFolderSortOrder('');
      await options.ftpStore.updateFolder({ id: folder.id, parentId: '', sortOrder });
      return;
    }

    if (targetNode.kind === 'profile' && targetNode.data) {
      const targetProfile = targetNode.data as FtpProfile;
      const sortOrder = nextFolderSortOrder(targetProfile.folderId ?? '');
      await options.ftpStore.updateFolder({ id: folder.id, parentId: targetProfile.folderId ?? '', sortOrder });
    }
  }

  function nextProfileSortOrder(folderId: string) {
    const siblings = options.ftpStore.profiles.filter((profile) => (profile.folderId ?? '') === folderId);
    return siblings.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
  }

  function nextFolderSortOrder(parentId: string) {
    const siblings = options.ftpStore.folders.filter((folder) => (folder.parentId ?? '') === parentId);
    return siblings.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
  }

  async function reorderProfiles(draggedProfile: FtpProfile, targetFolderId: string, targetProfileId: string) {
    const siblings = options.ftpStore.profiles
      .filter((profile) => (profile.folderId ?? '') === targetFolderId && profile.id !== draggedProfile.id)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'));
    const targetIndex = siblings.findIndex((profile) => profile.id === targetProfileId);
    const nextProfiles = [...siblings];
    const insertIndex = targetIndex < 0 ? nextProfiles.length : targetIndex + 1;
    nextProfiles.splice(insertIndex, 0, { ...draggedProfile, folderId: targetFolderId || undefined });
    for (const [index, profile] of nextProfiles.entries()) {
      await options.ftpStore.updateProfile({
        id: profile.id,
        folderId: targetFolderId,
        sortOrder: index + 1,
      });
    }
  }

  return {
    sidebarCollapsed,
    flattenedFolders,
    folderSelectOptions,
    folderParentOptions,
    restoreFailureProfiles,
    configTreeExpandedIds,
    selectedConfigTreeNodeId,
    configTreeNodes,
    handleConfigTreeSelect,
    handleConfigTreeActivate,
    openConfigNodeContextMenu,
    handleConfigTreeDrop,
    toggleSidebarCollapsed,
    openCollapsedConfigsMenu,
    sessionStatusTone,
  };
}
