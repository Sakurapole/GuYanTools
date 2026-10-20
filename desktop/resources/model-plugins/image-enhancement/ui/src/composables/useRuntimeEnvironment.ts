import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
  ModelRuntimeApi,
  ModelEnvironmentSnapshot,
  ModelRuntimeDiagnostics,
  ModelPackageRecord,
  ModelPackageManager,
  ModelDependencyProfile,
} from '../../../../../../src/contracts/plugin_model';
import type { JobRecord } from '../../../../../../src/contracts/plugin_media';
import type { PluginApi } from '../types/image-workbench';
import {
  ENVIRONMENT_MANAGERS,
  MANAGER_LABELS,
  MANAGER_PREFERENCE_KEY,
  environmentManagerOf,
  isEnvironmentManager,
  packageManagersFor,
  selectManagerEnvironment,
  type EnvironmentManager,
} from './environment-manager';

export type EnvironmentJob = Awaited<ReturnType<ModelRuntimeApi['createManagedEnvironment']>>;
export type RuntimeNotifier = {
  notify: (
    tone: 'info' | 'success' | 'warning' | 'error',
    message: unknown,
    title?: string
  ) => Promise<boolean> | void;
  job: (job: JobRecord) => void;
};
export type RuntimeEnvironmentProps = {
  models?: ModelRuntimeApi;
  jobs?: { onEvent: (callback: (job: EnvironmentJob) => void) => (() => void) | void };
  jobRunning: boolean;
  storage?: PluginApi['storage'];
};
export type RuntimeEnvironmentEmit = {
  (event: 'job', job: EnvironmentJob): void;
  (event: 'changed'): void;
  (event: 'open', url: string): void;
};

