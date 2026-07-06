<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import AddIcon from '@/windows/main/components/svgs/icons/AddIcon.vue';
import DeleteIcon from '@/windows/main/components/svgs/icons/DeleteIcon.vue';
import EditIcon from '@/windows/main/components/svgs/icons/EditIcon.vue';
import OpenIcon from '@/windows/main/components/svgs/icons/OpenIcon.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTree from '@/windows/main/components/ui/UiTree.vue';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { UiTreeDropPayload, UiTreeEventPayload, UiTreeNodeData } from '@/windows/main/components/ui/ui_tree';
import type { SshProfile, SshProfileFolder, SshSessionDescriptor } from '@/contracts/ssh';

const SSH_CONFIG_UNGROUPED_ID = 'ssh-config-ungrouped';

type SshConfigTreeNodeKind = 'folder' | 'profile' | 'group';
type SshConfigTreeNode = UiTreeNodeData & {
  kind: SshConfigTreeNodeKind;
  data?: SshProfileFolder | SshProfile;
};

const props = withDefaults(defineProps<{
  connectingProfileIds?: string[];
  showActiveSessions?: boolean;
  showProfiles?: boolean;
  activeSectionLabel?: string;
  profileSectionLabel?: string;
}>(), {
  connectingProfileIds: () => [],
  showActiveSessions: true,
  showProfiles: true,
  activeSectionLabel: '活跃连接',
  profileSectionLabel: 'SSH 配置',
});

const emit = defineEmits<{
  /** User wants to open the profile edit dialog */
  editProfile: [profile: SshProfile | null];
  /** User wants to create a profile inside a group */
  createProfileInGroup: [groupId?: string];
  /** User wants to open the key manager */
  openKeyManager: [];
  /** User wants to connect to a profile */
  connect: [profile: SshProfile];
  /** User switched to an already active session */
  focusSession: [session: SshSessionDescriptor];
  /** User requested disconnect */
  disconnect: [sessionId: string];
}>();

const sshStore = useSshStore();
const { show: showConfirm } = useConfirmDialog();
const { open: openContextMenu } = useContextMenu();

const searchQuery = ref('');
const selectedConfigNodeId = ref('');
const configTreeExpandedIds = ref<string[]>([]);
const configTreeHydrated = ref(false);
const groupDialogVisible = ref(false);
const editingGroupId = ref('');
const groupForm = reactive({
  label: '',
  parentId: '',
});

const sshFolders = computed(() =>
  [...sshStore.folders]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.label.localeCompare(b.label, 'zh-CN')),
);
const sshFolderIds = computed(() => new Set(sshFolders.value.map((group) => group.id)));
const filteredProfiles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const profiles = [...sshStore.profiles].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'),
  );
  if (!q) return profiles;
  return profiles.filter(
    (profile) =>
      profile.label.toLowerCase().includes(q) ||
      profile.host.toLowerCase().includes(q) ||
      profile.username.toLowerCase().includes(q),
  );
});
const selectedConfigTreeNodeId = computed(() =>
  selectedConfigNodeId.value || (sshStore.activeSshSession ? profileTreeNodeId(sshStore.activeSshSession.profileId) : ''),
);
const flattenedGroups = computed(() => flattenGroups());
const groupParentOptions = computed(() => [
  { label: '根目录', value: '' },
  ...flattenedGroups.value
    .filter((item) => item.group.id !== editingGroupId.value && !isDescendantGroup(editingGroupId.value, item.group.id))
    .map((item) => ({
      label: `${'  '.repeat(item.depth)}${item.group.label}`,
      value: item.group.id,
    })),
]);
const configTreeNodes = computed<SshConfigTreeNode[]>(() => buildConfigTreeNodes());

