import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');

describe('Stencil style contract', () => {
  it('loads tokens through the Stencil global stylesheet', () => {
    expect(readFileSync(join(sourceRoot, 'global/gt-tokens.css'), 'utf8'))
      .toContain("@import '../styles/tokens.css'");
  });

  it('keeps the published token entry as a stylesheet-only re-export', () => {
    expect(readFileSync(join(sourceRoot, 'tokens.css'), 'utf8').trim())
      .toBe("@import './styles/tokens.css';");
  });

  it('keeps fixed styles out of component behavior files', () => {
    const source = readFileSync(join(sourceRoot, 'components/gt-button/gt-button.tsx'), 'utf8');

    expect(source).not.toMatch(/<style|innerHTML|:host\s*\{|background\s*:/);
    expect(source).toContain("styleUrl: 'gt-button.css'");
  });
});
