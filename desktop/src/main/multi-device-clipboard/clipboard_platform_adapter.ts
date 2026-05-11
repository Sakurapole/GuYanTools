import { app, clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ClipboardPlatformAdapter {
  readFilePaths(formats: string[], options?: { forceFallback?: boolean }): Promise<string[]>;
  writeFilePaths(paths: string[], options?: { imagePath?: string }): Promise<void>;
}

class DefaultClipboardPlatformAdapter implements ClipboardPlatformAdapter {
  async readFilePaths(formats: string[]) {
    return uniqueExistingPaths(readPathsFromUriList(formats));
  }

  async writeFilePaths(paths: string[]) {
    const existingPaths = uniqueExistingPaths(paths);
    const uriList = existingPaths.map((item) => pathToFileURL(item).toString()).join('\n');
    clipboard.writeText(uriList || paths.join('\n'));
  }
}

class LinuxClipboardPlatformAdapter extends DefaultClipboardPlatformAdapter {
  override async writeFilePaths(paths: string[]) {
    const existingPaths = uniqueExistingPaths(paths);
    const uriList = existingPaths.map((item) => pathToFileURL(item).toString()).join('\n');
    if (!uriList) {
      clipboard.writeText(paths.join('\n'));
      return;
    }

    clipboard.writeText(uriList);
    clipboard.writeBuffer('text/uri-list', Buffer.from(`${uriList}\n`, 'utf8'));
    clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from(`copy\n${uriList}\n`, 'utf8'));
  }
}

class WindowsClipboardPlatformAdapter implements ClipboardPlatformAdapter {
  async readFilePaths(formats: string[], options?: { forceFallback?: boolean }) {
    const paths = uniqueExistingPaths([
      ...readPathsFromFileNameW(formats),
      ...readPathsFromFileName(formats),
      ...readPathsFromWindowsDropFiles(),
      ...readPathsFromUriList(formats),
    ]);
    if (paths.length || (!options?.forceFallback && !shouldTryWindowsFileDropListFallback(formats))) {
      return paths;
    }

    const fallbackPaths = await readWindowsFileDropListFromClipboard();
    debugClipboardCapture('windows-file-drop-fallback', { formats, paths: fallbackPaths });
    return uniqueExistingPaths([...paths, ...fallbackPaths]);
  }

  async writeFilePaths(paths: string[], options?: { imagePath?: string }) {
    const existingPaths = uniqueExistingPaths(paths);
    if (!existingPaths.length) {
      clipboard.writeText(paths.join('\n'));
      return;
    }

    await writeWindowsFileDropListToClipboard(existingPaths, options?.imagePath);
  }
}

export const clipboardPlatformAdapter: ClipboardPlatformAdapter = process.platform === 'win32'
  ? new WindowsClipboardPlatformAdapter()
  : process.platform === 'linux'
    ? new LinuxClipboardPlatformAdapter()
    : new DefaultClipboardPlatformAdapter();

let lastClipboardDebugSignature = '';

function readPathsFromFileNameW(formats: string[]) {
  if (process.platform !== 'win32' && !hasClipboardFormat(formats, 'FileNameW')) return [];
  return readClipboardBufferPaths('FileNameW', 'utf16le');
}

function readPathsFromFileName(formats: string[]) {
  if (process.platform !== 'win32' && !hasClipboardFormat(formats, 'FileName')) return [];
  return readClipboardBufferPaths('FileName', 'utf8');
}

function readPathsFromWindowsDropFiles() {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const buffer = clipboard.readBuffer('CF_HDROP');
    if (buffer.length < 20) return [];
    const pathsOffset = buffer.readUInt32LE(0);
    const isWide = buffer.readUInt32LE(16) !== 0;
    if (pathsOffset <= 0 || pathsOffset >= buffer.length) return [];
    const payload = buffer.subarray(pathsOffset);
    return splitNullDelimitedPaths(payload, isWide ? 'utf16le' : 'utf8');
  } catch (error) {
    console.warn('[multi-device-clipboard] Failed to read CF_HDROP clipboard paths:', error);
    return [];
  }
}

