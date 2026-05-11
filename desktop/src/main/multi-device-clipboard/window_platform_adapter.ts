import type { BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ClipboardAlwaysOnTopLevel = Parameters<BrowserWindow['setAlwaysOnTop']>[1];

export interface ClipboardWindowPlatformAdapter {
  getAlwaysOnTopLevel(): ClipboardAlwaysOnTopLevel;
  getForegroundPasteTargetToken(): Promise<string | null>;
  sendPasteShortcut(targetWindowToken: string | null): Promise<void>;
}

class DefaultClipboardWindowPlatformAdapter implements ClipboardWindowPlatformAdapter {
  getAlwaysOnTopLevel(): ClipboardAlwaysOnTopLevel {
    return 'floating';
  }

  async getForegroundPasteTargetToken(): Promise<string | null> {
    return null;
  }

  async sendPasteShortcut(targetWindowToken: string | null): Promise<void> {
    void targetWindowToken;
    // No cross-desktop fallback is reliable enough here. The selected item is
    // still written to the system clipboard; users can paste manually.
  }
}

class WindowsClipboardWindowPlatformAdapter extends DefaultClipboardWindowPlatformAdapter {
  override getAlwaysOnTopLevel(): ClipboardAlwaysOnTopLevel {
    return 'pop-up-menu';
  }

  override async getForegroundPasteTargetToken() {
    const handle = await getWindowsForegroundWindowHandle();
    return handle ? `win32:${handle}` : null;
  }

  override async sendPasteShortcut(targetWindowToken: string | null) {
    await sendWindowsPasteShortcut(readPasteTargetValue(targetWindowToken, 'win32'));
  }
}

class LinuxClipboardWindowPlatformAdapter extends DefaultClipboardWindowPlatformAdapter {
  override getAlwaysOnTopLevel(): ClipboardAlwaysOnTopLevel {
    return 'screen-saver';
  }

  override async getForegroundPasteTargetToken() {
    const handle = await getLinuxX11ForegroundWindowHandle();
    return handle ? `linux-x11:${handle}` : null;
  }

  override async sendPasteShortcut(targetWindowToken: string | null) {
    await sendLinuxPasteShortcut(readPasteTargetValue(targetWindowToken, 'linux-x11'));
  }
}

export const clipboardWindowPlatformAdapter: ClipboardWindowPlatformAdapter = process.platform === 'win32'
  ? new WindowsClipboardWindowPlatformAdapter()
  : process.platform === 'linux'
    ? new LinuxClipboardWindowPlatformAdapter()
    : new DefaultClipboardWindowPlatformAdapter();

function readPasteTargetValue(token: string | null, platform: string) {
  const prefix = `${platform}:`;
  return token?.startsWith(prefix) ? token.slice(prefix.length) : null;
}

async function getWindowsForegroundWindowHandle() {
  if (process.platform !== 'win32') {
    return null;
  }

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
        'Add-Type @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public static class NativeMethods {',
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '}',
        '"@;',
        '[NativeMethods]::GetForegroundWindow().ToInt64()',
      ].join('\n'),
    ],
    {
      timeout: 2500,
      windowsHide: true,
    },
  );
  const handle = stdout.trim();
  return handle && handle !== '0' ? handle : null;
}

async function getLinuxX11ForegroundWindowHandle() {
  if (process.platform !== 'linux' || !process.env.DISPLAY) {
    return null;
  }

  const { stdout } = await execFileAsync('xdotool', ['getactivewindow'], {
    timeout: 2500,
    windowsHide: true,
  });
  const handle = stdout.trim();
  return handle && /^\d+$/.test(handle) ? handle : null;
}

async function sendWindowsPasteShortcut(targetWindowHandle: string | null) {
  const targetScript = targetWindowHandle && /^\d+$/.test(targetWindowHandle)
    ? [
      `$target = [IntPtr]([Int64]${targetWindowHandle})`,
      'if ($target -ne [IntPtr]::Zero) {',
      '  $processId = 0',
      '  [NativeMethods]::GetWindowThreadProcessId($target, [ref]$processId) | Out-Null',
      '  $processName = ""',
      '  $windowTitle = ""',
      '  try {',
      '    $process = [System.Diagnostics.Process]::GetProcessById($processId)',
      '    $processName = $process.ProcessName',
      '    $windowTitle = $process.MainWindowTitle',
      '  } catch {}',
      '  $remotePattern = "(?i)(todesk|anydesk|teamviewer|rustdesk|sunlogin|oray|mstsc|rdp|remote\\s*desktop)"',
      '  if (($processName -match $remotePattern) -or ($windowTitle -match $remotePattern)) {',
      '    exit 0',
      '  }',
      '  if ([NativeMethods]::IsIconic($target)) {',
      '    [NativeMethods]::ShowWindowAsync($target, 9) | Out-Null',
      '  }',
      '  [NativeMethods]::BringWindowToTop($target) | Out-Null',
      '  [NativeMethods]::SwitchToThisWindow($target, $true) | Out-Null',
      '  [NativeMethods]::SetForegroundWindow($target) | Out-Null',
      '  Start-Sleep -Milliseconds 120',
      '}',
    ].join('\n')
    : '';

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
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public static class NativeMethods {',
        '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
        '  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);',
        '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
        '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
        '  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);',
        '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, ref int lpdwProcessId);',
        '}',
        '"@;',
        targetScript,
        "[System.Windows.Forms.SendKeys]::SendWait('^v')",
      ].filter(Boolean).join('\n'),
    ],
    {
      timeout: 2500,
      windowsHide: true,
    },
  );
}

async function sendLinuxPasteShortcut(targetWindowHandle: string | null) {
  const errors: string[] = [];

  if (targetWindowHandle && /^\d+$/.test(targetWindowHandle)) {
    try {
      await execFileAsync('xdotool', ['windowactivate', '--sync', targetWindowHandle], {
        timeout: 2500,
        windowsHide: true,
      });
      await delay(80);
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], {
        timeout: 2500,
        windowsHide: true,
      });
      return;
    } catch (error) {
      errors.push(formatPasteShortcutError('xdotool windowactivate/key', error));
    }
  }

  if (process.env.DISPLAY) {
    try {
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], {
        timeout: 2500,
        windowsHide: true,
      });
      return;
    } catch (error) {
      errors.push(formatPasteShortcutError('xdotool key', error));
    }
  }

  try {
    await execFileAsync('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl'], {
      timeout: 2500,
      windowsHide: true,
    });
  } catch (error) {
    errors.push(formatPasteShortcutError('wtype', error));
    throw new Error(errors.join('; '));
  }
}

function formatPasteShortcutError(label: string, error: unknown) {
  return `${label}: ${error instanceof Error ? error.message : String(error)}`;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
