import { describe, expect, it } from 'vitest';
import { parseWindowsFontNames } from './local_fonts';

describe('Windows local font enumeration', () => {
  it('normalizes installed face names and removes duplicates', () => {
    const families = parseWindowsFontNames('Arial (TrueType)\nArial Bold (TrueType)\nArial (TrueType)\n思源黑体 (OpenType)');
    expect(families).toHaveLength(3);
    expect(families).toEqual(expect.arrayContaining(['Arial', 'Arial Bold', '思源黑体']));
  });
});
