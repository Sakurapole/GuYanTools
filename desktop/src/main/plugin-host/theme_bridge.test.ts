import { describe, expect, it } from 'vitest';
import { isPluginThemeDescriptor, toPluginThemeDescriptor } from './theme_bridge';

describe('plugin theme bridge', () => {
  it('maps host themes to the public token descriptor', () => {
    expect(toPluginThemeDescriptor('dark')).toEqual({ mode: 'dark', tokensVersion: '1.0.0' });
  });

  it('rejects malformed theme events', () => {
    expect(isPluginThemeDescriptor({ mode: 'blue' })).toBe(false);
    expect(isPluginThemeDescriptor({ mode: 'light', tokensVersion: '1.0.0' })).toBe(true);
  });
});
