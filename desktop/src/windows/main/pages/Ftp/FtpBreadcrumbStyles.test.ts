import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ftpStylesPath = resolve(__dirname, 'FtpPage.scss');

describe('FTP breadcrumb styles', () => {
  it('keeps breadcrumb labels and separators on the same line box', () => {
    const styles = readFileSync(ftpStylesPath, 'utf8');

    expect(styles).toContain('.ftp-panel__breadcrumb::part(label)');
    expect(styles).toContain('.ftp-panel__breadcrumb::part(base)');
    expect(styles).toContain('.ftp-panel__breadcrumb-picker');
    expect(styles).not.toContain('.ftp-panel__breadcrumb-picker.ui-icon-button');
    expect(styles).toContain('height: 20px;');
    expect(styles).toContain('.ftp-panel__breadcrumb-separator');
  });
});
