import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app as electronApp, shell } from 'electron';
import type { QuickLaunchAction, QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

type AppIndexEntry = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  launchPath: string;
  targetPath?: string;
  iconPath?: string;
  targetUrl?: string;
  appUserModelId?: string;
  extension: string;
  keywords: string[];
  penalty: number;
};

type WindowsStartApp = {
  Name?: string;
  AppID?: string;
};

type ShortcutRoot = {
  directory: string;
  label: string;
};

const SHORTCUT_EXTENSIONS = new Set(['.lnk', '.url', '.appref-ms']);
const PATH_EXECUTABLE_EXTENSIONS = new Set(['.exe']);
const APP_INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SHORTCUT_WALK_DEPTH = 8;
const MAX_PATH_EXECUTABLES = 400;
const MAX_WINDOWS_APPS = 500;
const NOISE_PATTERN = /(^|[\s._-])(uninstall|unins|uninstaller|remove|repair|updater?|helper|卸载|修复|更新)([\s._-]|$)/i;
const START_MENU_APP_ALIAS_KEYWORDS: Record<string, string[]> = {
  [normalizeTitleKey('计算器')]: ['calculator', 'calc', 'jisuanqi'],
  [normalizeTitleKey('便笺')]: ['sticky notes', 'stickynotes', 'notes', 'note', 'bianjian'],
  [normalizeTitleKey('记事本')]: ['notepad', 'notes', 'jishiben'],
};

let cachedIndex: AppIndexEntry[] | null = null;
let cachedIndexAt = 0;
const iconDataUrlCache = new Map<string, string>();

