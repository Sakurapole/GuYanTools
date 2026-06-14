import fs from 'node:fs/promises';
import path from 'node:path';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { appConfigManager } from '@/main/app-config/manager';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import { resetEverythingEsPathCache, searchEverything, type EverythingSearchStatus } from '../everything_client';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

type FileEntryMetadata = {
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
};

const EVERYTHING_DOWNLOAD_URL = 'https://www.voidtools.com/downloads/';
const EVERYTHING_HELP_URL = 'https://www.voidtools.com/support/everything/command_line_interface/';

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  for (const unit of units) {
    if (size < 1024) {
      return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
    }
    size /= 1024;
  }
  return `${size.toFixed(1)} PB`;
}

async function readMetadata(filePath: string): Promise<FileEntryMetadata> {
  try {
    const stat = await fs.stat(filePath);
    return {
      isDirectory: stat.isDirectory(),
      size: stat.isDirectory() ? undefined : stat.size,
      modifiedAt: stat.mtimeMs,
    };
  } catch {
    return { isDirectory: false };
  }
}

function makeUnavailableResult(status: EverythingSearchStatus, message?: string): QuickLaunchResult {
  const isMissing = status === 'missing-es';
  const title = isMissing ? '配置 Everything 文件搜索' : '启动 Everything 后重试文件搜索';
  const subtitle = message || (isMissing
    ? '请确认已安装 Everything 主程序和 ES 命令行工具，并在设置中配置 es.exe 路径。'
    : 'Everything 文件索引服务当前不可用。');

  return {
    id: `file:${status}`,
    providerId: 'file',
    title,
    subtitle,
    detail: isMissing ? EVERYTHING_DOWNLOAD_URL : EVERYTHING_HELP_URL,
    keywords: ['everything', 'es.exe', 'file search', '文件搜索'],
    score: isMissing ? 48 : 46,
    action: {
      type: 'open-external',
      url: isMissing ? EVERYTHING_DOWNLOAD_URL : EVERYTHING_HELP_URL,
    },
  };
}

async function makeFileResult(filePath: string, query: string, index: number): Promise<QuickLaunchResult> {
  const metadata = await readMetadata(filePath);
  const title = path.basename(filePath) || filePath;
  const directory = path.dirname(filePath);
  const match = scoreQuickLaunchFields(
    query,
    { value: title, weight: 72 },
    { value: directory, weight: 38 },
    [{ value: filePath, weight: 30 }],
  );
  const modified = metadata.modifiedAt
    ? new Date(metadata.modifiedAt).toLocaleString('zh-CN', { hour12: false })
    : '';
  const size = metadata.size === undefined ? '' : formatBytes(metadata.size);
  const kind = metadata.isDirectory ? '文件夹' : '文件';

  return {
    id: `file:${filePath}`,
    providerId: 'file',
    title,
    subtitle: compactSnippet(directory),
    detail: [kind, size, modified].filter(Boolean).join(' · '),
    keywords: [directory, filePath],
    score: Math.max(20, (match?.score ?? 64) - index),
    highlights: match ? {
      title: match.titleHighlights,
      subtitle: match.subtitleHighlights,
    } : undefined,
    action: {
      type: 'open-path',
      path: filePath,
    },
  };
}

export const everythingFileProvider: QuickLaunchProvider = {
  id: 'file',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    const query = context.query.trim();
    if (!query) {
      return [];
    }

    const config = await appConfigManager.getConfig();
    const response = await searchEverything(
      query,
      Math.min(context.limit, 30),
      config.features.quickLaunch.everythingEsPath,
    );
    if (response.status !== 'ok') {
      return [makeUnavailableResult(response.status, response.message)];
    }

    return Promise.all(response.paths.slice(0, context.limit).map((filePath, index) =>
      makeFileResult(filePath, query, index),
    ));
  },
  async refresh() {
    resetEverythingEsPathCache();
  },
};
