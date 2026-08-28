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

  it('publishes the global overlay layer separately from tokens', () => {
    expect(readFileSync(join(sourceRoot, 'overlay.css'), 'utf8').trim())
      .toBe("@import './styles/overlay-layer.css';");
  });

  it('bridges dialog overlays to the desktop dialog visual tokens', () => {
    const overlay = readFileSync(join(sourceRoot, 'styles/overlay-layer.css'), 'utf8');

    expect(overlay).toContain('--ui-dialog-overlay');
    expect(overlay).toContain('--ui-surface-dialog');
    expect(overlay).toContain('--ui-card-shadow');
    expect(overlay).toContain('align-items: center;');
  });

  it('animates dialog entrance and disables motion when requested', () => {
    const overlay = readFileSync(join(sourceRoot, 'styles/overlay-layer.css'), 'utf8');

    expect(overlay).toContain('animation: gt-dialog-mask-in');
    expect(overlay).toContain('animation: gt-dialog-panel-in');
    expect(overlay).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps body-level date and time picker portals styled in the shared layer', () => {
    const overlay = readFileSync(join(sourceRoot, 'styles/overlay-layer.css'), 'utf8');

    expect(overlay).toContain('[data-gt-overlay="date-picker"] [part="calendar"]');
    expect(overlay).toContain('[data-gt-overlay="date-picker"] [part="day"][data-selected]');
    expect(overlay).toContain('[data-gt-overlay="time-picker"] [part="columns"]');
    expect(overlay).toContain('[data-gt-overlay="time-picker"] [part="item"][data-selected]');
  });

  it('keeps dialog portals on the application font and input text vertically centered', () => {
    const overlayController = readFileSync(join(sourceRoot, 'utils/overlay-controller.ts'), 'utf8');
    const inputCss = readFileSync(join(sourceRoot, 'components/gt-input/gt-input.css'), 'utf8');

    expect(overlayController).toContain('this.element.style.fontFamily = styles.fontFamily;');
    expect(overlayController).toContain("name.startsWith('--ui-')");
    expect(inputCss).toContain('height: auto; min-height: 0; align-self: center;');
    expect(inputCss).toContain('line-height: 1.4;');
  });

  it('keeps fixed styles out of component behavior files', () => {
    const source = readFileSync(join(sourceRoot, 'components/gt-button/gt-button.tsx'), 'utf8');

    expect(source).not.toMatch(/<style|innerHTML|:host\s*\{|background\s*:/);
    expect(source).toContain("styleUrl: 'gt-button.css'");
  });
});
