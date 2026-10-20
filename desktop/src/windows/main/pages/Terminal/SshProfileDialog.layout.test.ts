import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync(resolve(__dirname, 'SshProfileDialog.vue'), 'utf8');

describe('SSH profile dialog layout', () => {
  it('sizes the panel to its content while keeping a viewport ceiling', () => {
    expect(dialogSource).toMatch(
      /\.sp-dialog\s*\{[\s\S]*?height:\s*min\(720px, calc\(100vh - 64px\)\);/
    );
    expect(dialogSource).toContain('max-height: calc(100vh - 64px);');
  });

  it('uses popup header and footer slots so actions stay outside the scrolling body', () => {
    expect(dialogSource).toContain('<div slot="header" class="sp-dialog__header">');
    expect(dialogSource).toContain('<div slot="footer" class="sp-dialog__footer">');
    expect(dialogSource).toContain("> [part='body'] {");
    expect(dialogSource).toContain('display: flex;');
    expect(dialogSource).toContain('flex-direction: column;');
    expect(dialogSource).toContain('min-height: 0;');
    expect(dialogSource).toMatch(/&__footer\s*\{[\s\S]*?flex-shrink:\s*0;/);
  });
});