export function useRuntimeEnvironment(
  props: RuntimeEnvironmentProps,
  emit: RuntimeEnvironmentEmit,
  notifier?: RuntimeNotifier
) {
  const snapshot = ref<ModelEnvironmentSnapshot>({ environments: [], tools: [], errors: [] });
  const diagnostics = ref<ModelRuntimeDiagnostics | null>(null);
  const packages = ref<ModelPackageRecord[]>([]);
  const profiles = ref<ModelDependencyProfile[]>([]);
  const environmentId = ref('');
  const baseId = ref('');
  const createName = ref('图像处理 Python');
  const pythonVersion = ref('3.10');
  const environmentManager = ref<EnvironmentManager>('venv');
  const createManager = computed(() => environmentManager.value);
  const packageManager = ref<ModelPackageManager>('pip');
  const packageSearch = ref('');
  const packageSpecs = ref('');
  const exportText = ref('');
  const profileId = ref('cpu');
  const error = ref('');
  const message = ref('');
  const busy = ref(false);
  const lastJob = ref<EnvironmentJob | null>(null);
  const pendingRemoval = ref(false);
  let offJobs: (() => void) | undefined;
  let refreshAfterAction = false;
  let managerInitialized = false;
  const previousSelections: Partial<Record<EnvironmentManager, string>> = {};
  const managerLabel = computed(() => MANAGER_LABELS[environmentManager.value]);
  const managerOptions = ENVIRONMENT_MANAGERS;
  const managerEnvironments = computed(() =>
    snapshot.value.environments.filter(
      (item) => environmentManagerOf(item) === environmentManager.value
    )
  );
  const activeEnvironment = computed(() =>
    snapshot.value.environments.find((item) => item.id === snapshot.value.activeId || item.active)
  );
  const managerTools = computed(() =>
    snapshot.value.tools.filter(
      (tool) =>
        tool.kind === (environmentManager.value === 'venv' ? 'python' : environmentManager.value)
    )
  );
  const managerAvailable = computed(
    () =>
      environmentManager.value === 'venv' ||
      managerTools.value.length > 0 ||
      (environmentManager.value === 'conda' &&
        managerEnvironments.value.some((item) => item.condaPath))
  );

  const selected = computed(() =>
    managerEnvironments.value.find((item) => item.id === environmentId.value)
  );
  const locked = computed(
    () =>
      busy.value ||
      props.jobRunning ||
      Boolean(lastJob.value && !['completed', 'failed', 'cancelled'].includes(lastJob.value.status))
  );
  const writable = computed(() =>
    Boolean(selected.value?.managed || selected.value?.kind === 'managed')
  );
  const visiblePackages = computed(() =>
    packages.value.filter((item) =>
      `${item.name} ${item.version}`.toLowerCase().includes(packageSearch.value.toLowerCase())
    )
  );
  const envOptions = computed(() =>
    managerEnvironments.value.map((item) => ({
      label: `${item.label} · ${item.version}${item.active ? ' · 生效' : ''}`,
      value: item.id,
    }))
  );
  const baseOptions = computed(() =>
    snapshot.value.environments.map((item) => ({
      value: item.id,
      label: `Python ${item.version} · ${item.pythonPath}`,
    }))
  );
  const packageOptions = computed(() =>
    packageManagersFor(environmentManager.value).map((value) => ({
      value,
      label: value === 'conda' ? 'Conda 包' : value === 'uv' ? 'uv pip / PyPI' : 'pip / PyPI',
      disabled:
        value === 'conda'
          ? !selected.value?.condaPath
          : value === 'uv'
            ? !managerAvailable.value
            : false,
    }))
  );
  const packagesAvailable = computed(
    () =>
      Boolean(selected.value) &&
      !packageOptions.value.find((item) => item.value === packageManager.value)?.disabled
  );
  const pythonOptions = ['3.9', '3.10', '3.11', '3.12', '3.13', '3.14'].map((value) => ({
    value,
    label: value === '3.10' ? 'Python 3.10 · 当前插件要求' : `Python ${value}`,
  }));
  const profileOptions = computed(() =>
    profiles.value.map((profile) => ({
      value: profile.id,
      label: profile.label,
      disabled:
        profile.device === 'cuda' &&
        (!diagnostics.value?.gpus.length ||
          !diagnostics.value.driverCudaMax ||
          Number(diagnostics.value.driverCudaMax) < Number(profile.cudaVersion)),
    }))
  );
  const canCreate = computed(
    () =>
      !locked.value &&
      managerAvailable.value &&
      Boolean(createName.value.trim()) &&
      (createManager.value !== 'venv' ||
        snapshot.value.environments.some(
          (item) => item.id === baseId.value && item.version.startsWith(`${pythonVersion.value}.`)
        ))
  );
  const selectedProfile = computed(() =>
    profiles.value.find((item) => item.id === profileId.value)
  );

  function normalizePackageManager() {
    if (!packageOptions.value.some((item) => item.value === packageManager.value && !item.disabled))
      packageManager.value =
        packageOptions.value.find((item) => !item.disabled)?.value ??
        packageManagersFor(environmentManager.value)[0];
  }
  function resetPackageManager() {
    packageManager.value = packageManagersFor(environmentManager.value)[0];
    normalizePackageManager();
  }
  async function persistManager() {
    if (!props.storage) return;
    try {
      await props.storage.set(MANAGER_PREFERENCE_KEY, environmentManager.value);
    } catch (cause) {
      void notifier?.notify('warning', cause, '管理方式未能保存');
    }
  }
  async function initialize() {
    if (props.storage) {
      try {
        const saved = await props.storage.get(MANAGER_PREFERENCE_KEY);
        if (isEnvironmentManager(saved)) {
          environmentManager.value = saved;
          managerInitialized = true;
          resetPackageManager();
        }
      } catch (cause) {
        void notifier?.notify('warning', cause, '管理方式未能恢复');
      }
    }
    await refresh();
  }
  async function switchManager(value: string) {
    if (locked.value || !isEnvironmentManager(value) || value === environmentManager.value) return;
    previousSelections[environmentManager.value] = environmentId.value;
    await act(async () => {
      environmentManager.value = value;
      managerInitialized = true;
      environmentId.value = selectManagerEnvironment(
        snapshot.value.environments,
        value,
        previousSelections[value],
        snapshot.value.activeId
      );
      resetPackageManager();
      pendingRemoval.value = false;
      packageSearch.value = '';
      packageSpecs.value = '';
      diagnostics.value = null;
      await persistManager();
      await loadPackages();
      await inspectSelectedRuntime(environmentId.value || undefined);
    });
  }
  async function changePackageManager(value: string) {
    if (
      locked.value ||
      !packageOptions.value.some((item) => item.value === value && !item.disabled)
    )
      return;
    await act(async () => {
      packageManager.value = value as ModelPackageManager;
      await loadPackages();
    });
  }

  function runtimeApi() {
    if (!props.models?.getEnvironmentSnapshot)
      throw new Error('运行时未更新，请重启 GuYanTools 后打开运行环境。');
    return props.models;
  }
  async function act(task: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    message.value = '';
    try {
      await task();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      void notifier?.notify('error', cause, '运行环境');
    } finally {
      busy.value = false;
      if (refreshAfterAction) {
        refreshAfterAction = false;
        void refresh();
      }
    }
  }
  async function loadSnapshot() {
    snapshot.value = await runtimeApi().getEnvironmentSnapshot();
    const previousId = environmentId.value;
    if (!managerInitialized) {
      const initial =
        activeEnvironment.value ??
        snapshot.value.environments.find((item) => item.managed || item.kind === 'managed');
      environmentManager.value = (initial && environmentManagerOf(initial)) || 'venv';
      managerInitialized = true;
      resetPackageManager();
    }
    environmentId.value = selectManagerEnvironment(
      snapshot.value.environments,
      environmentManager.value,
      environmentId.value,
      snapshot.value.activeId
    );
    if (previousId !== environmentId.value || !previousId) resetPackageManager();
    else normalizePackageManager();
    if (!baseId.value)
      baseId.value =
        snapshot.value.environments.find((item) =>
          item.version.startsWith(`${pythonVersion.value}.`)
        )?.id ??
        snapshot.value.environments[0]?.id ??
        '';
    profiles.value = await runtimeApi().getDependencyProfiles();
  }
  async function loadPackages() {
    packages.value = [];
    exportText.value = '';
    if (packagesAvailable.value)
      packages.value = await runtimeApi().listPackages(environmentId.value, packageManager.value);
  }
  async function inspectSelectedRuntime(id?: string) {
    diagnostics.value = await runtimeApi().inspectRuntime(id);
    if (diagnostics.value.framework?.error)
      void notifier?.notify('error', diagnostics.value.framework.error, '框架诊断');
  }
  async function refresh() {
    await act(async () => {
      await loadSnapshot();
      await loadPackages();
      await inspectSelectedRuntime(environmentId.value || undefined);
    });
  }
  async function viewEnvironment(id: string) {
    if (locked.value) return;
    if (!managerEnvironments.value.some((item) => item.id === id)) return;
    environmentId.value = id;
    previousSelections[environmentManager.value] = id;
    resetPackageManager();
    pendingRemoval.value = false;
    packageSpecs.value = '';
    diagnostics.value = null;
    await act(async () => {
      await loadPackages();
      await inspectSelectedRuntime(id);
    });
  }
  async function importEnvironment() {
    await act(async () => {
      const result = await runtimeApi().importEnvironment();
      if (result) {
        environmentManager.value = environmentManagerOf(result) ?? environmentManager.value;
        environmentId.value = result.id;
        resetPackageManager();
        await persistManager();
      }
      await loadSnapshot();
      await loadPackages();
    });
  }
  async function installMiniforge() {
    await act(async () => {
      await runtimeApi().installMiniforge();
      await loadSnapshot();
      message.value = 'Miniforge 已安装到应用目录，可以创建 Conda prefix 环境。';
      void notifier?.notify('success', message.value, '运行环境');
    });
  }
  function recordJob(job: EnvironmentJob) {
    lastJob.value = job;
    emit('job', job);
    void notifier?.job(job);
  }
  async function createEnvironment() {
    await act(async () =>
      recordJob(
        await runtimeApi().createManagedEnvironment({
          name: createName.value,
          manager: createManager.value,
          pythonVersion: pythonVersion.value,
          baseId:
            environmentManager.value === 'venv'
              ? baseId.value || undefined
              : environmentManager.value === 'conda'
                ? managerEnvironments.value.find((item) => item.condaPath)?.id
                : undefined,
        })
      )
    );
  }
  async function useEnvironment() {
    await act(async () => {
      await runtimeApi().selectEnvironment(environmentId.value);
      await loadSnapshot();
      message.value = '生效环境已切换，后续依赖安装和推理使用此解释器。';
      void notifier?.notify('success', message.value, '运行环境');
      emit('changed');
    });
  }
  async function clearActive() {
    await act(async () => {
      await runtimeApi().clearActiveEnvironment();
      await loadSnapshot();
      message.value = '已取消指定生效环境；有旧版默认环境时会回到默认环境。';
      void notifier?.notify('info', message.value, '运行环境');
      emit('changed');
    });
  }
  async function removeEnvironment() {
    pendingRemoval.value = false;
    await act(async () => recordJob(await runtimeApi().removeEnvironment(environmentId.value)));
  }
  function requirements() {
    const specs = packageSpecs.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    if (!specs.length) throw new Error('请填写包名或包名==版本，每行一个。');
    return specs;
  }
  async function changePackages(action: 'install' | 'upgrade' | 'remove', single?: string) {
    await act(async () =>
      recordJob(
        await runtimeApi().changePackages({
          environmentId: environmentId.value,
          manager: packageManager.value,
          action,
          packages: single ? [single] : requirements(),
        })
      )
    );
  }
  async function checkPackages() {
    await act(async () => {
      const result = await runtimeApi().checkPackages(environmentId.value, packageManager.value);
      if (result.ok) {
        message.value = result.details;
        void notifier?.notify('success', result.details, '依赖检查');
      } else {
        error.value = result.details;
        void notifier?.notify('error', result.details, '依赖检查');
      }
    });
  }
  async function exportPackages() {
    await act(async () => {
      exportText.value = await runtimeApi().exportPackages(
        environmentId.value,
        packageManager.value
      );
      message.value = '依赖文本已导出，可选中复制。';
      void notifier?.notify('success', message.value, '依赖管理');
    });
  }
  async function installProfile() {
    await act(async () => {
      if (!selectedProfile.value || !selected.value?.active)
        throw new Error('请先选择生效环境与依赖组合。');
      recordJob(
        await runtimeApi().installDependencies(
          selectedProfile.value.device,
          selectedProfile.value.id
        )
      );
    });
  }
  async function cancel() {
    if (lastJob.value)
      await act(async () => recordJob(await runtimeApi().cancel(lastJob.value!.id)));
  }

  onMounted(() => {
    const unsubscribe = props.jobs?.onEvent((job) => {
      if (
        ![
          'model-environment-create',
          'model-environment-remove',
          'model-packages',
          'model-dependencies',
        ].includes(job.kind)
      )
        return;
      lastJob.value = job;
      if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        void notifier?.job(job);
        if (job.status === 'failed') {
          error.value = typeof job.error === 'string' ? job.error : JSON.stringify(job.error);
          void notifier?.notify('error', job.error || '运行环境任务失败。', '运行环境任务');
        }
        if (busy.value) refreshAfterAction = true;
        else void refresh();
        emit('changed');
      }
    });
    if (typeof unsubscribe === 'function') offJobs = unsubscribe;
    return initialize();
  });
  onBeforeUnmount(() => offJobs?.());

  return {
    environmentManager,
    managerLabel,
    managerOptions,
    managerEnvironments,
    managerTools,
    managerAvailable,
    activeEnvironment,
    baseOptions,
    packageOptions,
    packagesAvailable,
    switchManager,
    changePackageManager,
    snapshot,
    diagnostics,
    packages,
    selected,
    locked,
    writable,
    visiblePackages,
    envOptions,
    pythonOptions,
    profileOptions,
    canCreate,
    selectedProfile,
    environmentId,
    baseId,
    createName,
    pythonVersion,
    createManager,
    packageManager,
    packageSearch,
    packageSpecs,
    exportText,
    profileId,
    error,
    message,
    busy,
    lastJob,
    pendingRemoval,
    act,
    refresh,
    loadPackages,
    viewEnvironment,
    importEnvironment,
    installMiniforge,
    createEnvironment,
    useEnvironment,
    clearActive,
    removeEnvironment,
    changePackages,
    checkPackages,
    exportPackages,
    installProfile,
    cancel,
  };
}
