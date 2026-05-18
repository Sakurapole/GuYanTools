import { BrowserWindow, screen } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { NotificationImageSource, NotificationPayload, NotificationTheme } from '@/contracts/notification';
import { NOTIFICATION_SIZE_MAP } from '@/contracts/notification';
import { appConfigManager } from '../app-config/manager';
import { waitForDevServer } from './wait_for_dev_server';

/** 同时最多显示的通知数 */
const MAX_VISIBLE = 3;
/** 通知间距（px） */
const GAP = 12;
/** 边距（px） */
const MARGIN = 16;

interface ActiveNotification {
  win: BrowserWindow;
  height: number;
}

// 当前活跃通知列表（从下到上堆叠）
const activeNotifications: ActiveNotification[] = [];
let appThemeUnsubscribe: (() => void) | undefined;

function ensureThemeSync() {
  if (appThemeUnsubscribe) {
    return;
  }

  appThemeUnsubscribe = appConfigManager.subscribe((config) => {
    for (const item of activeNotifications) {
      if (!item.win.isDestroyed()) {
        item.win.webContents.send('notification:theme', config.appearance.theme);
      }
    }
  });
}

/**
 * 重新排列所有通知窗口位置（从屏幕右下角往上堆叠）
 */
function repositionAll() {
  const { workAreaSize, workArea } = screen.getPrimaryDisplay();
  let bottomOffset = MARGIN;

  for (const item of activeNotifications) {
    if (item.win.isDestroyed()) continue;

    const bounds = item.win.getBounds();
    const x = workArea.x + workAreaSize.width - bounds.width - MARGIN;
    const y = workArea.y + workAreaSize.height - bottomOffset - bounds.height;
    item.win.setPosition(x, y, false);
    bottomOffset += bounds.height + GAP;
  }
}

/**
 * 移除一个通知并重新排列
 */
function removeNotification(win: BrowserWindow) {
  const idx = activeNotifications.findIndex((n) => n.win === win);
  if (idx !== -1) {
    activeNotifications.splice(idx, 1);
  }
  if (!win.isDestroyed()) {
    win.close();
  }
  repositionAll();
}

function inferImageMimeType(value: string, fallback = 'image/png') {
  const normalized = value.toLocaleLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.bmp')) return 'image/bmp';
  if (normalized.endsWith('.avif')) return 'image/avif';
  return fallback;
}

function bytesToBuffer(value: unknown): Buffer | null {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return Buffer.from(value);
  }
  return null;
}

function bufferToDataUrl(buffer: Buffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function pathFromImagePath(value: string) {
  if (value.startsWith('file://')) {
    return fileURLToPath(value);
  }
  return value;
}

function isLocalImagePath(value: string) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

async function resolveImageSource(source?: NotificationImageSource, legacyImageUrl?: string): Promise<string | undefined> {
  if (source) {
    switch (source.type) {
      case 'url':
        return source.url;
      case 'dataUrl':
        return source.dataUrl;
      case 'base64': {
        const base64 = source.base64.trim();
        if (!base64) return undefined;
        if (base64.startsWith('data:')) return base64;
        return `data:${source.mimeType || 'image/png'};base64,${base64}`;
      }
      case 'bytes': {
        const buffer = bytesToBuffer(source.bytes);
        return buffer ? bufferToDataUrl(buffer, source.mimeType || 'image/png') : undefined;
      }
      case 'path': {
        const filePath = pathFromImagePath(source.path);
        const buffer = await fs.readFile(filePath);
        return bufferToDataUrl(buffer, source.mimeType || inferImageMimeType(filePath));
      }
      default:
        return undefined;
    }
  }

  if (legacyImageUrl?.startsWith('file://')) {
    const filePath = fileURLToPath(legacyImageUrl);
    const buffer = await fs.readFile(filePath);
    return bufferToDataUrl(buffer, inferImageMimeType(filePath));
  }

  if (legacyImageUrl && isLocalImagePath(legacyImageUrl)) {
    const buffer = await fs.readFile(legacyImageUrl);
    return bufferToDataUrl(buffer, inferImageMimeType(legacyImageUrl));
  }

  return legacyImageUrl;
}

async function buildRenderablePayload(payload: NotificationPayload): Promise<NotificationPayload> {
  const config = await appConfigManager.getConfig();
  let imageUrl = payload.imageUrl;
  try {
    imageUrl = await resolveImageSource(payload.imageSource, payload.imageUrl);
  } catch (error) {
    console.warn('[Notification] Failed to resolve image source:', error);
  }

  return {
    ...payload,
    imageUrl,
    theme: payload.theme ?? (config.appearance.theme as NotificationTheme),
  };
}

/**
 * 显示一条通知
 */
export async function showNotification(payload: NotificationPayload): Promise<void> {
  ensureThemeSync();
  const renderPayload = await buildRenderablePayload(payload);
  // 如果已达到上限，关闭最旧的通知
  while (activeNotifications.length >= MAX_VISIBLE) {
    const oldest = activeNotifications.shift();
    if (oldest && !oldest.win.isDestroyed()) {
      oldest.win.close();
    }
  }

  const sizeSpec = NOTIFICATION_SIZE_MAP[renderPayload.size] ?? NOTIFICATION_SIZE_MAP.md;

  const win = new BrowserWindow({
    width: sizeSpec.width,
    height: sizeSpec.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 初始位置（屏幕外右侧），加载后再滑入
  const { workAreaSize, workArea } = screen.getPrimaryDisplay();
  win.setPosition(
    workArea.x + workAreaSize.width,
    workArea.y + workAreaSize.height - MARGIN - sizeSpec.height,
    false,
  );

  // 加载页面
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/notification.html`;
    await waitForDevServer(url);
    await win.loadURL(url);
  } else {
    await win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/notification.html`),
    );
  }

  // 发送通知数据
  win.webContents.send('notification:data', renderPayload);

  // 注册到活跃列表
  const entry: ActiveNotification = { win, height: sizeSpec.height };
  activeNotifications.push(entry);

  // 显示并定位
  win.showInactive();
  repositionAll();

  // 窗口关闭时清理
  win.on('closed', () => {
    removeNotification(win);
  });
}

/**
 * 关闭指定窗口 ID 的通知（由通知渲染进程调用）
 */
export function closeNotificationByWebContentsId(webContentsId: number) {
  const item = activeNotifications.find(
    (n) => !n.win.isDestroyed() && n.win.webContents.id === webContentsId,
  );
  if (item) {
    removeNotification(item.win);
  }
}
