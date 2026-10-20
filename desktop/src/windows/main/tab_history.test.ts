import { describe, expect, it } from 'vitest';
import { choosePreviousTab } from './tab_history';

describe('bottom bar tab history', () => {
  it('returns the most recently activated surviving tab after close', () => {
    expect(
      choosePreviousTab(
        ['home', 'plugins', 'plugin:demo'],
        ['home', 'plugins', 'plugin:demo'],
        new Set(['home', 'plugins'])
      )
    ).toBe('plugins');
  });

  it('falls back to the first fixed tab when no activation history survives', () => {
    expect(choosePreviousTab(['home', 'plugin:demo'], ['plugin:demo'], new Set(['home']))).toBe('home');
  });
});
