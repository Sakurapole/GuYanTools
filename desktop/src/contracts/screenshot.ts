import type { AiChatAttachment } from './ai';

export type ScreenshotCaptureMode = 'region' | 'window' | 'fullscreen';

export type ScreenshotRecognitionSource =
  | 'local-heuristic'
  | 'ai-vision'
  | 'paddleocr-onnx';

export type ScreenshotUiBlockKind =
  | 'button'
  | 'input'
  | 'card'
  | 'list_item'
  | 'navigation'
  | 'image'
  | 'group'
  | 'unknown';

export interface ScreenshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotDisplayInfo {
  id: number;
  scaleFactor: number;
  bounds: ScreenshotRect;
  workArea: ScreenshotRect;
}

export interface ScreenshotCaptureRequest {
  mode: ScreenshotCaptureMode;
  recognize?: boolean;
  saveToKnowledge?: boolean;
  sendToAi?: boolean;
}

export interface ScreenshotCaptureImage {
  pngBase64: string;
  mimeType: 'image/png';
  byteSize: number;
  displayId: number;
  region: ScreenshotRect;
  capturedAt: string;
}

export interface ScreenshotUiBlockFeatures {
  edgeDensity: number;
  fillRatio: number;
  aspectRatio: number;
  horizontalAlignmentScore: number;
  repeatedSiblingScore: number;
}

export interface ScreenshotUiBlock {
  id: string;
  kind: ScreenshotUiBlockKind;
  rect: ScreenshotRect;
  confidence: number;
  parentId?: string;
  childIds: string[];
  source: ScreenshotRecognitionSource;
  features: ScreenshotUiBlockFeatures;
  text?: string;
  textConfidence?: number;
  ocrProvider?: 'paddleocr-onnx';
  metadata?: Record<string, unknown>;
}

export interface ScreenshotRecognitionOptions {
  minBlockWidth?: number;
  minBlockHeight?: number;
  mergeGap?: number;
  maxBlocks?: number;
}

export interface ScreenshotRecognitionResult {
  image: ScreenshotCaptureImage;
  blocks: ScreenshotUiBlock[];
  elapsedMs: number;
  warnings: string[];
}

export interface ScreenshotOverlayPayload {
  request: ScreenshotCaptureRequest;
  displays: ScreenshotDisplayInfo[];
  bounds: ScreenshotRect;
}

export interface ScreenshotStartCaptureResult {
  accepted: boolean;
}

export interface ScreenshotApi {
  startCapture: (input?: ScreenshotCaptureRequest) => Promise<ScreenshotStartCaptureResult>;
  recognizeImage: (
    image: ScreenshotCaptureImage,
    options?: ScreenshotRecognitionOptions,
  ) => Promise<ScreenshotRecognitionResult>;
  saveCaptureToKnowledge: (result: ScreenshotRecognitionResult) => Promise<{ assetId: string }>;
  createAiAttachment: (result: ScreenshotRecognitionResult) => Promise<AiChatAttachment>;
  captureRegion: (region: ScreenshotRect, displayId: number) => Promise<ScreenshotCaptureImage>;
  completeOverlayCapture: (result: ScreenshotRecognitionResult) => Promise<void>;
  closeOverlay: () => Promise<void>;
  onCaptureOptions: (listener: (payload: ScreenshotOverlayPayload) => void) => () => void;
  onCaptureResult: (listener: (result: ScreenshotRecognitionResult) => void) => () => void;

  // Phase 1: 剪贴板/文件/窗口检测
  saveToClipboard?: (pngBase64: string) => Promise<void>;
  saveToFile?: (pngBase64: string, defaultName?: string) => Promise<{ filePath: string } | null>;
  detectWindows?: () => Promise<ScreenshotDetectedWindow[]>;

  // Phase 2: OCR + 贴图
  performOcr?: (pngBase64: string) => Promise<ScreenshotOcrResult>;
  pinImage?: (pngBase64: string) => Promise<{ pinId: number }>;

  // Phase 3: 取色器
  pickColor?: (x: number, y: number, displayId: number) => Promise<ScreenshotColorInfo>;
}

// ── 标注相关类型 ──────────────────────────────────────────────

export type ScreenshotAnnotationTool =
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'
  | 'pen'
  | 'mosaic'
  | 'highlight'
  | 'number';

export interface ScreenshotAnnotationElement {
  id: string;
  tool: ScreenshotAnnotationTool;
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  opacity?: number;
}

export interface ScreenshotAnnotationStyle {
  color: string;
  strokeWidth: number;
  fontSize: number;
}

// ── 窗口检测类型 ──────────────────────────────────────────────

export interface ScreenshotDetectedWindow {
  id: string;
  title: string;
  bounds: ScreenshotRect;
  processName?: string;
}

// ── OCR 相关类型 ──────────────────────────────────────────────

export interface ScreenshotOcrBlock {
  text: string;
  confidence: number;
  rect: ScreenshotRect;
}

export interface ScreenshotOcrResult {
  text: string;
  blocks: ScreenshotOcrBlock[];
  elapsedMs: number;
  engine: 'paddleocr-onnx' | 'windows-ocr' | 'tesseract' | 'local-heuristic';
}

// ── 取色器类型 ────────────────────────────────────────────────

export interface ScreenshotColorInfo {
  hex: string;
  rgb: string;
  position: { x: number; y: number };
}
