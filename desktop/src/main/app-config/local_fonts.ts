import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function parseWindowsFontNames(output: string): string[] {
  return [...new Set(output.split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+\((?:TrueType|OpenType|Type 1)\)$/i, ''))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function listWindowsFontFamilies(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const script = [
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    "$paths = @('HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')",
    'foreach ($p in $paths) {',
    '  $item = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue',
    "  if ($item) { $item.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name } }",
    '}',
  ].join('\n');
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ], { windowsHide: true, timeout: 7000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' });
    return parseWindowsFontNames(stdout);
  } catch {
    return [];
  }
}
