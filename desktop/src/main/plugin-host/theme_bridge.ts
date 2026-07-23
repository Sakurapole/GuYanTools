import type { PluginThemeDescriptor } from '@/contracts/plugin_host';
import type { AppTheme } from '@/contracts/app_config';

export const PLUGIN_UI_TOKENS_VERSION = '1.0.0';

export function toPluginThemeDescriptor(theme: AppTheme): PluginThemeDescriptor {
  return { mode: theme, tokensVersion: PLUGIN_UI_TOKENS_VERSION };
}

export function isPluginThemeDescriptor(value: unknown): value is PluginThemeDescriptor {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<PluginThemeDescriptor>;
  return (input.mode === 'light' || input.mode === 'dark') && typeof input.tokensVersion === 'string' && input.tokensVersion.length > 0;
}
