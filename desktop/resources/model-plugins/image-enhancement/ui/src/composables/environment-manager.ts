import type {
  ModelPythonEnvironment,
  ModelPackageManager,
} from '../../../../../../src/contracts/plugin_model';

export type EnvironmentManager = 'venv' | 'conda' | 'uv';
export const MANAGER_PREFERENCE_KEY = 'image-runtime.manager.v1';
export const ENVIRONMENT_MANAGERS = [
  { value: 'venv', label: 'venv · pip' },
  { value: 'conda', label: 'Conda' },
  { value: 'uv', label: 'uv · uv pip' },
] satisfies Array<{ value: EnvironmentManager; label: string }>;
export const MANAGER_LABELS: Record<EnvironmentManager, string> = {
  venv: 'venv',
  conda: 'Conda',
  uv: 'uv',
};

export function isEnvironmentManager(value: unknown): value is EnvironmentManager {
  return value === 'venv' || value === 'conda' || value === 'uv';
}

export function environmentManagerOf(
  environment: ModelPythonEnvironment
): EnvironmentManager | undefined {
  if (environment.manager) return environment.manager;
  if (environment.kind === 'system') return undefined;
  if (environment.kind === 'conda' || environment.kind === 'uv') return environment.kind;
  if (environment.kind === 'managed' && environment.condaPath) return 'conda';
  return 'venv';
}

export function selectManagerEnvironment(
  environments: ModelPythonEnvironment[],
  manager: EnvironmentManager,
  previousId?: string,
  activeId?: string
): string {
  const scoped = environments.filter((item) => environmentManagerOf(item) === manager);
  return (
    scoped.find((item) => item.id === previousId)?.id ??
    scoped.find((item) => item.id === activeId || item.active)?.id ??
    scoped.find((item) => item.managed || item.kind === 'managed')?.id ??
    ''
  );
}

export function packageManagersFor(manager: EnvironmentManager): ModelPackageManager[] {
  return manager === 'conda' ? ['conda', 'pip'] : manager === 'uv' ? ['uv'] : ['pip'];
}
