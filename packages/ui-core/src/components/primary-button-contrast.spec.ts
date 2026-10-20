import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const desktopTheme = readFileSync(
  resolve(process.cwd(), '../../desktop/src/windows/main/assets/theme.scss'),
  'utf8'
);
const coreLightTheme = readFileSync(resolve(sourceRoot, 'styles/themes/light.css'), 'utf8');
const coreDarkTheme = readFileSync(resolve(sourceRoot, 'styles/themes/dark.css'), 'utf8');

function themeBlock(stylesheet: string, theme: 'light' | 'dark'): string {
  const block = stylesheet.match(new RegExp(`\\.${theme} \\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`Missing ${theme} theme`);
  return block[1];
}

function coreThemeBlock(stylesheet: string): string {
  const block = stylesheet.match(/\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('Missing core theme tokens');
  return block[1];
}

function token(block: string, name: string): string {
  const value = block.match(new RegExp(`(?:^|\\n)\\s*${name}:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`Missing ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? token(block, reference[1]) : value;
}

function luminance(color: string): number {
  const channels = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)?.slice(1);
  if (!channels) throw new Error(`Expected opaque hex color, got ${color}`);
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('primary action contrast', () => {
  it.each(['light', 'dark'] as const)(
    'meets WCAG AA for desktop button text in %s theme',
    (theme) => {
      const block = themeBlock(desktopTheme, theme);
      const foreground = token(block, '--ui-button-primary-text');
      expect(token(block, '--ui-button-primary-bg').toLowerCase()).toBe('#66ccff');
      expect(token(block, '--ui-button-primary-hover-bg').toLowerCase()).toBe('#8ad9ff');

      for (const state of ['--ui-button-primary-bg', '--ui-button-primary-hover-bg']) {
        expect(
          contrast(foreground, token(block, state)),
          `${theme} ${state}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it.each(['light', 'dark'] as const)(
    'meets WCAG AA for standalone gt-button in %s theme',
    (theme) => {
      const block = coreThemeBlock(theme === 'light' ? coreLightTheme : coreDarkTheme);
      const foreground = token(block, '--gt-color-primary-action-text');
      expect(token(block, '--gt-color-primary-action').toLowerCase()).toBe('#66ccff');
      expect(token(block, '--gt-color-primary-action-hover').toLowerCase()).toBe('#8ad9ff');

      for (const state of ['--gt-color-primary-action', '--gt-color-primary-action-hover']) {
        expect(
          contrast(foreground, token(block, state)),
          `${theme} ${state}`
        ).toBeGreaterThanOrEqual(4.5);
      }

      const button = readFileSync(
        resolve(sourceRoot, 'components/gt-button/gt-button.css'),
        'utf8'
      );
      expect(button).toContain('var(--ui-button-primary-bg, var(--gt-color-primary-action))');
      expect(button).toContain('var(--ui-button-primary-border, var(--gt-color-primary-action))');
      expect(button).toContain(
        'var(--ui-button-primary-text, var(--gt-color-primary-action-text))'
      );
      expect(button).toContain(
        'var(--ui-button-primary-hover-bg, var(--gt-color-primary-action-hover))'
      );
    }
  );

  it('uses the contrasting action text in selected date and time surfaces', () => {
    const stylesheets = [
      'styles/overlay-layer.css',
      'components/gt-date-picker/gt-date-picker.css',
      'components/gt-time-picker/gt-time-picker.css',
    ];
    for (const stylesheet of stylesheets) {
      const source = readFileSync(resolve(sourceRoot, stylesheet), 'utf8');
      expect(source).toContain(
        'var(--ui-button-primary-text, var(--gt-color-primary-action-text))'
      );
      expect(source).not.toContain('var(--ui-button-primary-text, #fff)');
    }
  });
});
