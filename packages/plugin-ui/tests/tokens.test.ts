import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

describe('plugin UI tokens', () => {
  it('exposes stable light and dark token selectors', () => {
    const tokens = fs.readFileSync(path.resolve(currentDirectory, '../src/tokens.css'), 'utf8');
    expect(tokens).toContain('--gt-color-background');
    expect(tokens).toContain('--gt-color-surface');
    expect(tokens).toContain('--gt-color-text');
    expect(tokens).toContain('--gt-color-primary');
    expect(tokens).toContain('--gt-control-height-md');
    expect(tokens).toContain(':root[data-theme="dark"]');
  });
});
