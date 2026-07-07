import type { AppSystemShortcutsConfig } from './app_config';

export type AppSystemShortcutKey = keyof AppSystemShortcutsConfig;

export type ShortcutProbeSource = 'configured' | 'default' | 'common';
export type ShortcutProbeOwner = 'app' | 'system-or-other-app' | 'available' | 'invalid';
export type ShortcutProbeStatus = 'registered' | 'available' | 'conflict' | 'invalid' | 'empty';

export interface SystemShortcutProbeResult {
  id: string;
  label: string;
  accelerator: string;
  normalizedAccelerator: string;
  source: ShortcutProbeSource;
  status: ShortcutProbeStatus;
  owner: ShortcutProbeOwner;
  message: string;
  actionKey?: AppSystemShortcutKey;
  conflictActionKey?: AppSystemShortcutKey;
  conflictLabel?: string;
}

export interface ShortcutInspectionResult {
  platform: string;
  checkedAt: number;
  actions: SystemShortcutProbeResult[];
  common: SystemShortcutProbeResult[];
  summary: {
    registered: number;
    available: number;
    conflict: number;
    invalid: number;
    empty: number;
  };
}

export interface ValidateSystemShortcutInput {
  actionKey: AppSystemShortcutKey;
  accelerator: string;
}

export interface ValidateSystemShortcutResult {
  ok: boolean;
  probe: SystemShortcutProbeResult;
}

export interface RetrySystemShortcutInput {
  actionKey: AppSystemShortcutKey;
}

export interface RetrySystemShortcutResult {
  ok: boolean;
  probe: SystemShortcutProbeResult;
}

export interface ShortcutsApi {
  inspectSystemShortcuts: () => Promise<ShortcutInspectionResult>;
  validateSystemShortcut: (input: ValidateSystemShortcutInput) => Promise<ValidateSystemShortcutResult>;
  retrySystemShortcut: (input: RetrySystemShortcutInput) => Promise<RetrySystemShortcutResult>;
}

declare global {
  interface Window {
    shortcutsApi?: ShortcutsApi;
  }
}
