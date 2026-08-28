import { describe, expect, it } from 'vitest';
import { shouldSuppressTerminalResponses } from './terminal-buffer-replay';

describe('shouldSuppressTerminalResponses', () => {
  it('suppresses responses while replaying an initial or replaced buffer', () => {
    expect(shouldSuppressTerminalResponses('', 'vim output', false)).toBe(true);
    expect(shouldSuppressTerminalResponses('old output', 'new output', true)).toBe(true);
  });

  it('allows responses for a live buffer append', () => {
    expect(shouldSuppressTerminalResponses('', 'first live output', true)).toBe(false);
    expect(shouldSuppressTerminalResponses('old output', 'old output\r\nnext output', true)).toBe(false);
  });
});
