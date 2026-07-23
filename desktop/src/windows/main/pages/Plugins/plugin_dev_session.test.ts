import { describe, expect, it } from 'vitest';
import { transitionPluginDevSession } from './plugin_dev_session';

describe('plugin dev session UI state', () => {
  it('tracks connect and reconnect lifecycle', () => {
    let state = transitionPluginDevSession('disconnected', 'connect');
    state = transitionPluginDevSession(state, 'connected');
    state = transitionPluginDevSession(state, 'retry');
    state = transitionPluginDevSession(state, 'disconnect');
    expect(state).toBe('disconnected');
  });
});