watch(() => sshStore.activeSshSession?.profileId, (profileId) => {
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

function statusColor(status: string) {
  if (status === 'connected') return 'ssh-dot--connected';
  if (status === 'connecting') return 'ssh-dot--connecting';
  return 'ssh-dot--idle';
}

function profileSessionId(profileId: string): string | null {
  return sshStore.mainSessions.find((session) => session.profileId === profileId)?.sessionId ?? null;
}

function isSessionActive(sessionId: string) {
  return sshStore.activeSshSessionId === sessionId;
}

function isProfileConnecting(profileId: string) {
  return props.connectingProfileIds.includes(profileId);
}

function groupNodeId(id: string) {
  return `folder:${id}`;
}

function profileTreeNodeId(id: string) {
  return `profile:${id}`;
}

function profileGroupId(profileId: string) {
  const groupId = sshStore.profiles.find((profile) => profile.id === profileId)?.folderId ?? '';
  return groupId && sshFolderIds.value.has(groupId) ? groupId : '';
}

function groupsByParent(parentId = '') {
  return sshFolders.value.filter((group) => (group.parentId ?? '') === parentId);
}

function flattenGroups(parentId = '', depth = 0): Array<{ group: SshProfileFolder; depth: number }> {
  const output: Array<{ group: SshProfileFolder; depth: number }> = [];
  for (const group of groupsByParent(parentId)) {
    output.push({ group, depth });
    output.push(...flattenGroups(group.id, depth + 1));
  }
  return output;
}

function profilesInGroup(groupId: string) {
  return filteredProfiles.value.filter((profile) => profileGroupId(profile.id) === groupId);
}

function allProfilesInGroup(groupId: string) {
  return [...sshStore.profiles]
    .filter((profile) => profileGroupId(profile.id) === groupId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'));
}

function countProfilesInGroup(groupId: string): number {
  const directProfiles = sshStore.profiles.filter((profile) => profileGroupId(profile.id) === groupId).length;
  return directProfiles + groupsByParent(groupId).reduce((total, group) => total + countProfilesInGroup(group.id), 0);
}

function buildProfileTreeNode(profile: SshProfile): SshConfigTreeNode {
  const linkedSessionId = profileSessionId(profile.id);
  const connecting = isProfileConnecting(profile.id);
  return {
    id: profileTreeNodeId(profile.id),
    label: profile.label,
    tooltip: `${profile.username}@${profile.host}:${profile.port}`,
    meta: `${profile.username}@${profile.host}:${profile.port}`,
    badge: connecting ? '连接中' : linkedSessionId ? '已连接' : '',
    iconText: 'SSH',
    selectable: true,
    kind: 'profile',
    data: profile,
  };
}

function buildGroupTreeNode(group: SshProfileFolder): SshConfigTreeNode | null {
  const childGroups = groupsByParent(group.id)
    .map((item) => buildGroupTreeNode(item))
    .filter((item): item is SshConfigTreeNode => Boolean(item));
  const childProfiles = profilesInGroup(group.id).map((profile) => buildProfileTreeNode(profile));
  const searching = Boolean(searchQuery.value.trim());
  const children = [...childGroups, ...childProfiles];
  if (searching && !children.length && !group.label.toLowerCase().includes(searchQuery.value.trim().toLowerCase())) {
    return null;
  }

  return {
    id: groupNodeId(group.id),
    label: group.label,
    badge: String(countProfilesInGroup(group.id)),
    selectable: false,
    kind: 'folder',
    data: group,
    children,
  };
}

function buildConfigTreeNodes(): SshConfigTreeNode[] {
  const rootFolders = groupsByParent()
    .map((group) => buildGroupTreeNode(group))
    .filter((node): node is SshConfigTreeNode => Boolean(node));
  const rootProfiles = profilesInGroup('').map((profile) => buildProfileTreeNode(profile));

  if (rootProfiles.length) {
    rootFolders.unshift({
      id: SSH_CONFIG_UNGROUPED_ID,
      label: '未分组',
      badge: String(rootProfiles.length),
      selectable: false,
      kind: 'group',
      children: rootProfiles,
    });
  }

  return rootFolders;
}

function collectExpandableIds(nodes: SshConfigTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children?.length) {
      ids.push(node.id, ...collectExpandableIds(node.children as SshConfigTreeNode[]));
    }
  }
  return ids;
}

function collectAncestorNodeIds(nodes: SshConfigTreeNode[], targetId: string, parents: string[] = []): string[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return parents;
    }
    if (node.children?.length) {
      const found = collectAncestorNodeIds(node.children as SshConfigTreeNode[], targetId, [...parents, node.id]);
      if (found.length) {
        return found;
      }
    }
  }
  return [];
}