function readPathsFromUriList(formats: string[]) {
  if (!hasClipboardFormat(formats, 'text/uri-list')) return [];
  try {
    return clipboard.readBuffer('text/uri-list')
      .toString('utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

function shouldTryWindowsFileDropListFallback(formats: string[]) {
  if (process.platform !== 'win32') {
    return false;
  }
  if (formats.some((format) => /file|drop|shell|hdrop|preferred\s*dropeffect|dataobject/i.test(format))) {
    return true;
  }
  if (!formats.length) {
    return true;
  }
  return !formats.every((format) => isTextClipboardFormat(format) || isImageClipboardFormat(format));
}

async function readWindowsFileDropListFromClipboard() {
  try {
    const { stdout } = await execFileAsync(
      getWindowsPowerShellPath(),
      [
        '-Sta',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-Command',
        [
          '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
          'Add-Type -AssemblyName System.Windows.Forms',
          'Add-Type -TypeDefinition @\'',
          'using System;',
          'using System.Collections.Generic;',
          'using System.Runtime.InteropServices;',
          'using System.Text;',
          'public static class GuYanClipboardDropFiles {',
          '  [DllImport("user32.dll", SetLastError = true)] private static extern bool OpenClipboard(IntPtr hWndNewOwner);',
          '  [DllImport("user32.dll", SetLastError = true)] private static extern bool CloseClipboard();',
          '  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetClipboardData(uint uFormat);',
          '  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern uint DragQueryFile(IntPtr hDrop, uint iFile, StringBuilder lpszFile, uint cch);',
          '  private const uint CF_HDROP = 15;',
          '  public static string[] Read() {',
          '    var result = new List<string>();',
          '    if (!OpenClipboard(IntPtr.Zero)) return result.ToArray();',
          '    try {',
          '      IntPtr handle = GetClipboardData(CF_HDROP);',
          '      if (handle == IntPtr.Zero) return result.ToArray();',
          '      uint count = DragQueryFile(handle, 0xFFFFFFFF, null, 0);',
          '      for (uint i = 0; i < count; i++) {',
          '        uint length = DragQueryFile(handle, i, null, 0);',
          '        var builder = new StringBuilder((int)length + 1);',
          '        DragQueryFile(handle, i, builder, (uint)builder.Capacity);',
          '        result.Add(builder.ToString());',
          '      }',
          '      return result.ToArray();',
          '    } finally {',
          '      CloseClipboard();',
          '    }',
          '  }',
          '}',
          '\'@',
          '$items = New-Object System.Collections.Generic.List[string]',
          '$formats = @()',
          '$dataObject = $null',
          'for ($attempt = 0; $attempt -lt 5 -and $null -eq $dataObject; $attempt++) {',
          '  try { $dataObject = [System.Windows.Forms.Clipboard]::GetDataObject() } catch { Start-Sleep -Milliseconds 80 }',
          '}',
          'if ($null -ne $dataObject) {',
          '  try { $formats = @($dataObject.GetFormats($true)) } catch { $formats = @() }',
          '  try {',
          '    if ($dataObject.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop, $true)) {',
          '      foreach ($item in @($dataObject.GetData([System.Windows.Forms.DataFormats]::FileDrop, $true))) { $items.Add([string]$item) }',
          '    }',
          '  } catch {}',
          '}',
          'if ($items.Count -eq 0) {',
          '  try { foreach ($item in [System.Windows.Forms.Clipboard]::GetFileDropList()) { $items.Add([string]$item) } } catch {}',
          '}',
          'if ($items.Count -eq 0) {',
          '  try { foreach ($item in [GuYanClipboardDropFiles]::Read()) { $items.Add([string]$item) } } catch {}',
          '}',
          '[pscustomobject]@{ paths = @($items.ToArray()); formats = @($formats) } | ConvertTo-Json -Compress',
        ].join('\n'),
      ],
      {
        timeout: 5000,
        windowsHide: true,
      },
    );
    const parsed = JSON.parse(stdout.trim() || '[]') as unknown;
    if (Array.isArray(parsed)) {
      return uniqueExistingPaths(parsed.filter((item): item is string => typeof item === 'string'));
    }
    if (isWindowsFileDropResult(parsed)) {
      debugClipboardCapture('windows-file-drop-result', {
        formats: parsed.formats,
        paths: parsed.paths,
      });
      return uniqueExistingPaths(parsed.paths);
    }
    return [];
  } catch (error) {
    console.warn('[multi-device-clipboard] Failed to read Windows file drop list:', error);
    return [];
  }
}

async function writeWindowsFileDropListToClipboard(paths: string[], imagePath?: string) {
  const pathsJson = JSON.stringify(paths);
  const imagePathJson = JSON.stringify(imagePath ?? '');
  await execFileAsync(
    getWindowsPowerShellPath(),
    [
      '-Sta',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-Command',
      [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        `$paths = ConvertFrom-Json -InputObject @'`,
        pathsJson,
        `'@`,
        `$imagePath = ConvertFrom-Json -InputObject @'`,
        imagePathJson,
        `'@`,
        '$collection = New-Object System.Collections.Specialized.StringCollection',
        'foreach ($item in @($paths)) { if ($item) { [void]$collection.Add([string]$item) } }',
        '$dataObject = New-Object System.Windows.Forms.DataObject',
        '$dataObject.SetFileDropList($collection)',
        '$image = $null',
        'try {',
        '  if ($imagePath -and (Test-Path -LiteralPath $imagePath)) {',
        '    try {',
        '      $image = [System.Drawing.Image]::FromFile($imagePath)',
        '      $dataObject.SetImage($image)',
        '    } catch {}',
        '  }',
        '  [System.Windows.Forms.Clipboard]::SetDataObject($dataObject, $true)',
        '} finally {',
        '  if ($null -ne $image) { $image.Dispose() }',
        '}',
      ].join('\n'),
    ],
    {
      timeout: 5000,
      windowsHide: true,
    },
  );
}

function getWindowsPowerShellPath() {
  return path.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

function hasClipboardFormat(formats: string[], expected: string) {
  return formats.some((format) => format.toLowerCase() === expected.toLowerCase());
}

function isTextClipboardFormat(format: string) {
  return /^text\/|text|unicode text|html format|locale/i.test(format);
}

function isImageClipboardFormat(format: string) {
  return /image|bitmap|png|jpeg|dib/i.test(format);
}

function isWindowsFileDropResult(value: unknown): value is { paths: string[]; formats: string[] } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { paths?: unknown; formats?: unknown };
  return Array.isArray(candidate.paths) &&
    candidate.paths.every((item) => typeof item === 'string') &&
    (candidate.formats === undefined || (
      Array.isArray(candidate.formats) &&
      candidate.formats.every((item) => typeof item === 'string')
    ));
}

function debugClipboardCapture(stage: string, payload: unknown) {
  if (app.isPackaged && process.env.NODE_ENV === 'production') {
    return;
  }
  const signature = `${stage}:${safeStringifyDebugPayload(payload)}`;
  if (signature === lastClipboardDebugSignature) {
    return;
  }
  lastClipboardDebugSignature = signature;
  console.debug(`[multi-device-clipboard] ${stage}:`, payload);
}

function safeStringifyDebugPayload(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function readClipboardBufferPaths(format: string, encoding: BufferEncoding) {
  try {
    return splitNullDelimitedPaths(clipboard.readBuffer(format), encoding);
  } catch (error) {
    console.warn(`[multi-device-clipboard] Failed to read ${format} clipboard paths:`, error);
    return [];
  }
}

function splitNullDelimitedPaths(buffer: Buffer, encoding: BufferEncoding) {
  if (!buffer.length) return [];
  return buffer
    .toString(encoding)
    .split('\u0000')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueExistingPaths(paths: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawPath of paths) {
    const normalized = normalizeClipboardPath(rawPath);
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) {
      continue;
    }
    if (!existsSync(normalized)) {
      continue;
    }
    seen.add(normalized.toLocaleLowerCase());
    result.push(normalized);
  }
  return result;
}

function normalizeClipboardPath(value: string) {
  const trimmed = value.trim().replace(/^"|"$/g, '');
  if (!trimmed) return '';
  if (/^file:/i.test(trimmed)) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return '';
    }
  }
  return trimmed;
}
