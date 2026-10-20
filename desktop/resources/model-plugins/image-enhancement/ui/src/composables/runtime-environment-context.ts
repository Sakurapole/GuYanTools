import { inject, type InjectionKey, type UnwrapNestedRefs } from 'vue';
import type { useRuntimeEnvironment } from './useRuntimeEnvironment';

export type RuntimeEnvironmentState = UnwrapNestedRefs<ReturnType<typeof useRuntimeEnvironment>>;
export const runtimeEnvironmentKey: InjectionKey<RuntimeEnvironmentState> =
  Symbol('runtimeEnvironment');
export function useRuntimeEnvironmentContext() {
  const state = inject(runtimeEnvironmentKey);
  if (!state) throw new Error('运行环境页面上下文不可用');
  return state;
}
