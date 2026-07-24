import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

describe('plugin UI tokens', () => {
  it('forwards the stable core token stylesheet', () => {
    const tokens = fs.readFileSync(path.resolve(currentDirectory, '../src/tokens.css'), 'utf8');
    expect(tokens).toContain("@guyantools/ui-core/tokens.css");
  });
});
