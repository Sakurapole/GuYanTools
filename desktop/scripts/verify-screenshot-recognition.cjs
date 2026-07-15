const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const checks = [
  ['src/contracts/screenshot.ts', [
    'ScreenshotUiBlockKind',
    'ScreenshotCaptureRequest',
    'ScreenshotRecognitionResult',
    'ScreenshotApi',
    "'button'",
    "'input'",
    "'card'",
    "'list_item'",
    "'navigation'",
    "'paddleocr-onnx'",
  ]],
  ['src/core/@types/index.d.ts', ['screenshotApi?: ScreenshotApi']],
  ['../multi_platform_core/src/screenshot/recognition.rs', ['recognize_ui_blocks_from_rgba']],
  ['../multi_platform_core/index.js', ['recognizeScreenshotUiBlocks']],
  ['../multi_platform_core/index.d.ts', ['recognizeScreenshotUiBlocks']],
  ['src/main/screenshot/ipc.ts', ['screenshot:start-capture', 'screenshot:recognize-image']],
  ['src/preload.ts', ['screenshotApi']],
];

let failed = false;
for (const [relativePath, tokens] of checks) {
  const absolutePath = path.resolve(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`[verify-screenshot-recognition] Missing file: ${relativePath}`);
    failed = true;
    continue;
  }
  const source = fs.readFileSync(absolutePath, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) {
      console.error(`[verify-screenshot-recognition] ${relativePath} missing token: ${token}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('[verify-screenshot-recognition] OK');
