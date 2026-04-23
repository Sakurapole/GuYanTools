import { computed, onMounted, reactive, ref, watch, type ComputedRef } from 'vue';
import { panelFilterSummary, clonePanelFilterState, matchesPanelFilter } from '../utils/ftpFilters';
import { baseName, buildPathSuggestions } from '../utils/ftpPaths';
import { sortEntries } from '../utils/ftpSort';
import type { FtpConnectionDescriptor } from '@/contracts/ftp';
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
  const localWorkspaceSelectValue = computed(() => (
    options.ftpStore.localWorkspaces.includes(options.ftpStore.localPath) ? options.ftpStore.localPath : ''
  ));
  const localWorkspaceOptions = computed(() => [
    { label: '快速切换工作目录', value: '' },
    ...options.ftpStore.localWorkspaces.map((path) => ({
      label: `${baseName(path) || path} · ${path}`,
      value: path,
    })),
  ]);
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
    const nextPreset: PanelFilterPreset = {
      id: crypto.randomUUID(),
      name,
      filter: clonePanelFilterState(source),
    };
    filterPresets.value = [
      ...filterPresets.value.filter((preset) => preset.name !== name),
      nextPreset,
    ];
    persistFilterPresets();
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
    filterPresets.value = filterPresets.value.filter((item) => item.id !== presetId);
    persistFilterPresets();
    if (kind === 'local') {
      localFilterPresetId.value = '';
    } else {
      remoteFilterPresetId.value = '';
    }
  }

  function loadFilterPresets() {
    try {
      const raw = window.localStorage.getItem('guyantools.ftp.filter-presets');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      filterPresets.value = parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          id: String(item.id || crypto.randomUUID()),
          name: String(item.name || '未命名预设'),
          builtIn: false,
          filter: {
            mode: item.filter?.mode === 'files' || item.filter?.mode === 'folders' ? item.filter.mode : 'all',
            operator: item.filter?.operator === 'or' ? 'or' : 'and',
            hideHidden: Boolean(item.filter?.hideHidden),
            extensionQuery: String(item.filter?.extensionQuery || ''),
            minSizeKb: String(item.filter?.minSizeKb || ''),
            maxSizeKb: String(item.filter?.maxSizeKb || ''),
            modifiedWithinDays: String(item.filter?.modifiedWithinDays || ''),
          },
        }));
    } catch {
      filterPresets.value = [];
    }
  }

  function persistFilterPresets() {
    window.localStorage.setItem('guyantools.ftp.filter-presets', JSON.stringify(filterPresets.value));
  }

  async function switchLocalWorkspace(path: string) {
    if (!path) return;
    await options.ftpStore.openLocalWorkspace(path);
  }

  async function addCurrentLocalWorkspace() {
    await options.ftpStore.addLocalWorkspace(options.ftpStore.localPath);
  }

  async function pickLocalWorkspace() {
    const nextPath = await options.ftpStore.pickLocalWorkspace();
    if (!nextPath) return;
    await options.ftpStore.openLocalWorkspace(nextPath);
  }

  async function removeCurrentLocalWorkspace() {
    await options.ftpStore.removeLocalWorkspace(options.ftpStore.localPath);
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
    loadFilterPresets();
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
    localWorkspaceSelectValue,
    localWorkspaceOptions,
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
    addCurrentLocalWorkspace,
    pickLocalWorkspace,
    removeCurrentLocalWorkspace,
    openLocalPath,
    openRemotePath,
    toggleLocalSortDirection,
    toggleRemoteSortDirection,
    toggleSearch,
    setPanelSortKey,
    togglePanelSortDirection,
  };
}
