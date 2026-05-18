/** 通知内容类型 */
export type NotificationType = 'text' | 'image' | 'richText';

/** 通知尺寸预设 */
export type NotificationSize = 'sm' | 'md' | 'lg';

export type NotificationTheme = 'light' | 'dark';

/** 图片来源：系统通知会在主进程内归一化成本窗口可直接渲染的地址 */
export type NotificationImageSource =
  | { type: 'url'; url: string }
  | { type: 'path'; path: string; mimeType?: string }
  | { type: 'dataUrl'; dataUrl: string }
  | { type: 'base64'; base64: string; mimeType?: string }
  | { type: 'bytes'; bytes: ArrayBuffer | Uint8Array | number[]; mimeType?: string };

/** 通知载荷 */
export interface NotificationPayload {
  type: NotificationType;
  size: NotificationSize;
  title?: string;
  message?: string;
  /** 图片路径或 URL（image / richText 类型可用） */
  imageUrl?: string;
  /** 图片来源（支持 URL、本地路径、data URL、base64、字节数组） */
  imageSource?: NotificationImageSource;
  /** SVG 图标名称（richText 类型可用） */
  icon?: string;
  /** 通知配色主题；外部调用可省略，由宿主按应用当前主题补齐 */
  theme?: NotificationTheme;
  /**
   * 自动关闭时间（毫秒）。
   * - 默认值 `5000`
   * - 设为 `0` 表示不自动关闭
   */
  duration?: number;
  clickRoute?: string;
}

/** 各尺寸对应的窗口宽高 */
export const NOTIFICATION_SIZE_MAP: Record<NotificationSize, { width: number; height: number }> = {
  sm: { width: 300, height: 80 },
  md: { width: 360, height: 120 },
  lg: { width: 420, height: 200 },
};

export interface NotificationApi {
  show: (payload: NotificationPayload) => Promise<void>;
}

declare global {
  interface Window {
    notificationApi?: NotificationApi;
  }
}
