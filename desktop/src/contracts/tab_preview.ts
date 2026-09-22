export interface TabPreviewApi {
  /** 捕获当前窗口为 JPEG data URL（缩略图），供底部栏 Tab 预览使用。 */
  captureWindow: () => Promise<string | null>;
}

declare global {
  interface Window {
    tabPreviewApi?: TabPreviewApi;
  }
}
