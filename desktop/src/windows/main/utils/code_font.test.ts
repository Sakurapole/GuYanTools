import { describe, expect, it } from 'vitest';
import { SYSTEM_FONT_OPTION_VALUE } from '../../../contracts/app_config';
import { buildCodeFontFamilyValue, filterFontOptions } from './code_font';

describe('code block font preference', () => {
  it('uses a monospace fallback for the default preference', () => {
    expect(buildCodeFontFamilyValue(SYSTEM_FONT_OPTION_VALUE)).toContain('monospace');
  });

  it('quotes local font family names without allowing CSS value injection', () => {
    expect(buildCodeFontFamilyValue('Cascadia Code')).toMatch(/^"Cascadia Code", /);
    expect(buildCodeFontFamilyValue('Bad"; color: red')).not.toContain('color: red');
  });

  it('searches installed families without case sensitivity', () => {
    const options = [
      { label: '系统默认', value: SYSTEM_FONT_OPTION_VALUE },
      { label: 'Cascadia Code', value: 'Cascadia Code' },
      { label: 'Consolas', value: 'Consolas' },
    ];
    expect(filterFontOptions(options, 'CODE').map((option) => option.value)).toEqual(['Cascadia Code']);
  });
});
