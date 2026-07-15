const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const target = path.join(packageRoot, 'index.js');

if (!fs.existsSync(target)) {
  throw new Error(`Missing generated native index: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');

source = source.replace(
  'const { JsTerminalHost, JsDatabase, JsSshHost, JsFtpHost, JsMultiDeviceClipboardHost } = nativeBinding',
  'const { JsTerminalHost, JsDatabase, JsSshHost, JsFtpHost, JsMultiDeviceClipboardHost, recognizeScreenshotUiBlocks } = nativeBinding',
);

if (!source.includes('module.exports.recognizeScreenshotUiBlocks = recognizeScreenshotUiBlocks')) {
  source += '\nmodule.exports.recognizeScreenshotUiBlocks = recognizeScreenshotUiBlocks\n';
}

fs.writeFileSync(target, source);
