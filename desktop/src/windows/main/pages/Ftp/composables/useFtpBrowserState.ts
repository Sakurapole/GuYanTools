import { computed, onMounted, reactive, ref, watch, type ComputedRef } from 'vue';
import { panelFilterSummary, clonePanelFilterState, matchesPanelFilter } from '../utils/ftpFilters';
import { baseName, buildPathSuggestions } from '../utils/ftpPaths';
import { sortEntries } from '../utils/ftpSort';
import type { FtpConnectionDescriptor, FtpFilterPresetRecord } from '@/contracts/ftp';
import type { useFtpStore } from '@/windows/main/stores/ftp_store';
import type { EntrySortKey, PanelFilterMode, PanelFilterPreset, PanelFilterState } from '../types';

const BUILTIN_FILTER_PRESETS: PanelFilterPreset[] = [
  {
    id: 'builtin-images',
    name: '图片文件',
    builtIn: true,
    filter: { mode: 'files', operator: 'and', hideHidden: false, extensionQuery: '.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg', minSizeKb: '', maxSizeKb: '', modifiedWithinDays: '' },
  },
  {
    id: 'builtin-logs',
    name: '日志与配置',
    builtIn: true,
    filter: { mode: 'files', operator: 'or', hideHidden: false, extensionQuery: '.log,.txt,.cfg,.conf,.ini,.json,.yaml,.yml', minSizeKb: '', maxSizeKb: '', modifiedWithinDays: '30' },
  },
  {
    id: 'builtin-large-files',
    name: '大文件',
    builtIn: true,
    filter: { mode: 'files', operator: 'and', hideHidden: false, extensionQuery: '', minSizeKb: '10240', maxSizeKb: '', modifiedWithinDays: '' },
  },
  {
    id: 'builtin-recent-files',
    name: '最近修改',
    builtIn: true,
    filter: { mode: 'files', operator: 'and', hideHidden: false, extensionQuery: '', minSizeKb: '', maxSizeKb: '', modifiedWithinDays: '7' },
  },
  {
    id: 'builtin-folders',
    name: '仅目录',
    builtIn: true,
    filter: { mode: 'folders', operator: 'and', hideHidden: false, extensionQuery: '', minSizeKb: '', maxSizeKb: '', modifiedWithinDays: '' },
  },
];

const LEGACY_FILTER_PRESETS_STORAGE_KEY = 'guyantools.ftp.filter-presets';
const LEGACY_FILTER_PRESETS_MIGRATED_KEY = 'guyantools.ftp.filter-presets.migrated';

type UseFtpBrowserStateOptions = {
  ftpStore: ReturnType<typeof useFtpStore>;
  activeSession: ComputedRef<FtpConnectionDescriptor | null>;
  requestEntryName: (options: {
    title: string;
    label: string;
    confirmText?: string;
    initialValue?: string;
    placeholder?: string;
  }) => Promise<string | null>;
  showConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
  }) => Promise<boolean>;
  onLocalPathChange?: () => void;
  onRemotePathChange?: () => void;
};

