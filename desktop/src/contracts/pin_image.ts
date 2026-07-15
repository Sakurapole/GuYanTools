import type { ScreenshotRect } from './screenshot';

export interface PinImageConfig {
  pngBase64: string;
  initialBounds?: ScreenshotRect;
  opacity?: number;
}

export interface PinImageWindowState {
  pinId: number;
  bounds: ScreenshotRect;
  opacity: number;
  scale: number;
}

export interface PinImageApi {
  create: (config: PinImageConfig) => Promise<{ pinId: number }>;
  close: (pinId: number) => Promise<void>;
  setOpacity: (pinId: number, opacity: number) => Promise<void>;
  list: () => Promise<PinImageWindowState[]>;
  onImagePayload: (listener: (payload: { pinId: number; pngBase64: string }) => void) => () => void;
}
