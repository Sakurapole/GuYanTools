/** 通知内容类型 */
export type NotificationType = 'text' | 'image' | 'richText';

/** 通知尺寸预设 */
export type NotificationSize = 'sm' | 'md' | 'lg';

/** 通知载荷 */
export interface NotificationPayload {
  type: NotificationType;
  size: NotificationSize;
  title?: string;
  message?: string;
  /** 图片路径或 URL（image / richText 类型可用） */
  imageUrl?: string;
  /** SVG 图标名称（richText 类型可用） */
  icon?: string;
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