export function useFtpBrowserState(options: UseFtpBrowserStateOptions) {
  const localPathInput = ref('');
  const remotePathInput = ref('');
  const localFilterQuery = ref('');
  const remoteFilterQuery = ref('');
  const localSortKey = ref<EntrySortKey>('name');
  const remoteSortKey = ref<EntrySortKey>('name');
  const localSortDirection = ref<'asc' | 'desc'>('asc');
  const remoteSortDirection = ref<'asc' | 'desc'>('asc');
  const localSearchExpanded = ref(false);
  const remoteSearchExpanded = ref(false);
  const localRuleFilterExpanded = ref(false);
  const remoteRuleFilterExpanded = ref(false);
  const filterPresets = ref<PanelFilterPreset[]>([]);
  const localFilterPresetId = ref('');
  const remoteFilterPresetId = ref('');
  const localRuleFilter = reactive<PanelFilterState>({
    mode: 'all',
    operator: 'and',
    hideHidden: false,
    extensionQuery: '',
    minSizeKb: '',
    maxSizeKb: '',
    modifiedWithinDays: '',
  });
  const remoteRuleFilter = reactive<PanelFilterState>({
    mode: 'all',
    operator: 'and',
    hideHidden: false,
    extensionQuery: '',
    minSizeKb: '',
    maxSizeKb: '',
    modifiedWithinDays: '',
  });

  const filteredLocalEntries = computed(() =>
    sortEntries(
      options.ftpStore.localEntries.filter((entry) => matchesPanelFilter(entry, localFilterQuery.value, localRuleFilter)),
      localSortKey.value,
      localSortDirection.value,
    ),
  );
  const filteredRemoteEntries = computed(() =>
    sortEntries(
      options.ftpStore.remoteEntries.filter((entry) => matchesPanelFilter(entry, remoteFilterQuery.value, remoteRuleFilter)),
      remoteSortKey.value,
      remoteSortDirection.value,
    ),
  );
  const currentLocalWorkspaceBookmarked = computed(() => options.ftpStore.localWorkspaces.includes(options.ftpStore.localPath));
  const currentRemoteWorkspaceBookmarked = computed(() => {
    const profileId = options.activeSession.value?.profileId;
    if (!profileId || !options.ftpStore.remotePath) return false;
    return options.ftpStore.getRemoteWorkspaces(profileId).includes(normalizeRemoteWorkspacePath(options.ftpStore.remotePath));
  });
  const localWorkspacePaths = computed(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    const appendPath = (path: string) => {
      const key = workspacePathKey(path);
      if (!key || seen.has(key)) return;
      seen.add(key);
      paths.push(path);
    };
    options.ftpStore.localRootPaths.forEach(appendPath);
    options.ftpStore.localWorkspaces.forEach(appendPath);
    return paths;
  });
  const localWorkspaceSelectValue = computed(() => {
    const currentKey = workspacePathKey(options.ftpStore.localPath);
    return localWorkspacePaths.value.find((path) => workspacePathKey(path) === currentKey) ?? '';
  });
  const localWorkspaceOptions = computed(() => [
    { label: '快速切换工作目录', value: '', disabled: true },
    ...localWorkspacePaths.value.map((path) => ({
      label: `${workspaceOptionLabel(path)} · ${path}`,
      value: path,
    })),
  ]);
  const localWorkspaceBookmarkValues = computed(() => [...options.ftpStore.localWorkspaces]);
  const remoteWorkspacePaths = computed(() => {
    const session = options.activeSession.value;
    if (!session) return [];
    const seen = new Set<string>();
    const paths: string[] = [];
    const appendPath = (path: string) => {
      const normalized = normalizeRemoteWorkspacePath(path);
      const key = workspacePathKey(normalized);
      if (!key || seen.has(key)) return;
      seen.add(key);
      paths.push(normalized);
    };
    const profile = options.ftpStore.profiles.find((item) => item.id === session.profileId);
    appendPath(profile?.defaultRemotePath || session.remoteRoot);
    options.ftpStore.getRemoteWorkspaces(session.profileId).forEach(appendPath);
    return paths;
  });
  const remoteWorkspaceSelectValue = computed(() => {
    const currentKey = workspacePathKey(normalizeRemoteWorkspacePath(options.ftpStore.remotePath));
    return remoteWorkspacePaths.value.find((path) => workspacePathKey(path) === currentKey) ?? '';
  });
  const remoteWorkspaceOptions = computed(() => [
    { label: '快速切换远程目录', value: '', disabled: true },
    ...remoteWorkspacePaths.value.map((path) => ({
      label: `${workspaceOptionLabel(path)} · ${path}`,
      value: path,
    })),
  ]);
  const remoteWorkspaceBookmarkValues = computed(() => {
    const profileId = options.activeSession.value?.profileId;
    return profileId ? [...options.ftpStore.getRemoteWorkspaces(profileId)] : [];
  });
  const localPathSuggestions = computed(() =>
    buildPathSuggestions(options.ftpStore.localEntries, localPathInput.value),
  );
  const remotePathSuggestions = computed(() =>
    options.activeSession.value ? buildPathSuggestions(options.ftpStore.remoteEntries, remotePathInput.value) : [],
  );
  const localFilterSummary = computed(() => panelFilterSummary(localRuleFilter));
  const remoteFilterSummary = computed(() => panelFilterSummary(remoteRuleFilter));
  const allFilterPresets = computed(() => [...BUILTIN_FILTER_PRESETS, ...filterPresets.value]);
  const filterPresetOptions = computed(() => [
    { label: '选择过滤预设', value: '' },
    ...allFilterPresets.value.map((preset) => ({
      label: preset.builtIn ? `内置 · ${preset.name}` : `自定义 · ${preset.name}`,
      value: preset.id,
    })),
  ]);

  watch(() => options.ftpStore.localPath, (value) => {
    localPathInput.value = value;
    options.onLocalPathChange?.();
  }, { immediate: true });

  watch(() => options.ftpStore.remotePath, (value) => {
    remotePathInput.value = value;
    options.onRemotePathChange?.();
  }, { immediate: true });

  function toggleRuleFilter(kind: 'local' | 'remote') {
    if (kind === 'local') {
      localRuleFilterExpanded.value = !localRuleFilterExpanded.value;
      return;
    }
    remoteRuleFilterExpanded.value = !remoteRuleFilterExpanded.value;
  }

  function setRuleFilterMode(kind: 'local' | 'remote', mode: PanelFilterMode) {
    const target = kind === 'local' ? localRuleFilter : remoteRuleFilter;
    target.mode = mode;
  }

  function setRuleFilterOperator(kind: 'local' | 'remote', operator: PanelFilterState['operator']) {
    const target = kind === 'local' ? localRuleFilter : remoteRuleFilter;
    target.operator = operator;
  }

  function toggleHideHidden(kind: 'local' | 'remote') {
    const target = kind === 'local' ? localRuleFilter : remoteRuleFilter;
    target.hideHidden = !target.hideHidden;
  }

  function resetRuleFilter(kind: 'local' | 'remote') {
    const target = kind === 'local' ? localRuleFilter : remoteRuleFilter;
    target.mode = 'all';
    target.operator = 'and';
    target.hideHidden = false;
    target.extensionQuery = '';
    target.minSizeKb = '';
    target.maxSizeKb = '';
    target.modifiedWithinDays = '';
    if (kind === 'local') {
      localFilterPresetId.value = '';
    } else {
      remoteFilterPresetId.value = '';
    }
  }

  async function saveFilterPreset(kind: 'local' | 'remote') {
    const source = kind === 'local' ? localRuleFilter : remoteRuleFilter;
    const summary = panelFilterSummary(source);
    const name = await options.requestEntryName({
      title: '保存过滤预设',
      label: '预设名称',
      confirmText: '保存',
      initialValue: summary === '未启用' ? '' : summary,
      placeholder: '例如：仅日志文件',
    });
    if (!name) return;
    const existingPreset = filterPresets.value.find((preset) => preset.name === name);
    const nextPreset = await persistFilterPreset({
      id: existingPreset?.id ?? crypto.randomUUID(),
      name,
      filter: clonePanelFilterState(source),
    });
    filterPresets.value = [
      ...filterPresets.value.filter((preset) => preset.id !== nextPreset.id && preset.name !== name),
      nextPreset,
    ];
    if (kind === 'local') {
      localFilterPresetId.value = nextPreset.id;
    } else {
      remoteFilterPresetId.value = nextPreset.id;
    }
  }

  function applyFilterPreset(kind: 'local' | 'remote', presetId: string) {
    const preset = allFilterPresets.value.find((item) => item.id === presetId);
    if (!preset) return;
    const target = kind === 'local' ? localRuleFilter : remoteRuleFilter;
    target.mode = preset.filter.mode;
    target.operator = preset.filter.operator;
    target.hideHidden = preset.filter.hideHidden;
    target.extensionQuery = preset.filter.extensionQuery;
    target.minSizeKb = preset.filter.minSizeKb;
    target.maxSizeKb = preset.filter.maxSizeKb;
    target.modifiedWithinDays = preset.filter.modifiedWithinDays;
    if (kind === 'local') {
      localFilterPresetId.value = presetId;
      localRuleFilterExpanded.value = true;
    } else {
      remoteFilterPresetId.value = presetId;
      remoteRuleFilterExpanded.value = true;
    }
  }

  async function deleteSelectedFilterPreset(kind: 'local' | 'remote') {
    const presetId = kind === 'local' ? localFilterPresetId.value : remoteFilterPresetId.value;
    if (!presetId) return;
    const preset = allFilterPresets.value.find((item) => item.id === presetId);
    if (!preset || preset.builtIn) return;
    const confirmed = await options.showConfirm({
      title: '删除过滤预设',
      message: `确认删除预设“${preset.name}”吗？`,
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    await window.ftpApi.deleteFilterPreset(presetId);
    filterPresets.value = filterPresets.value.filter((item) => item.id !== presetId);
    if (kind === 'local') {
      localFilterPresetId.value = '';
    } else {
      remoteFilterPresetId.value = '';
    }
  }

  async function loadFilterPresets() {
    try {
      filterPresets.value = (await window.ftpApi.listFilterPresets())
        .filter((preset) => !preset.isBuiltin)
        .map(recordToPanelFilterPreset);
      await importLegacyFilterPresets();
    } catch (error) {
      console.warn('[Ftp] Failed to load filter presets from SQLite:', error);
      filterPresets.value = [];
    }
  }

  async function persistFilterPreset(preset: PanelFilterPreset) {
    const saved = await window.ftpApi.upsertFilterPreset({
      id: preset.id,
      label: preset.name,
      rulesJson: JSON.stringify(preset.filter),
      isBuiltin: false,
    });
    return recordToPanelFilterPreset(saved);
  }

  async function importLegacyFilterPresets() {
    if (window.localStorage.getItem(LEGACY_FILTER_PRESETS_MIGRATED_KEY) === '1') {
      return;
    }
    const legacyPresets = readLegacyFilterPresets();
    if (!legacyPresets.length) {
      window.localStorage.setItem(LEGACY_FILTER_PRESETS_MIGRATED_KEY, '1');
      return;
    }

    const existingKeys = new Set(filterPresets.value.map((preset) => preset.id));
    const existingNames = new Set(filterPresets.value.map((preset) => preset.name));
    const imported: PanelFilterPreset[] = [];
    for (const preset of legacyPresets) {
      if (existingKeys.has(preset.id) || existingNames.has(preset.name)) {
        continue;
      }
      try {
        const saved = await persistFilterPreset(preset);
        imported.push(saved);
        existingKeys.add(saved.id);
        existingNames.add(saved.name);
      } catch (error) {
        console.warn('[Ftp] Failed to import legacy filter preset:', error);
      }
    }
    if (imported.length) {
      filterPresets.value = [...filterPresets.value, ...imported];
    }
    window.localStorage.setItem(LEGACY_FILTER_PRESETS_MIGRATED_KEY, '1');
    window.localStorage.removeItem(LEGACY_FILTER_PRESETS_STORAGE_KEY);
  }

  async function switchLocalWorkspace(path: string) {
    if (!path) return;
    await options.ftpStore.openLocalWorkspace(path);
  }

  async function switchRemoteWorkspace(path: string) {
    if (!path) return;
    await options.ftpStore.openRemoteWorkspace(path);
  }

  async function addCurrentLocalWorkspace() {
    await options.ftpStore.addLocalWorkspace(options.ftpStore.localPath);
  }

  async function pickLocalWorkspace() {
    const nextPath = await options.ftpStore.pickLocalWorkspace();
    if (!nextPath) return;
    await options.ftpStore.openLocalWorkspace(nextPath);
  }

  async function removeCurrentLocalWorkspace(path?: string) {
    await options.ftpStore.removeLocalWorkspace(path || options.ftpStore.localPath);
  }

  async function addCurrentRemoteWorkspace() {
    await options.ftpStore.addRemoteWorkspace(options.ftpStore.remotePath);
  }

  async function removeCurrentRemoteWorkspace(path?: string) {
    await options.ftpStore.removeRemoteWorkspace(path || options.ftpStore.remotePath);
  }

  async function openLocalPath() {
    await options.ftpStore.refreshLocalDirectory(localPathInput.value.trim());
  }

  async function openRemotePath() {
    if (!options.activeSession.value) return;
    await options.ftpStore.refreshRemoteDirectory(remotePathInput.value.trim() || options.activeSession.value.remoteRoot);
  }

  function toggleLocalSortDirection() {
    localSortDirection.value = localSortDirection.value === 'asc' ? 'desc' : 'asc';
  }

  function toggleRemoteSortDirection() {
    remoteSortDirection.value = remoteSortDirection.value === 'asc' ? 'desc' : 'asc';
  }

  function toggleSearch(kind: 'local' | 'remote') {
    if (kind === 'local') {
      localSearchExpanded.value = !localSearchExpanded.value;
      return;
    }

    remoteSearchExpanded.value = !remoteSearchExpanded.value;
  }

  function setPanelSortKey(kind: 'local' | 'remote', sortKey: EntrySortKey) {
    if (kind === 'local') {
      localSortKey.value = sortKey;
      return;
    }

    remoteSortKey.value = sortKey;
  }

  function togglePanelSortDirection(kind: 'local' | 'remote') {
    if (kind === 'local') {
      toggleLocalSortDirection();
      return;
    }

    toggleRemoteSortDirection();
  }

  onMounted(() => {
    void loadFilterPresets();
  });

  return {
    localPathInput,
    remotePathInput,
    localFilterQuery,
    remoteFilterQuery,
    localSortKey,
    remoteSortKey,
    localSortDirection,
    remoteSortDirection,
    localSearchExpanded,
    remoteSearchExpanded,
    localRuleFilterExpanded,
    remoteRuleFilterExpanded,
    localRuleFilter,
    remoteRuleFilter,
    filterPresets,
    allFilterPresets,
    localFilterPresetId,
    remoteFilterPresetId,
    filteredLocalEntries,
    filteredRemoteEntries,
    currentLocalWorkspaceBookmarked,
    currentRemoteWorkspaceBookmarked,
    localWorkspaceSelectValue,
    localWorkspaceOptions,
    localWorkspaceBookmarkValues,
    remoteWorkspaceSelectValue,
    remoteWorkspaceOptions,
    remoteWorkspaceBookmarkValues,
    localPathSuggestions,
    remotePathSuggestions,
    localFilterSummary,
    remoteFilterSummary,
    filterPresetOptions,
    toggleRuleFilter,
    setRuleFilterMode,
    setRuleFilterOperator,
    toggleHideHidden,
    resetRuleFilter,
    saveFilterPreset,
    applyFilterPreset,
    deleteSelectedFilterPreset,
    switchLocalWorkspace,
    switchRemoteWorkspace,
    addCurrentLocalWorkspace,
    pickLocalWorkspace,
    removeCurrentLocalWorkspace,
    addCurrentRemoteWorkspace,
    removeCurrentRemoteWorkspace,
    openLocalPath,
    openRemotePath,
    toggleLocalSortDirection,
    toggleRemoteSortDirection,
    toggleSearch,
    setPanelSortKey,
    togglePanelSortDirection,
  };
}

function recordToPanelFilterPreset(record: FtpFilterPresetRecord): PanelFilterPreset {
  return {
    id: record.id,
    name: record.label,
    builtIn: record.isBuiltin,
    filter: normalizePanelFilterState(parseRulesJson(record.rulesJson)),
  };
}

function readLegacyFilterPresets(): PanelFilterPreset[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_FILTER_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        name: String(item.name || '未命名预设'),
        builtIn: false,
        filter: normalizePanelFilterState(item.filter),
      }));
  } catch {
    return [];
  }
}

function parseRulesJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizePanelFilterState(value: unknown): PanelFilterState {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    mode: item.mode === 'files' || item.mode === 'folders' ? item.mode : 'all',
    operator: item.operator === 'or' ? 'or' : 'and',
    hideHidden: Boolean(item.hideHidden),
    extensionQuery: String(item.extensionQuery || ''),
    minSizeKb: String(item.minSizeKb || ''),
    maxSizeKb: String(item.maxSizeKb || ''),
    modifiedWithinDays: String(item.modifiedWithinDays || ''),
  };
}

function workspacePathKey(path: string) {
  const normalized = path.trim();
  if (!normalized) return '';
  if (normalized === '/') return '/';
  return normalized.replace(/[\\/]+$/, '').toLowerCase();
}

function normalizeRemoteWorkspacePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (trimmed === '/') return '/';
  return trimmed.replace(/\/+$/, '');
}

function workspaceOptionLabel(path: string) {
  const normalized = path.trim();
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return `磁盘 ${normalized.slice(0, 2).toUpperCase()}`;
  }
  return baseName(normalized) || normalized;
}