function hashId(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function normalizePathKey(value: string) {
  return path.resolve(value).toLocaleLowerCase();
}

function normalizeTitle(filePath: string) {
  return path.basename(filePath, path.extname(filePath))
    .replace(/\s+-\s+快捷方式$/i, '')
    .replace(/\s+shortcut$/i, '')
    .trim();
}

function normalizeTitleKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function shortcutRoots(): ShortcutRoot[] {
  const roots: ShortcutRoot[] = [];
  const appData = process.env.APPDATA;
  const programData = process.env.ProgramData || process.env.PROGRAMDATA;
  const publicDir = process.env.PUBLIC || 'C:\\Users\\Public';

  if (appData) {
    roots.push({
      directory: path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      label: '开始菜单',
    });
  }

  if (programData) {
    roots.push({
      directory: path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      label: '公共开始菜单',
    });
  }

  roots.push(
    { directory: path.join(os.homedir(), 'Desktop'), label: '桌面快捷方式' },
    { directory: path.join(publicDir, 'Desktop'), label: '公共桌面' },
  );

  return roots;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readUrlShortcut(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const match = content.match(/^URL=(.+)$/im);
    const url = match?.[1]?.trim();
    return url && /^https?:\/\//i.test(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

function expandWindowsEnvironmentVariables(value: string) {
  return value.replace(/%([^%]+)%/g, (match, name) => process.env[name] ?? match);
}

function resolveShortcutMetadata(filePath: string): { targetPath?: string; iconPath?: string } {
  if (process.platform !== 'win32' || path.extname(filePath).toLocaleLowerCase() !== '.lnk') {
    return {};
  }

  try {
    const shortcut = shell.readShortcutLink(filePath);
    const targetPath = shortcut.target ? expandWindowsEnvironmentVariables(shortcut.target) : undefined;
    const iconPath = shortcut.icon ? expandWindowsEnvironmentVariables(shortcut.icon) : undefined;
    return {
      targetPath,
      iconPath,
    };
  } catch {
    return {};
  }
}

function makeShortcutEntry(
  root: ShortcutRoot,
  filePath: string,
  targetUrl?: string,
  metadata: { targetPath?: string; iconPath?: string } = {},
): AppIndexEntry {
  const extension = path.extname(filePath).toLocaleLowerCase();
  const relativeDir = path.dirname(path.relative(root.directory, filePath));
  const folderLabel = relativeDir && relativeDir !== '.' ? relativeDir.split(/[\\/]/).join(' / ') : root.label;
  const title = normalizeTitle(filePath);
  const key = targetUrl || (metadata.targetPath ? normalizePathKey(metadata.targetPath) : normalizePathKey(filePath));

  return {
    id: `app:${hashId(key)}`,
    title,
    subtitle: compactSnippet(folderLabel),
    detail: targetUrl || metadata.targetPath || filePath,
    launchPath: filePath,
    targetPath: metadata.targetPath,
    iconPath: metadata.iconPath,
    targetUrl,
    extension,
    keywords: [folderLabel, filePath, metadata.targetPath ?? '', targetUrl ?? '', extension],
    penalty: NOISE_PATTERN.test(title) ? 35 : 0,
  };
}

function dedupeKeyForEntry(entry: AppIndexEntry) {
  if (entry.targetUrl) {
    return entry.targetUrl;
  }

  return normalizePathKey(entry.targetPath || entry.launchPath);
}

function titleDedupeKeyForEntry(entry: AppIndexEntry) {
  return `${entry.title ? normalizeTitleKey(entry.title) : ''}:${entry.targetUrl ? 'url' : 'app'}`;
}

async function collectShortcuts(root: ShortcutRoot, depth = 0): Promise<AppIndexEntry[]> {
  if (depth > MAX_SHORTCUT_WALK_DEPTH || !await pathExists(root.directory)) {
    return [];
  }

  const entries = await safeReadDirectory(root.directory);
  const results: AppIndexEntry[] = [];

  for (const entry of entries) {
    const filePath = path.join(root.directory, entry.name);
    if (entry.isDirectory()) {
      const nestedRoot = { ...root, directory: filePath };
      results.push(...await collectShortcuts(nestedRoot, depth + 1));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLocaleLowerCase();
    if (!SHORTCUT_EXTENSIONS.has(extension)) {
      continue;
    }

    const targetUrl = extension === '.url' ? await readUrlShortcut(filePath) : undefined;
    const metadata = resolveShortcutMetadata(filePath);
    results.push(makeShortcutEntry(root, filePath, targetUrl, metadata));
  }

  return results;
}

function splitPathDirectories() {
  const seen = new Set<string>();
  const directories: string[] = [];

  for (const rawDirectory of (process.env.PATH ?? '').split(path.delimiter)) {
    const directory = rawDirectory.trim();
    if (!directory) continue;
    const key = normalizePathKey(directory);
    if (seen.has(key)) continue;
    seen.add(key);
    directories.push(directory);
  }

  return directories;
}

async function collectPathExecutables() {
  const results: AppIndexEntry[] = [];

  for (const directory of splitPathDirectories()) {
    if (results.length >= MAX_PATH_EXECUTABLES) break;
    const entries = await safeReadDirectory(directory);

    for (const entry of entries) {
      if (results.length >= MAX_PATH_EXECUTABLES) break;
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLocaleLowerCase();
      if (!PATH_EXECUTABLE_EXTENSIONS.has(extension)) continue;

      const filePath = path.join(directory, entry.name);
      const title = normalizeTitle(filePath);
      results.push({
        id: `app:${hashId(normalizePathKey(filePath))}`,
        title,
        subtitle: 'PATH 可执行文件',
        detail: filePath,
        launchPath: filePath,
        extension,
        keywords: [directory, filePath, extension],
        penalty: NOISE_PATTERN.test(title) ? 35 : 8,
      });
    }
  }

  return results;
}

async function collectWindowsApps() {
  if (process.platform !== 'win32') {
    return [];
  }

  const apps = await getWindowsStartApps();
  const results: AppIndexEntry[] = [];

  for (const app of apps.slice(0, MAX_WINDOWS_APPS)) {
    const title = app.Name?.trim();
    const appUserModelId = app.AppID?.trim();
    if (!title || !appUserModelId) {
      continue;
    }

    results.push({
      id: `app:${hashId(`windows-app:${appUserModelId.toLocaleLowerCase()}`)}`,
      title,
      subtitle: '开始菜单应用',
      detail: appUserModelId,
      launchPath: appUserModelId,
      appUserModelId,
      extension: 'appx',
      keywords: [
        title,
        appUserModelId,
        '开始菜单应用',
        'AppX',
        'UWP',
        ...(START_MENU_APP_ALIAS_KEYWORDS[normalizeTitleKey(title)] ?? []),
      ],
      penalty: NOISE_PATTERN.test(title) ? 35 : 0,
    });
  }

  return results;
}

function getWindowsStartApps() {
  const command = [
    '$ErrorActionPreference = "Stop";',
    '$OutputEncoding = [System.Text.Encoding]::UTF8;',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;',
    'Get-StartApps |',
    'Select-Object -Property Name,AppID |',
    'ConvertTo-Json -Compress',
  ].join(' ');

  return new Promise<WindowsStartApp[]>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as WindowsStartApp | WindowsStartApp[];
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

async function buildAppIndex() {
  const entries = [
    ...(await Promise.all(shortcutRoots().map(root => collectShortcuts(root)))).flat(),
    ...(await collectWindowsApps()),
    ...(await collectPathExecutables()),
  ];
  const deduped = new Map<string, AppIndexEntry>();
  const titleDeduped = new Map<string, string>();

  for (const entry of entries) {
    const key = dedupeKeyForEntry(entry);
    const titleKey = titleDedupeKeyForEntry(entry);
    if (!entry.title || deduped.has(key) || titleDeduped.has(titleKey)) {
      continue;
    }
    deduped.set(key, entry);
    titleDeduped.set(titleKey, key);
  }

  return [...deduped.values()];
}

async function getAppIndex() {
  const now = Date.now();
  if (cachedIndex && now - cachedIndexAt < APP_INDEX_CACHE_TTL_MS) {
    return cachedIndex;
  }

  cachedIndex = await buildAppIndex();
  cachedIndexAt = now;
  return cachedIndex;
}

function appAction(entry: AppIndexEntry): QuickLaunchAction {
  if (entry.targetUrl) {
    return { type: 'open-external', url: entry.targetUrl };
  }

  if (entry.appUserModelId) {
    return { type: 'open-windows-app', appUserModelId: entry.appUserModelId };
  }

  return { type: 'open-path', path: entry.launchPath };
}

async function resolveIconDataUrl(entry: AppIndexEntry) {
  const cacheKey = entry.targetUrl
    || (entry.appUserModelId ? `windows-app:${entry.appUserModelId.toLocaleLowerCase()}` : '')
    || normalizePathKey(entry.iconPath || entry.targetPath || entry.launchPath);
  const cached = iconDataUrlCache.get(cacheKey);
  if (cached !== undefined) {
    return cached || undefined;
  }

  const candidatePaths = await resolveIconCandidatePaths(entry);
  for (const candidatePath of candidatePaths) {
    try {
      const icon = await electronApp.getFileIcon(candidatePath, { size: 'large' });
      if (!icon.isEmpty()) {
        const dataUrl = icon.toDataURL();
        iconDataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
      }
    } catch {
      // Try the next candidate; shortcuts and icon resources can be stale.
    }
  }

  iconDataUrlCache.set(cacheKey, '');
  return undefined;
}

async function resolveIconCandidatePaths(entry: AppIndexEntry) {
  const candidates = [
    entry.targetPath,
    entry.iconPath,
    entry.launchPath,
  ].filter((value): value is string => Boolean(value));
  const result: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = normalizePathKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (await pathExists(candidate)) {
      result.push(candidate);
    }
  }

  return result;
}

export const appProvider: QuickLaunchProvider = {
  id: 'app',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    if (!context.query.trim()) {
      return [];
    }

    const index = await getAppIndex();
    const matches = index
      .map((entry) => {
        const match = scoreQuickLaunchFields(
          context.query,
          { value: entry.title, weight: 82 },
          { value: entry.subtitle, weight: 36 },
          entry.keywords.map((value) => ({ value, weight: 26 })),
        );
        if (!match) {
          return null;
        }

        const result: QuickLaunchResult = {
          id: entry.id,
          providerId: 'app',
          title: entry.title,
          subtitle: entry.subtitle,
          detail: entry.detail,
          keywords: entry.keywords,
          score: Math.max(1, match.score - entry.penalty),
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: appAction(entry),
        };

        return { entry, result };
      })
      .filter((item): item is { entry: AppIndexEntry; result: QuickLaunchResult } => Boolean(item))
      .sort((left, right) =>
        right.result.score - left.result.score || left.result.title.localeCompare(right.result.title),
      )
      .slice(0, context.limit);

    return Promise.all(matches.map(async ({ entry, result }) => ({
      ...result,
      iconDataUrl: await resolveIconDataUrl(entry),
    })));
  },
  async refresh() {
    cachedIndex = await buildAppIndex();
    cachedIndexAt = Date.now();
    iconDataUrlCache.clear();
  },
};