function nextGroupSortOrder(parentId = '') {
  const siblings = groupsByParent(parentId);
  return siblings.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
}

function nextProfileSortOrder(groupId = '') {
  const siblings = allProfilesInGroup(groupId);
  return siblings.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
}

function siblingSortOrder(index: number) {
  return (index + 1) * 10;
}

function openCreateGroupDialog(parentId = '') {
  editingGroupId.value = '';
  groupForm.label = '';
  groupForm.parentId = parentId;
  groupDialogVisible.value = true;
}

function openEditGroupDialog(group: SshProfileFolder) {
  editingGroupId.value = group.id;
  groupForm.label = group.label;
  groupForm.parentId = group.parentId ?? '';
  groupDialogVisible.value = true;
}

async function saveGroup() {
  const label = groupForm.label.trim();
  if (!label) return;
  const parentId = groupForm.parentId;
  const editingGroup = editingGroupId.value ? sshFolders.value.find((group) => group.id === editingGroupId.value) : null;
  if (editingGroup) {
    if (editingGroup.id === parentId || isDescendantGroup(editingGroup.id, parentId)) {
      return;
    }
    await sshStore.updateFolder({
      id: editingGroup.id,
      label,
      parentId,
      sortOrder: (editingGroup.parentId ?? '') === parentId ? editingGroup.sortOrder : nextGroupSortOrder(parentId),
    });
    groupDialogVisible.value = false;
    return;
  }

  const group = await sshStore.createFolder({
    label,
    parentId: parentId || undefined,
  });
  configTreeExpandedIds.value = Array.from(new Set([...configTreeExpandedIds.value, parentId ? groupNodeId(parentId) : groupNodeId(group.id)]));
  groupDialogVisible.value = false;
}

async function deleteGroup(group: SshProfileFolder) {
  const profileCount = countProfilesInGroup(group.id);
  const suffix = profileCount ? `，其中 ${profileCount} 个 SSH 配置会移动到未分组` : '';
  const confirmed = await showConfirm({
    title: '删除 SSH 分组',
    message: `删除分组“${group.label}”及其子分组吗？${suffix}`,
    confirmText: '删除',
    danger: true,
  });
  if (!confirmed) return;
  await sshStore.deleteFolder(group.id);
}

async function moveProfileToGroup(profile: SshProfile, groupId: string) {
  await sshStore.updateProfile({
    id: profile.id,
    folderId: groupId,
    sortOrder: nextProfileSortOrder(groupId),
  });
}

async function reorderProfileAround(profile: SshProfile, targetProfile: SshProfile, position: 'before' | 'after') {
  const groupId = profileGroupId(targetProfile.id);
  const siblings = allProfilesInGroup(groupId).filter((item) => item.id !== profile.id);
  const targetIndex = siblings.findIndex((item) => item.id === targetProfile.id);
  if (targetIndex === -1) return;
  siblings.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, profile);
  for (const [index, item] of siblings.entries()) {
    await sshStore.updateProfile({
      id: item.id,
      folderId: groupId,
      sortOrder: siblingSortOrder(index),
    });
  }
}

async function reorderGroupAround(group: SshProfileFolder, targetGroup: SshProfileFolder, position: 'before' | 'after') {
  if (group.id === targetGroup.id) return;
  const parentId = targetGroup.parentId ?? '';
  if (group.id === parentId || isDescendantGroup(group.id, parentId)) return;
  const siblings = groupsByParent(parentId).filter((item) => item.id !== group.id);
  const targetIndex = siblings.findIndex((item) => item.id === targetGroup.id);
  if (targetIndex === -1) return;
  siblings.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, group);
  for (const [index, item] of siblings.entries()) {
    await sshStore.updateFolder({
      id: item.id,
      parentId,
      sortOrder: siblingSortOrder(index),
    });
  }
}

function isDescendantGroup(parentId: string, maybeChildId: string): boolean {
  if (!maybeChildId) return false;
  const child = sshFolders.value.find((group) => group.id === maybeChildId);
  if (!child?.parentId) return false;
  if (child.parentId === parentId) return true;
  return isDescendantGroup(parentId, child.parentId);
}

async function moveGroupToParent(group: SshProfileFolder, parentId: string) {
  if (group.id === parentId || isDescendantGroup(group.id, parentId)) {
    return;
  }
  await sshStore.updateFolder({
    id: group.id,
    parentId,
    sortOrder: nextGroupSortOrder(parentId),
  });
}

function duplicateProfileLabel(profile: SshProfile) {
  const base = `${profile.label} 副本`;
  const labels = new Set(sshStore.profiles.map((item) => item.label));
  if (!labels.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!labels.has(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

async function duplicateProfile(profile: SshProfile) {
  const groupId = profileGroupId(profile.id);
  const copied = await sshStore.createProfile({
    label: duplicateProfileLabel(profile),
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authType: profile.authType,
    savePassword: false,
    privateKeyPath: profile.privateKeyPath,
    certificatePath: profile.certificatePath,
    hostCaKeyPath: profile.hostCaKeyPath,
    jumpHostJson: profile.jumpHostJson,
    autoReconnect: profile.autoReconnect,
    folderId: groupId || undefined,
    color: profile.color,
    tags: profile.tags,
  });
  const updated = await sshStore.updateProfile({
    id: copied.id,
    folderId: groupId,
    sortOrder: nextProfileSortOrder(groupId),
  });
  selectedConfigNodeId.value = profileTreeNodeId(updated.id);
  emit('editProfile', updated);
}

function targetGroupId(targetNode: SshConfigTreeNode) {
  if (targetNode.kind === 'folder' && targetNode.data) {
    return (targetNode.data as SshProfileFolder).id;
  }
  if (targetNode.kind === 'profile' && targetNode.data) {
    return profileGroupId((targetNode.data as SshProfile).id);
  }
  return '';
}

async function handleConfigTreeDrop(payload: UiTreeDropPayload) {
  const draggedNode = payload.draggedNode as SshConfigTreeNode;
  const targetNode = payload.node as SshConfigTreeNode;
  if (draggedNode.id === targetNode.id) return;

  if (draggedNode.kind === 'profile' && draggedNode.data) {
    const draggedProfile = draggedNode.data as SshProfile;
    if ((payload.position === 'before' || payload.position === 'after') && targetNode.kind === 'profile' && targetNode.data) {
      await reorderProfileAround(draggedProfile, targetNode.data as SshProfile, payload.position);
      return;
    }
    await moveProfileToGroup(draggedProfile, targetGroupId(targetNode));
    return;
  }

  if (draggedNode.kind === 'folder' && draggedNode.data) {
    const draggedGroup = draggedNode.data as SshProfileFolder;
    if ((payload.position === 'before' || payload.position === 'after') && targetNode.kind === 'folder' && targetNode.data) {
      await reorderGroupAround(draggedGroup, targetNode.data as SshProfileFolder, payload.position);
      return;
    }
    await moveGroupToParent(draggedGroup, targetGroupId(targetNode));
  }
}

function handleConfigTreeSelect(node: UiTreeNodeData) {
  selectedConfigNodeId.value = node.id;
}

function handleConfigTreeActivate(node: UiTreeNodeData) {
  const configNode = node as SshConfigTreeNode;
  if (configNode.kind !== 'profile' || !configNode.data) {
    handleConfigTreeSelect(node);
    return;
  }
  emit('connect', configNode.data as SshProfile);
}

function openConfigNodeContextMenu(payload: UiTreeEventPayload) {
  const node = payload.node as SshConfigTreeNode;
  if (node.kind === 'profile' && node.data) {
    const profile = node.data as SshProfile;
    const linkedSession = sshStore.mainSessions.find((session) => session.profileId === profile.id);
    openContextMenu(payload.event.clientX, payload.event.clientY, [
      {
        id: `ssh-connect-${profile.id}`,
        label: '新建连接',
        icon: AddIcon,
        disabled: isProfileConnecting(profile.id),
        action: () => emit('connect', profile),
      },
      ...(linkedSession ? [{
        id: `ssh-focus-${profile.id}`,
        label: '切换到已连接会话',
        icon: OpenIcon,
        action: () => emit('focusSession', linkedSession),
      }] : []),
      {
        id: `ssh-edit-${profile.id}`,
        label: '编辑配置',
        icon: EditIcon,
        divided: true,
        action: () => emit('editProfile', profile),
      },
      {
        id: `ssh-duplicate-${profile.id}`,
        label: '复制配置',
        icon: IconRenderer,
        iconProps: { icon: 'iconify:lucide:copy', size: 14 },
        action: () => {
          void duplicateProfile(profile);
        },
      },
      {
        id: `ssh-delete-${profile.id}`,
        label: '删除配置',
        icon: DeleteIcon,
        danger: true,
        action: () => {
          void deleteProfile(profile);
        },
      },
    ]);
    return;
  }

  if (node.kind === 'folder' && node.data) {
    const group = node.data as SshProfileFolder;
    openContextMenu(payload.event.clientX, payload.event.clientY, [
      {
        id: `ssh-group-new-profile-${group.id}`,
        label: '新建连接',
        icon: AddIcon,
        action: () => emit('createProfileInGroup', group.id),
      },
      {
        id: `ssh-group-new-child-${group.id}`,
        label: '新建子分组',
        icon: AddIcon,
        action: () => {
          openCreateGroupDialog(group.id);
        },
      },
      {
        id: `ssh-group-edit-${group.id}`,
        label: '编辑分组',
        icon: EditIcon,
        divided: true,
        action: () => {
          openEditGroupDialog(group);
        },
      },
      {
        id: `ssh-group-delete-${group.id}`,
        label: '删除分组',
        icon: DeleteIcon,
        danger: true,
        action: () => {
          void deleteGroup(group);
        },
      },
    ]);
    return;
  }

  openContextMenu(payload.event.clientX, payload.event.clientY, [
    {
      id: 'ssh-root-new-profile',
      label: '新建未分组连接',
      icon: AddIcon,
      action: () => emit('createProfileInGroup'),
    },
    {
      id: 'ssh-root-new-group',
      label: '新建分组',
      icon: AddIcon,
      divided: true,
      action: () => {
        openCreateGroupDialog();
      },
    },
  ]);
}

async function deleteProfile(profile: SshProfile) {
  const confirmed = await showConfirm({
    title: '删除 SSH 配置',
    message: `删除 SSH 配置“${profile.label}”？`,
    confirmText: '删除',
    danger: true,
  });
  if (!confirmed) return;
  await sshStore.deleteProfile(profile.id);
}
</script>

<template>
  <div class="ssh-tab">
    <template v-if="props.showActiveSessions && sshStore.mainSessions.length > 0">
      <div class="ssh-tab__section-label">{{ props.activeSectionLabel }}</div>
      <div
        v-for="session in sshStore.mainSessions"
        :key="session.sessionId"
        class="ssh-session-item"
        :class="{ 'ssh-session-item--active': isSessionActive(session.sessionId) }"
        role="button"
        tabindex="0"
        @click="emit('focusSession', session)"
        @keydown.enter="emit('focusSession', session)"
      >
        <div class="ssh-session-item__left">
          <span class="ssh-dot" :class="statusColor(session.status)" />
          <span class="ssh-session-item__label">{{ session.profileLabel }}</span>
        </div>
        <UiIconButton
          class="ssh-session-item__action"
          size="sm"
          variant="ghost"
          title="断开连接"
          @click.stop="emit('disconnect', session.sessionId)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </UiIconButton>
      </div>
      <div class="ssh-tab__divider" />
    </template>

    <template v-if="props.showProfiles">
      <section class="ssh-tab__section ssh-tab__section--actions">
        <UiButton class="ssh-action-btn" size="sm" variant="primary" @click="emit('createProfileInGroup')">
          <template #prefix>
            <AddIcon width="15" height="15" />
          </template>
          新建连接
        </UiButton>
        <UiButton class="ssh-action-btn" size="sm" variant="secondary" @click="openCreateGroupDialog()">
          <template #prefix>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M2.5 5.5h4l1 1h6v6.5h-11z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
              <path d="M11.5 2.5v3M10 4h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </template>
          新建分组
        </UiButton>
      </section>

      <div class="ssh-tab__section-header">
        <span class="ssh-tab__section-label">{{ props.profileSectionLabel }}</span>
        <div class="ssh-tab__actions">
          <UiIconButton size="sm" variant="ghost" title="SSH 密钥管理" @click="emit('openKeyManager')">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13.5 2.5l-1.4 1.4" />
              <path d="M5.5 6.5L2.5 9.5l2.4 2.4 3-3" />
              <path d="M9.5 2.5a3 3 0 1 1-4.2 4.2L8.5 3.5" />
              <path d="M4 12l1.5 1.5" />
            </svg>
          </UiIconButton>
        </div>
      </div>

      <div v-if="sshStore.profiles.length > 3" class="ssh-search">
        <UiInput v-model="searchQuery" class="ssh-search__input" size="sm" placeholder="搜索配置...">
          <template #prefix>
            <svg class="ssh-search__icon" viewBox="0 0 24 24" width="13" height="13"
              stroke="currentColor" stroke-width="2" fill="none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </template>
        </UiInput>
      </div>

      <UiTree
        class="ssh-config-tree"
        :nodes="configTreeNodes"
        :selected-id="selectedConfigTreeNodeId"
        :expanded-ids="configTreeExpandedIds"
        :indent-size="0"
        empty-text="还没有 SSH 配置，先创建一个连接。"
        @update:expandedIds="configTreeExpandedIds = $event"
        @select="handleConfigTreeSelect"
        @activate="handleConfigTreeActivate"
        @contextmenu="openConfigNodeContextMenu"
        @drop="handleConfigTreeDrop"
      />

      <div v-if="sshStore.profiles.length === 0" class="ssh-empty-action">
        <UiButton size="sm" block variant="secondary" @click="emit('createProfileInGroup')">添加第一个配置</UiButton>
      </div>
      <div v-else-if="searchQuery.trim() && configTreeNodes.length === 0" class="ssh-no-results">未找到匹配的配置</div>
    </template>

    <UiDialog
      :model-value="groupDialogVisible"
      width="520"
      max-width="92vw"
      @update:modelValue="groupDialogVisible = $event"
    >
      <template #header>
        <div class="ssh-dialog__header">{{ editingGroupId ? '编辑分组' : '新建分组' }}</div>
      </template>
      <div class="ssh-dialog__body">
        <UiField label="名称" required>
          <UiInput v-model="groupForm.label" placeholder="例如：生产服务器" @keydown.enter="saveGroup" />
        </UiField>
        <UiField label="父级分组">
          <UiSelect v-model="groupForm.parentId" :options="groupParentOptions" />
        </UiField>
      </div>
      <template #footer>
        <div class="ssh-dialog__footer">
          <UiButton variant="ghost" @click="groupDialogVisible = false">取消</UiButton>
          <UiButton variant="primary" @click="saveGroup">保存</UiButton>
        </div>
      </template>
    </UiDialog>
  </div>
</template>

<style lang="scss" scoped>
.ssh-tab {
  --ssh-sidebar-item-radius: var(--ui-radius-sm);

  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 8px;
}

.ssh-tab__section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &--actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    padding: 0 4px 2px;
  }
}

.ssh-action-btn {
  width: 100%;
}

.ssh-tab__section-label {
  margin: 0;
  padding: 4px 4px 2px;
  color: var(--ui-text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ssh-tab__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.ssh-tab__actions {
  display: flex;
  gap: 6px;
}

.ssh-tab__divider {
  height: 1px;
  margin: 2px 4px;
  background: var(--ui-border-subtle);
}

.ssh-search {
  margin: -2px 4px 0;

  &__icon {
    color: var(--ui-text-muted);
    pointer-events: none;
  }

  &__input.ui-input-affix-wrapper {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--ui-border-subtle);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface-overlay);
    color: var(--ui-text-primary);
    font-size: 12px;
    transition: border-color 0.18s;

    &.ui-input-affix-wrapper--focused {
      border-color: var(--ui-border-accent-soft);
    }
  }

  &__input :deep(.ui-input::placeholder) {
    color: var(--ui-text-subtle);
  }
}

.ssh-session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--ssh-sidebar-item-radius);
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: all 0.18s;

  &:hover {
    background: var(--ui-button-ghost-hover-bg);

    .ssh-session-item__action {
      opacity: 1;
    }
  }

  &--active {
    border-color: var(--ui-border-accent-soft);
    background: var(--ui-tabs-active-bg);
    color: var(--ui-text-primary);
  }

  &__left {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  &__label {
    overflow: hidden;
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__action {
    display: flex;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    padding: 2px;
    border: none;
    border-radius: 3px;
    opacity: 0;
    background: transparent;
    color: var(--ui-text-muted);
    transition: all 0.15s;
    transform: none;

    &:hover:not(:disabled) {
      background: var(--ui-state-error-subtle);
      color: var(--ui-state-error);
      transform: none;
    }

    :deep(svg) {
      fill: none;
      stroke: currentColor;
    }
  }
}

.ssh-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;

  &--connected {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
    animation: ssh-pulse 2s ease-in-out infinite;
  }

  &--connecting {
    background: #f59e0b;
    animation: ssh-pulse 0.8s ease-in-out infinite;
  }

  &--idle {
    background: var(--ui-text-subtle);
  }
}

.ssh-config-tree {
  padding: 0 4px 8px;
}

:deep(.ui-tree-node--group) {
  margin-top: 2px;
}

:deep(.ui-tree-node--folder > .ui-tree-node__row),
:deep(.ui-tree-node--group > .ui-tree-node__row) {
  min-height: 34px;
  background: color-mix(in srgb, var(--ui-surface-overlay) 66%, transparent);
  color: var(--ui-text-secondary);
}

:deep(.ui-tree-node--folder > .ui-tree-node__row:hover),
:deep(.ui-tree-node--group > .ui-tree-node__row:hover) {
  background: color-mix(in srgb, var(--primary-color) 8%, var(--ui-surface-overlay));
}

:deep(.ui-tree-node--profile > .ui-tree-node__row) {
  min-height: 42px;
  background: color-mix(in srgb, var(--ui-tabs-active-bg) 58%, transparent);
}

:deep(.ui-tree-node--profile > .ui-tree-node__row:hover) {
  border-color: var(--ui-border-accent-soft);
  background: color-mix(in srgb, var(--ui-button-ghost-hover-bg) 72%, var(--ui-tabs-active-bg));
}

:deep(.ui-tree-node__meta) {
  font-family: Consolas, 'Cascadia Mono', monospace;
}

:deep(.ui-tree-node__badge) {
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssh-empty-action {
  padding: 0 4px 8px;
}

.ssh-no-results {
  padding: 18px 12px;
  color: var(--ui-text-muted);
  font-size: 12px;
  text-align: center;
}

.ssh-dialog__header {
  padding: 14px 18px;
  color: var(--ui-text-primary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
}

.ssh-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}

.ssh-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
}

@keyframes ssh-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
