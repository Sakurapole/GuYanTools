# Desktop Screenshot UI Block Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop screenshot flow that captures a selected screen region and uses Rust core acceleration to identify structured UI blocks such as buttons, inputs, cards, list items, and navigation regions.

**Architecture:** Electron owns screen capture, overlay windows, global shortcuts, and renderer-facing IPC. Rust core owns CPU-heavy image analysis through napi-rs and returns normalized UI block rectangles; AI vision can optionally enrich labels after local detection. OCR and text block recognition are explicitly out of V1 scope and are represented only by future-compatible fields for a PaddleOCR ONNX path.

**Tech Stack:** Electron 37, Vue 3, TypeScript contracts/preload IPC, napi-rs, Rust 2021, `image` crate for decoding and pixel access, existing `@guyantools/core` native package, existing knowledge asset and AI image attachment boundaries.

---

## Scope

V1 includes:

- System region screenshot selection from an always-on-top transparent Electron window.
- A typed screenshot contract shared by main, preload, and renderer.
- Rust-native recognition for structured UI blocks:
  - `button`
  - `input`
  - `card`
  - `list_item`
  - `navigation`
  - `image`
  - `group`
  - `unknown`
- Result preview with overlay rectangles.
- IPC surface that lets the main window trigger capture and receive a result.
- Optional export hooks to AI attachments and knowledge assets using existing APIs.

V1 excludes:

- OCR text content extraction.
- PaddleOCR ONNX runtime integration.
- Cross-app UI automation.
- Accessibility tree extraction.
- Cloud-only vision recognition as the primary block detector.

Future OCR path:

- Keep `text`, `textConfidence`, and `ocrProvider` fields optional in contracts.
- Add `source: 'local-heuristic' | 'ai-vision' | 'paddleocr-onnx'` per recognition layer.
- Do not add ONNX dependencies in this plan.

## File Structure

- `desktop/src/contracts/screenshot.ts`
  - Shared TypeScript data contracts for capture request, region, image metadata, recognized blocks, and result payloads.
- `desktop/src/main/screenshot/ipc.ts`
  - Main-process IPC handlers: start capture, recognize PNG bytes, save result as knowledge asset, attach screenshot to AI.
- `desktop/src/main/screenshot/window.ts`
  - Owns lifecycle for the transparent screenshot overlay window.
- `desktop/src/main/screenshot/capture.ts`
  - Electron `desktopCapturer` and `screen` logic, display matching, coordinate conversion, PNG crop helpers.
- `desktop/src/main/screenshot/native_recognition.ts`
  - Thin wrapper around `@guyantools/core.recognizeScreenshotUiBlocks`.
- `desktop/src/windows/screenshot/main.ts`
  - Vite entry for screenshot overlay.
- `desktop/src/windows/screenshot/App.vue`
  - Region selection UI and recognition result preview overlay.
- `desktop/src/preload.ts`
  - Expose `window.screenshotApi`.
- `desktop/src/core/@types/index.d.ts`
  - Add global `Window.screenshotApi` typing.
- `desktop/src/main/index.ts`
  - Register screenshot IPC handlers during app construction.
- `desktop/src/contracts/app_config.ts`
  - Add `shortcuts.system.captureScreenshotRegion`.
- `desktop/src/main/app-config/manager.ts`
  - Normalize the new shortcut setting.
- `desktop/src/main/shortcuts/service.ts`
  - Register global screenshot shortcut and include system conflict probing.
- `desktop/src/windows/main/pages/Settings.vue`
  - Add shortcut configuration UI for screenshot capture.
- `multi_platform_core/Cargo.toml`
  - Add lightweight image-processing dependencies.
- `multi_platform_core/src/lib.rs`
  - Export screenshot module.
- `multi_platform_core/src/screenshot/mod.rs`
  - Rust module entry.
- `multi_platform_core/src/screenshot/recognition.rs`
  - Heuristic block detector and unit tests.
- `multi_platform_core/src/bindings/napi.rs`
  - Expose native recognition as `recognizeScreenshotUiBlocks`.
- `multi_platform_core/scripts/write-index-dts.cjs`
  - Add native function declaration.
- `desktop/scripts/verify-screenshot-recognition.cjs`
  - Static integration verifier.
- `desktop/package.json`
  - Add `verify:screenshot-recognition` script.

## Data Contract

The canonical V1 result shape is:

```ts
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

export interface ScreenshotUiBlock {
  id: string;
  kind: ScreenshotUiBlockKind;
  rect: ScreenshotRect;
  confidence: number;
  parentId?: string;
  childIds: string[];
  source: 'local-heuristic' | 'ai-vision' | 'paddleocr-onnx';
  features: {
    edgeDensity: number;
    fillRatio: number;
    aspectRatio: number;
    horizontalAlignmentScore: number;
    repeatedSiblingScore: number;
  };
  text?: string;
  textConfidence?: number;
  metadata?: Record<string, unknown>;
}
```

## Task 1: Shared Screenshot Contracts

**Files:**
- Create: `desktop/src/contracts/screenshot.ts`
- Modify: `desktop/src/core/@types/index.d.ts`
- Test: `desktop/scripts/verify-screenshot-recognition.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Write the failing static verifier**

Create `desktop/scripts/verify-screenshot-recognition.cjs`:

```js
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
  ['src/core/@types/index.d.ts', ['screenshotApi: import']],
  ['../multi_platform_core/src/screenshot/recognition.rs', ['recognize_ui_blocks_from_rgba']],
  ['src/main/screenshot/ipc.ts', ["screenshot:start-capture", "screenshot:recognize-image"]],
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
```

- [ ] **Step 2: Run verifier and confirm failure**

Run:

```bash
pnpm --dir desktop exec node scripts/verify-screenshot-recognition.cjs
```

Expected:

```text
[verify-screenshot-recognition] Missing file: src/contracts/screenshot.ts
```

- [ ] **Step 3: Create screenshot contract**

Create `desktop/src/contracts/screenshot.ts`:

```ts
export type ScreenshotCaptureMode = 'region';

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

export interface ScreenshotStartCaptureResult {
  accepted: boolean;
}

export interface ScreenshotApi {
  startCapture: (input?: ScreenshotCaptureRequest) => Promise<ScreenshotStartCaptureResult>;
  recognizeImage: (
    image: ScreenshotCaptureImage,
    options?: ScreenshotRecognitionOptions,
  ) => Promise<ScreenshotRecognitionResult>;
  onCaptureResult: (listener: (result: ScreenshotRecognitionResult) => void) => () => void;
}
```

- [ ] **Step 4: Add global Window typing**

Modify `desktop/src/core/@types/index.d.ts` and add the screenshot API beside the existing window APIs:

```ts
interface Window {
  screenshotApi: import('@/contracts/screenshot').ScreenshotApi;
}
```

If `Window` is already declared, add only the `screenshotApi` field inside the existing declaration.

- [ ] **Step 5: Add package script**

Modify `desktop/package.json` scripts:

```json
"verify:screenshot-recognition": "node scripts/verify-screenshot-recognition.cjs"
```

- [ ] **Step 6: Run verifier**

Run:

```bash
pnpm --dir desktop run verify:screenshot-recognition
```

Expected: failure now moves to missing implementation files, not missing contract.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/contracts/screenshot.ts desktop/src/core/@types/index.d.ts desktop/scripts/verify-screenshot-recognition.cjs desktop/package.json
git commit -m "feat(desktop): add screenshot recognition contracts"
```

## Task 2: Rust UI Block Recognition Core

**Files:**
- Modify: `multi_platform_core/Cargo.toml`
- Modify: `multi_platform_core/src/lib.rs`
- Create: `multi_platform_core/src/screenshot/mod.rs`
- Create: `multi_platform_core/src/screenshot/recognition.rs`

- [ ] **Step 1: Add Rust dependencies**

Modify `multi_platform_core/Cargo.toml`:

```toml
image = { version = "0.25", default-features = false, features = ["png", "jpeg", "webp"] }
```

Do not add OpenCV, ONNX Runtime, or PaddleOCR dependencies in this task.

- [ ] **Step 2: Export screenshot module**

Modify `multi_platform_core/src/lib.rs`:

```rust
pub mod screenshot;
```

Place it near the other top-level `pub mod` declarations.

- [ ] **Step 3: Create module entry**

Create `multi_platform_core/src/screenshot/mod.rs`:

```rust
pub mod recognition;
```

- [ ] **Step 4: Write failing Rust tests**

Create `multi_platform_core/src/screenshot/recognition.rs` with tests first:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScreenshotUiBlockKind {
    Button,
    Input,
    Card,
    ListItem,
    Navigation,
    Image,
    Group,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRecognitionOptions {
    pub min_block_width: Option<u32>,
    pub min_block_height: Option<u32>,
    pub merge_gap: Option<u32>,
    pub max_blocks: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotUiBlockFeatures {
    pub edge_density: f32,
    pub fill_ratio: f32,
    pub aspect_ratio: f32,
    pub horizontal_alignment_score: f32,
    pub repeated_sibling_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotUiBlock {
    pub id: String,
    pub kind: ScreenshotUiBlockKind,
    pub rect: ScreenshotRect,
    pub confidence: f32,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub source: String,
    pub features: ScreenshotUiBlockFeatures,
}

pub fn recognize_ui_blocks_from_rgba(
    _width: u32,
    _height: u32,
    _rgba: &[u8],
    _options: ScreenshotRecognitionOptions,
) -> Vec<ScreenshotUiBlock> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set_rect(rgba: &mut [u8], width: u32, rect: ScreenshotRect, color: [u8; 4]) {
        for y in rect.y..rect.y + rect.height {
            for x in rect.x..rect.x + rect.width {
                let offset = ((y * width + x) * 4) as usize;
                rgba[offset..offset + 4].copy_from_slice(&color);
            }
        }
    }

    #[test]
    fn detects_buttons_inputs_cards_lists_and_navigation() {
        let width = 360;
        let height = 220;
        let mut rgba = vec![245u8; (width * height * 4) as usize];
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[245, 247, 250, 255]);
        }

        set_rect(&mut rgba, width, ScreenshotRect { x: 0, y: 0, width: 360, height: 44 }, [32, 42, 58, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 24, y: 66, width: 312, height: 124 }, [255, 255, 255, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 44, y: 88, width: 170, height: 28 }, [248, 250, 252, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 230, y: 88, width: 82, height: 28 }, [37, 99, 235, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 44, y: 132, width: 268, height: 24 }, [241, 245, 249, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 44, y: 160, width: 268, height: 24 }, [241, 245, 249, 255]);

        let blocks = recognize_ui_blocks_from_rgba(width, height, &rgba, ScreenshotRecognitionOptions {
            min_block_width: Some(12),
            min_block_height: Some(10),
            merge_gap: Some(6),
            max_blocks: Some(64),
        });

        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Navigation));
        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Card));
        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Input));
        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Button));
        assert!(blocks.iter().filter(|block| block.kind == ScreenshotUiBlockKind::ListItem).count() >= 2);
    }
}
```

- [ ] **Step 5: Run test and confirm failure**

Run:

```bash
cargo test --manifest-path multi_platform_core/Cargo.toml screenshot::recognition::tests::detects_buttons_inputs_cards_lists_and_navigation
```

Expected:

```text
FAILED
assertion failed: blocks.iter().any(...)
```

- [ ] **Step 6: Implement minimal heuristic detector**

Replace `recognize_ui_blocks_from_rgba` in `multi_platform_core/src/screenshot/recognition.rs`:

```rust
pub fn recognize_ui_blocks_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
    options: ScreenshotRecognitionOptions,
) -> Vec<ScreenshotUiBlock> {
    if width == 0 || height == 0 || rgba.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    let min_w = options.min_block_width.unwrap_or(16);
    let min_h = options.min_block_height.unwrap_or(12);
    let max_blocks = options.max_blocks.unwrap_or(128);
    let background = sample_background(width, height, rgba);
    let mut visited = vec![false; (width * height) as usize];
    let mut rects = Vec::new();

    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) as usize;
            if visited[index] || !is_foreground(width, rgba, x, y, background) {
                continue;
            }
            let rect = flood_rect(width, height, rgba, &mut visited, x, y, background);
            if rect.width >= min_w && rect.height >= min_h {
                rects.push(rect);
            }
        }
    }

    rects.sort_by_key(|rect| (rect.y, rect.x));
    rects
        .into_iter()
        .take(max_blocks)
        .enumerate()
        .map(|(index, rect)| {
            let features = features_for_rect(width, rgba, &rect);
            let kind = classify_rect(width, height, &rect, &features);
            ScreenshotUiBlock {
                id: format!("block-{}", index + 1),
                kind,
                rect,
                confidence: confidence_for_features(&features),
                parent_id: None,
                child_ids: Vec::new(),
                source: "local-heuristic".to_string(),
                features,
            }
        })
        .collect()
}

fn sample_background(width: u32, height: u32, rgba: &[u8]) -> [u8; 3] {
    let points = [
        (0, 0),
        (width.saturating_sub(1), 0),
        (0, height.saturating_sub(1)),
        (width.saturating_sub(1), height.saturating_sub(1)),
    ];
    let mut sum = [0u32; 3];
    for (x, y) in points {
        let offset = ((y * width + x) * 4) as usize;
        sum[0] += rgba[offset] as u32;
        sum[1] += rgba[offset + 1] as u32;
        sum[2] += rgba[offset + 2] as u32;
    }
    [(sum[0] / 4) as u8, (sum[1] / 4) as u8, (sum[2] / 4) as u8]
}

fn is_foreground(width: u32, rgba: &[u8], x: u32, y: u32, background: [u8; 3]) -> bool {
    let offset = ((y * width + x) * 4) as usize;
    let alpha = rgba[offset + 3];
    if alpha < 24 {
        return false;
    }
    color_distance([rgba[offset], rgba[offset + 1], rgba[offset + 2]], background) > 18
}

fn flood_rect(
    width: u32,
    height: u32,
    rgba: &[u8],
    visited: &mut [bool],
    start_x: u32,
    start_y: u32,
    background: [u8; 3],
) -> ScreenshotRect {
    let mut stack = vec![(start_x, start_y)];
    let mut left = start_x;
    let mut right = start_x;
    let mut top = start_y;
    let mut bottom = start_y;

    while let Some((x, y)) = stack.pop() {
        if x >= width || y >= height {
            continue;
        }
        let index = (y * width + x) as usize;
        if visited[index] || !is_foreground(width, rgba, x, y, background) {
            continue;
        }
        visited[index] = true;
        left = left.min(x);
        right = right.max(x);
        top = top.min(y);
        bottom = bottom.max(y);
        if x > 0 {
            stack.push((x - 1, y));
        }
        if x + 1 < width {
            stack.push((x + 1, y));
        }
        if y > 0 {
            stack.push((x, y - 1));
        }
        if y + 1 < height {
            stack.push((x, y + 1));
        }
    }

    ScreenshotRect {
        x: left,
        y: top,
        width: right.saturating_sub(left) + 1,
        height: bottom.saturating_sub(top) + 1,
    }
}

fn features_for_rect(width: u32, rgba: &[u8], rect: &ScreenshotRect) -> ScreenshotUiBlockFeatures {
    let aspect_ratio = rect.width as f32 / rect.height.max(1) as f32;
    let fill_ratio = foreground_fill_ratio(width, rgba, rect);
    ScreenshotUiBlockFeatures {
        edge_density: edge_density(width, rgba, rect),
        fill_ratio,
        aspect_ratio,
        horizontal_alignment_score: if rect.width > rect.height * 3 { 0.85 } else { 0.35 },
        repeated_sibling_score: 0.0,
    }
}

fn classify_rect(
    image_width: u32,
    image_height: u32,
    rect: &ScreenshotRect,
    features: &ScreenshotUiBlockFeatures,
) -> ScreenshotUiBlockKind {
    if rect.y <= 4 && rect.width > image_width * 8 / 10 && rect.height <= image_height / 4 {
        return ScreenshotUiBlockKind::Navigation;
    }
    if rect.width > image_width / 2 && rect.height > image_height / 3 {
        return ScreenshotUiBlockKind::Card;
    }
    if features.aspect_ratio >= 2.5 && rect.height <= 36 && features.fill_ratio > 0.82 {
        if features.edge_density > 0.18 {
            return ScreenshotUiBlockKind::Input;
        }
        return ScreenshotUiBlockKind::Button;
    }
    if features.aspect_ratio >= 5.0 && rect.height <= 32 {
        return ScreenshotUiBlockKind::ListItem;
    }
    ScreenshotUiBlockKind::Unknown
}

fn foreground_fill_ratio(width: u32, rgba: &[u8], rect: &ScreenshotRect) -> f32 {
    let mut filled = 0u32;
    let mut total = 0u32;
    let background = sample_background(width, rect.y + rect.height, rgba);
    for y in rect.y..rect.y + rect.height {
        for x in rect.x..rect.x + rect.width {
            total += 1;
            if is_foreground(width, rgba, x, y, background) {
                filled += 1;
            }
        }
    }
    filled as f32 / total.max(1) as f32
}

fn edge_density(width: u32, rgba: &[u8], rect: &ScreenshotRect) -> f32 {
    if rect.width < 3 || rect.height < 3 {
        return 0.0;
    }
    let mut edges = 0u32;
    let mut total = 0u32;
    for y in rect.y + 1..rect.y + rect.height - 1 {
        for x in rect.x + 1..rect.x + rect.width - 1 {
            total += 1;
            let current = luminance(width, rgba, x, y);
            let right = luminance(width, rgba, x + 1, y);
            let down = luminance(width, rgba, x, y + 1);
            if (current - right).abs() + (current - down).abs() > 30.0 {
                edges += 1;
            }
        }
    }
    edges as f32 / total.max(1) as f32
}

fn confidence_for_features(features: &ScreenshotUiBlockFeatures) -> f32 {
    (0.45 + features.fill_ratio.min(1.0) * 0.35 + features.edge_density.min(1.0) * 0.2)
        .clamp(0.0, 0.98)
}

fn luminance(width: u32, rgba: &[u8], x: u32, y: u32) -> f32 {
    let offset = ((y * width + x) * 4) as usize;
    rgba[offset] as f32 * 0.2126 + rgba[offset + 1] as f32 * 0.7152 + rgba[offset + 2] as f32 * 0.0722
}

fn color_distance(a: [u8; 3], b: [u8; 3]) -> u16 {
    let dr = a[0].abs_diff(b[0]) as u16;
    let dg = a[1].abs_diff(b[1]) as u16;
    let db = a[2].abs_diff(b[2]) as u16;
    dr + dg + db
}
```

- [ ] **Step 7: Run Rust test**

Run:

```bash
cargo test --manifest-path multi_platform_core/Cargo.toml screenshot::recognition::tests::detects_buttons_inputs_cards_lists_and_navigation
```

Expected:

```text
test result: ok. 1 passed
```

- [ ] **Step 8: Commit**

```bash
git add multi_platform_core/Cargo.toml multi_platform_core/src/lib.rs multi_platform_core/src/screenshot
git commit -m "feat(core): add native screenshot UI block detection"
```

## Task 3: N-API Binding For Native Recognition

**Files:**
- Modify: `multi_platform_core/src/bindings/napi.rs`
- Modify: `multi_platform_core/scripts/write-index-dts.cjs`
- Create: `desktop/src/main/screenshot/native_recognition.ts`

- [ ] **Step 1: Add N-API function**

Modify `multi_platform_core/src/bindings/napi.rs` imports:

```rust
use crate::screenshot::recognition::{
    recognize_ui_blocks_from_rgba,
    ScreenshotRecognitionOptions,
};
use image::ImageReader;
use std::io::Cursor;
```

Add this top-level function after `init()`:

```rust
#[napi(js_name = "recognizeScreenshotUiBlocks")]
pub async fn recognize_screenshot_ui_blocks(
    png_bytes: Buffer,
    options_json: Option<String>,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let options = match options_json {
            Some(value) if !value.trim().is_empty() => serde_json::from_str::<ScreenshotRecognitionOptions>(&value)
                .map_err(|e| Error::from_reason(format!("截图识别参数无效: {}", e)))?,
            _ => ScreenshotRecognitionOptions {
                min_block_width: Some(16),
                min_block_height: Some(12),
                merge_gap: Some(6),
                max_blocks: Some(128),
            },
        };

        let image = ImageReader::new(Cursor::new(png_bytes.to_vec()))
            .with_guessed_format()
            .map_err(|e| Error::from_reason(format!("截图格式识别失败: {}", e)))?
            .decode()
            .map_err(|e| Error::from_reason(format!("截图解码失败: {}", e)))?
            .to_rgba8();

        let blocks = recognize_ui_blocks_from_rgba(
            image.width(),
            image.height(),
            image.as_raw(),
            options,
        );

        serde_json::to_string(&blocks)
            .map_err(|e| Error::from_reason(format!("截图识别结果序列化失败: {}", e)))
    })
    .await
    .map_err(|e| Error::from_reason(format!("截图识别任务执行失败: {}", e)))?
}
```

- [ ] **Step 2: Update generated type declaration source**

Modify `multi_platform_core/scripts/write-index-dts.cjs` and add before class declarations:

```js
export function recognizeScreenshotUiBlocks(pngBytes: Buffer, optionsJson?: string): Promise<string>;
```

- [ ] **Step 3: Create TypeScript wrapper**

Create `desktop/src/main/screenshot/native_recognition.ts`:

```ts
import * as nativeCore from '@guyantools/core';
import type { ScreenshotRecognitionOptions, ScreenshotUiBlock } from '@/contracts/screenshot';

type NativeRecognitionModule = typeof nativeCore & {
  recognizeScreenshotUiBlocks?: (pngBytes: Buffer, optionsJson?: string) => Promise<string>;
};

export async function recognizeScreenshotUiBlocksNative(
  pngBytes: Buffer,
  options: ScreenshotRecognitionOptions = {},
): Promise<ScreenshotUiBlock[]> {
  const recognizer = (nativeCore as NativeRecognitionModule).recognizeScreenshotUiBlocks;
  if (!recognizer) {
    throw new Error('当前原生核心未暴露截图 UI 块识别能力');
  }

  const raw = await recognizer(pngBytes, JSON.stringify(options));
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('截图 UI 块识别结果格式无效');
  }

  return parsed.map(normalizeNativeBlock);
}

function normalizeNativeBlock(value: unknown): ScreenshotUiBlock {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rect = record.rect && typeof record.rect === 'object' ? record.rect as Record<string, unknown> : {};
  const features = record.features && typeof record.features === 'object' ? record.features as Record<string, unknown> : {};

  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    kind: normalizeKind(record.kind),
    rect: {
      x: numeric(rect.x),
      y: numeric(rect.y),
      width: numeric(rect.width),
      height: numeric(rect.height),
    },
    confidence: clamp(numeric(record.confidence), 0, 1),
    parentId: typeof record.parentId === 'string' ? record.parentId : undefined,
    childIds: Array.isArray(record.childIds) ? record.childIds.filter((item): item is string => typeof item === 'string') : [],
    source: 'local-heuristic',
    features: {
      edgeDensity: numeric(features.edgeDensity),
      fillRatio: numeric(features.fillRatio),
      aspectRatio: numeric(features.aspectRatio),
      horizontalAlignmentScore: numeric(features.horizontalAlignmentScore),
      repeatedSiblingScore: numeric(features.repeatedSiblingScore),
    },
    text: typeof record.text === 'string' ? record.text : undefined,
    textConfidence: typeof record.textConfidence === 'number' ? record.textConfidence : undefined,
    metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : undefined,
  };
}

function normalizeKind(value: unknown): ScreenshotUiBlock['kind'] {
  if (
    value === 'button'
    || value === 'input'
    || value === 'card'
    || value === 'list_item'
    || value === 'navigation'
    || value === 'image'
    || value === 'group'
    || value === 'unknown'
  ) {
    return value;
  }
  return 'unknown';
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Build native debug artifact**

Run:

```bash
pnpm run native:build:debug
```

Expected: native build succeeds and desktop artifacts sync.

- [ ] **Step 5: Commit**

```bash
git add multi_platform_core/src/bindings/napi.rs multi_platform_core/scripts/write-index-dts.cjs desktop/src/main/screenshot/native_recognition.ts
git commit -m "feat(desktop): expose native screenshot recognition"
```

## Task 4: Electron Screenshot Capture Service

**Files:**
- Create: `desktop/src/main/screenshot/capture.ts`
- Create: `desktop/src/main/screenshot/window.ts`
- Create: `desktop/src/main/screenshot/ipc.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/preload.ts`

- [ ] **Step 1: Create capture helper**

Create `desktop/src/main/screenshot/capture.ts`:

```ts
import { desktopCapturer, nativeImage, screen } from 'electron';
import type { ScreenshotCaptureImage, ScreenshotRect } from '@/contracts/screenshot';

export async function captureScreenshotRegion(region: ScreenshotRect, displayId: number): Promise<ScreenshotCaptureImage> {
  const display = screen.getAllDisplays().find((item) => item.id === displayId)
    ?? screen.getDisplayMatching(region);
  const source = await getScreenSource(display.id);
  const fullImage = source.thumbnail;
  if (fullImage.isEmpty()) {
    throw new Error('无法读取屏幕截图');
  }

  const scaleFactor = display.scaleFactor || 1;
  const cropRect = {
    x: Math.round((region.x - display.bounds.x) * scaleFactor),
    y: Math.round((region.y - display.bounds.y) * scaleFactor),
    width: Math.round(region.width * scaleFactor),
    height: Math.round(region.height * scaleFactor),
  };

  const cropped = fullImage.crop(cropRect);
  const png = cropped.toPNG();
  if (!png.length) {
    throw new Error('区域截图编码失败');
  }

  return {
    pngBase64: png.toString('base64'),
    mimeType: 'image/png',
    byteSize: png.length,
    displayId: display.id,
    region,
    capturedAt: new Date().toISOString(),
  };
}

async function getScreenSource(displayId: number) {
  const displays = screen.getAllDisplays();
  const maxWidth = Math.max(...displays.map((display) => Math.ceil(display.bounds.width * display.scaleFactor)));
  const maxHeight = Math.max(...displays.map((display) => Math.ceil(display.bounds.height * display.scaleFactor)));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxWidth, height: maxHeight },
  });
  const source = sources.find((item) => item.display_id === String(displayId)) ?? sources[0];
  if (!source) {
    throw new Error('未找到可用屏幕源');
  }
  return {
    ...source,
    thumbnail: nativeImage.createFromDataURL(source.thumbnail.toDataURL()),
  };
}
```

- [ ] **Step 2: Create overlay window manager**

Create `desktop/src/main/screenshot/window.ts`:

```ts
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import type { ScreenshotCaptureRequest, ScreenshotDisplayInfo } from '@/contracts/screenshot';

let screenshotWindow: BrowserWindow | null = null;

export async function showScreenshotWindow(input: ScreenshotCaptureRequest = { mode: 'region', recognize: true }) {
  if (screenshotWindow && !screenshotWindow.isDestroyed()) {
    screenshotWindow.focus();
    return { accepted: true };
  }

  const bounds = unionDisplayBounds();
  screenshotWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  screenshotWindow.setAlwaysOnTop(true, 'screen-saver');
  screenshotWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  screenshotWindow.once('closed', () => {
    screenshotWindow = null;
  });

  await loadScreenshotRoute(screenshotWindow);
  screenshotWindow.webContents.once('did-finish-load', () => {
    screenshotWindow?.webContents.send('screenshot:capture-options', {
      request: input,
      displays: getDisplays(),
      bounds,
    });
  });
  screenshotWindow.show();
  return { accepted: true };
}

export function closeScreenshotWindow() {
  if (screenshotWindow && !screenshotWindow.isDestroyed()) {
    screenshotWindow.close();
  }
  screenshotWindow = null;
}

export function registerScreenshotWindowEvents() {
  ipcMain.handle('screenshot-overlay:close', async () => {
    closeScreenshotWindow();
  });
}

function getDisplays(): ScreenshotDisplayInfo[] {
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
    workArea: display.workArea,
  }));
}

function unionDisplayBounds() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function loadScreenshotRoute(win: BrowserWindow) {
  if (process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await win.loadURL(`${process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL}/screenshot.html`);
    return;
  }
    await win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/screenshot.html`),
    );
}
```

- [ ] **Step 3: Create screenshot IPC**

Create `desktop/src/main/screenshot/ipc.ts`:

```ts
import { BrowserWindow, ipcMain } from 'electron';
import type {
  ScreenshotCaptureImage,
  ScreenshotCaptureRequest,
  ScreenshotRecognitionOptions,
  ScreenshotRecognitionResult,
} from '@/contracts/screenshot';
import { captureScreenshotRegion } from './capture';
import { recognizeScreenshotUiBlocksNative } from './native_recognition';
import { closeScreenshotWindow, registerScreenshotWindowEvents, showScreenshotWindow } from './window';

let registered = false;

export function registerScreenshotIpcHandlers() {
  if (registered) return;
  registered = true;

  registerScreenshotWindowEvents();

  ipcMain.handle('screenshot:start-capture', async (_event, input?: ScreenshotCaptureRequest) =>
    showScreenshotWindow(input ?? { mode: 'region', recognize: true }));

  ipcMain.handle('screenshot:capture-region', async (_event, region, displayId: number) =>
    captureScreenshotRegion(region, displayId));

  ipcMain.handle('screenshot:recognize-image', async (_event, image: ScreenshotCaptureImage, options?: ScreenshotRecognitionOptions) =>
    recognizeImage(image, options));

  ipcMain.handle('screenshot-overlay:complete', async (event, result: ScreenshotRecognitionResult) => {
    closeScreenshotWindow();
    broadcastCaptureResult(result, BrowserWindow.fromWebContents(event.sender));
  });
}

async function recognizeImage(
  image: ScreenshotCaptureImage,
  options?: ScreenshotRecognitionOptions,
): Promise<ScreenshotRecognitionResult> {
  const startedAt = Date.now();
  const pngBytes = Buffer.from(image.pngBase64, 'base64');
  const blocks = await recognizeScreenshotUiBlocksNative(pngBytes, options);
  return {
    image,
    blocks,
    elapsedMs: Date.now() - startedAt,
    warnings: [],
  };
}

function broadcastCaptureResult(result: ScreenshotRecognitionResult, sourceWindow: BrowserWindow | null) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === sourceWindow) continue;
    win.webContents.send('screenshot:capture-result', result);
  }
}
```

- [ ] **Step 4: Register IPC in app startup**

Modify `desktop/src/main/index.ts` imports:

```ts
import { registerScreenshotIpcHandlers } from './screenshot/ipc';
```

Add in the constructor with other IPC registrations:

```ts
registerScreenshotIpcHandlers();
```

- [ ] **Step 5: Expose preload API**

Modify `desktop/src/preload.ts`:

```ts
import type { ScreenshotApi } from '@/contracts/screenshot';
```

Add inside `contextBridge.exposeInMainWorld` setup:

```ts
const screenshotApi: ScreenshotApi = {
  startCapture: (input) => ipcRenderer.invoke('screenshot:start-capture', input),
  recognizeImage: (image, options) => ipcRenderer.invoke('screenshot:recognize-image', image, options),
  onCaptureResult: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, result: Parameters<typeof listener>[0]) => listener(result);
    ipcRenderer.on('screenshot:capture-result', wrappedListener);
    return () => ipcRenderer.removeListener('screenshot:capture-result', wrappedListener);
  },
};

contextBridge.exposeInMainWorld('screenshotApi', screenshotApi);
```

If the file already groups APIs in one object, add this beside `aiApi` and `knowledgeApi` without changing unrelated APIs.

- [ ] **Step 6: Run verifier**

Run:

```bash
pnpm --dir desktop run verify:screenshot-recognition
```

Expected: fails only for screenshot overlay files and shortcut tokens.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/screenshot desktop/src/main/index.ts desktop/src/preload.ts
git commit -m "feat(desktop): add screenshot capture IPC"
```

## Task 5: Screenshot Overlay Renderer

**Files:**
- Create: `desktop/screenshot.html`
- Modify: `desktop/vite.renderer.config.ts`
- Create: `desktop/src/windows/screenshot/main.ts`
- Create: `desktop/src/windows/screenshot/App.vue`

- [ ] **Step 1: Create screenshot HTML entry**

Create `desktop/screenshot.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GuYanTools Screenshot</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/windows/screenshot/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create renderer entry**

Create `desktop/src/windows/screenshot/main.ts`:

```ts
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

- [ ] **Step 3: Create overlay UI**

Create `desktop/src/windows/screenshot/App.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
  ScreenshotCaptureImage,
  ScreenshotDisplayInfo,
  ScreenshotRecognitionResult,
  ScreenshotRect,
  ScreenshotUiBlock,
} from '@/contracts/screenshot';

interface OverlayPayload {
  displays: ScreenshotDisplayInfo[];
  bounds: ScreenshotRect;
}

const payload = ref<OverlayPayload | null>(null);
const dragStart = ref<{ x: number; y: number } | null>(null);
const dragCurrent = ref<{ x: number; y: number } | null>(null);
const result = ref<ScreenshotRecognitionResult | null>(null);
const busy = ref(false);
const error = ref('');

const selection = computed<ScreenshotRect | null>(() => {
  if (!dragStart.value || !dragCurrent.value) return null;
  const x = Math.min(dragStart.value.x, dragCurrent.value.x);
  const y = Math.min(dragStart.value.y, dragCurrent.value.y);
  const width = Math.abs(dragStart.value.x - dragCurrent.value.x);
  const height = Math.abs(dragStart.value.y - dragCurrent.value.y);
  if (width < 8 || height < 8) return null;
  return { x, y, width, height };
});

function onPointerDown(event: PointerEvent) {
  if (busy.value) return;
  dragStart.value = { x: event.screenX, y: event.screenY };
  dragCurrent.value = { x: event.screenX, y: event.screenY };
}

function onPointerMove(event: PointerEvent) {
  if (!dragStart.value || busy.value) return;
  dragCurrent.value = { x: event.screenX, y: event.screenY };
}

async function onPointerUp() {
  if (!selection.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const display = displayForRect(selection.value);
    const image = await window.electron.ipcRenderer.invoke('screenshot:capture-region', selection.value, display.id) as ScreenshotCaptureImage;
    const recognized = await window.screenshotApi.recognizeImage(image, {
      minBlockWidth: 14,
      minBlockHeight: 10,
      mergeGap: 6,
      maxBlocks: 160,
    });
    result.value = recognized;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function acceptResult() {
  if (!result.value) return;
  await window.electron.ipcRenderer.invoke('screenshot-overlay:complete', result.value);
}

async function cancel() {
  await window.electron.ipcRenderer.invoke('screenshot-overlay:close');
}

function displayForRect(rect: ScreenshotRect) {
  const displays = payload.value?.displays ?? [];
  return displays.find((display) =>
    rect.x >= display.bounds.x
    && rect.y >= display.bounds.y
    && rect.x <= display.bounds.x + display.bounds.width
    && rect.y <= display.bounds.y + display.bounds.height,
  ) ?? displays[0];
}

function blockStyle(block: ScreenshotUiBlock) {
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    left: `${block.rect.x + (result.value?.image.region.x ?? 0) - root.x}px`,
    top: `${block.rect.y + (result.value?.image.region.y ?? 0) - root.y}px`,
    width: `${block.rect.width}px`,
    height: `${block.rect.height}px`,
  };
}

function selectionStyle() {
  const rect = selection.value;
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  if (!rect) return {};
  return {
    left: `${rect.x - root.x}px`,
    top: `${rect.y - root.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') void cancel();
  if (event.key === 'Enter' && result.value) void acceptResult();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.electron.ipcRenderer.once('screenshot:capture-options', (_event, nextPayload: OverlayPayload) => {
    payload.value = nextPayload;
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <main
    class="screenshot-overlay"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <div class="screenshot-overlay__shade" />
    <div v-if="selection" class="screenshot-overlay__selection" :style="selectionStyle()" />
    <button class="screenshot-overlay__cancel" type="button" @click.stop="cancel">取消</button>
    <section v-if="result" class="screenshot-overlay__result" @pointerdown.stop>
      <strong>{{ result.blocks.length }} 个 UI 块</strong>
      <span>{{ result.elapsedMs }} ms</span>
      <button type="button" @click="acceptResult">完成</button>
    </section>
    <p v-if="busy" class="screenshot-overlay__status">正在识别</p>
    <p v-if="error" class="screenshot-overlay__error">{{ error }}</p>
    <div
      v-for="block in result?.blocks ?? []"
      :key="block.id"
      class="screenshot-overlay__block"
      :class="`screenshot-overlay__block--${block.kind}`"
      :style="blockStyle(block)"
    >
      <span>{{ block.kind }}</span>
    </div>
  </main>
</template>

<style scoped>
.screenshot-overlay {
  position: fixed;
  inset: 0;
  overflow: hidden;
  cursor: crosshair;
  color: #f8fafc;
  font: 12px/1.4 system-ui, sans-serif;
  user-select: none;
}

.screenshot-overlay__shade {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.26);
}

.screenshot-overlay__selection,
.screenshot-overlay__block {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #38bdf8;
  background: rgba(56, 189, 248, 0.08);
}

.screenshot-overlay__block {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.screenshot-overlay__block span {
  position: absolute;
  left: 0;
  top: -18px;
  padding: 1px 5px;
  background: #16a34a;
  color: white;
}

.screenshot-overlay__cancel,
.screenshot-overlay__result,
.screenshot-overlay__status,
.screenshot-overlay__error {
  position: fixed;
  z-index: 10;
}

.screenshot-overlay__cancel {
  right: 18px;
  top: 18px;
}

.screenshot-overlay__result {
  left: 50%;
  bottom: 24px;
  display: flex;
  gap: 12px;
  align-items: center;
  transform: translateX(-50%);
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
}

.screenshot-overlay__status,
.screenshot-overlay__error {
  left: 18px;
  bottom: 18px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
}

.screenshot-overlay__error {
  color: #fecaca;
}
</style>
```

- [ ] **Step 4: Add Vite renderer entry**

Modify `desktop/vite.renderer.config.ts` inside `build.rollupOptions.input`:

```ts
screenshot: path.resolve(__dirname, 'screenshot.html'),
```

Place it beside the other secondary window entries such as `quick_note`, `quick_launcher`, and `ai_canvas_preview`.

- [ ] **Step 5: Run desktop typecheck**

Run:

```bash
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: if `window.electron.ipcRenderer` is not typed, add the existing project-specific IPC renderer type used by other windows instead of introducing `any`.

- [ ] **Step 6: Commit**

```bash
git add desktop/screenshot.html desktop/src/windows/screenshot desktop/vite.renderer.config.ts desktop/src/core/@types/index.d.ts
git commit -m "feat(desktop): add screenshot selection overlay"
```

## Task 6: Shortcut And Settings Integration

**Files:**
- Modify: `desktop/src/contracts/app_config.ts`
- Modify: `desktop/src/main/app-config/manager.ts`
- Modify: `desktop/src/main/shortcuts/service.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/windows/main/pages/Settings.vue`

- [ ] **Step 1: Add shortcut config field**

Modify `AppSystemShortcutsConfig` in `desktop/src/contracts/app_config.ts`:

```ts
captureScreenshotRegion: string;
```

Add default value inside `createDefaultAppConfig()`:

```ts
captureScreenshotRegion: 'CommandOrControl+Alt+Shift+S',
```

- [ ] **Step 2: Normalize shortcut config**

Modify `normalizeShortcuts` in `desktop/src/main/app-config/manager.ts`:

```ts
captureScreenshotRegion: normalizeShortcutValue(
  system.captureScreenshotRegion,
  defaults.system.captureScreenshotRegion,
),
```

- [ ] **Step 3: Wire shortcut service action**

Modify `desktop/src/main/shortcuts/service.ts`:

```ts
type ScreenshotCaptureOpener = () => void;
```

Extend `RegisteredShortcutField`:

```ts
| 'captureScreenshotRegionShortcut'
```

Add class fields:

```ts
private captureScreenshotRegionShortcut = '';
private captureScreenshotRegion?: ScreenshotCaptureOpener;
```

Add action definition:

```ts
{ key: 'captureScreenshotRegion', field: 'captureScreenshotRegionShortcut', label: '区域截图识别' },
```

Add registration in `refresh`:

```ts
const screenshotAccelerator = normalizeAccelerator(config.shortcuts.system.captureScreenshotRegion);
await this.registerSimpleShortcut(
  'captureScreenshotRegionShortcut',
  screenshotAccelerator,
  captureScreenshotRegion,
  'screenshot region capture',
);
```

Add disposal:

```ts
if (this.captureScreenshotRegionShortcut) {
  globalShortcut.unregister(this.captureScreenshotRegionShortcut);
  this.captureScreenshotRegionShortcut = '';
}
```

- [ ] **Step 4: Pass action from app startup**

Modify `desktop/src/main/index.ts` to import:

```ts
import { showScreenshotWindow } from './screenshot/window';
```

Pass this callback into `shortcutService.initialize` after `toggleQuickLaunchWindow`:

```ts
() => {
  void showScreenshotWindow({ mode: 'region', recognize: true });
},
```

Update the `ShortcutService.initialize` signature accordingly.

- [ ] **Step 5: Add settings UI row**

Modify `desktop/src/windows/main/pages/Settings.vue` in the system shortcut section by following the existing `captureClipboardToQuickNote` row and adding:

```vue
<ShortcutRecorder
  :model-value="appConfigStore.config.shortcuts.system.captureScreenshotRegion"
  :default-value="defaultShortcuts.system.captureScreenshotRegion"
  @update:modelValue="updateSystemShortcut('captureScreenshotRegion', $event)"
/>
```

Use label text:

```text
区域截图识别
```

Use description text:

```text
框选屏幕区域并识别按钮、输入框、卡片、列表项和导航等结构化 UI 块。
```

- [ ] **Step 6: Run shortcut verifier**

Run:

```bash
pnpm --dir desktop run verify:shortcuts
```

Expected: pass. If it fails because the verifier has a known action list, add `captureScreenshotRegion` to that list.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/contracts/app_config.ts desktop/src/main/app-config/manager.ts desktop/src/main/shortcuts/service.ts desktop/src/main/index.ts desktop/src/windows/main/pages/Settings.vue desktop/scripts
git commit -m "feat(desktop): add screenshot recognition shortcut"
```

## Task 7: Main Window Result Handling

**Files:**
- Create: `desktop/src/windows/main/stores/screenshot_store.ts`
- Modify: `desktop/src/windows/main/App.vue` or the current main shell component that owns global listeners
- Optional Modify: `desktop/src/windows/main/pages/AI/components/AiComposer.vue`
- Optional Modify: `desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue`

- [ ] **Step 1: Create screenshot result store**

Create `desktop/src/windows/main/stores/screenshot_store.ts`:

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ScreenshotRecognitionResult } from '@/contracts/screenshot';

export const useScreenshotStore = defineStore('screenshot', () => {
  const latestResult = ref<ScreenshotRecognitionResult | null>(null);
  const history = ref<ScreenshotRecognitionResult[]>([]);

  const latestBlocks = computed(() => latestResult.value?.blocks ?? []);

  function receiveResult(result: ScreenshotRecognitionResult) {
    latestResult.value = result;
    history.value = [result, ...history.value].slice(0, 20);
  }

  function clearLatest() {
    latestResult.value = null;
  }

  return {
    latestResult,
    latestBlocks,
    history,
    receiveResult,
    clearLatest,
  };
});
```

- [ ] **Step 2: Register global result listener**

Modify the main shell component:

```ts
import { onBeforeUnmount, onMounted } from 'vue';
import { useScreenshotStore } from '@/windows/main/stores/screenshot_store';

const screenshotStore = useScreenshotStore();
let unsubscribeScreenshotResult: (() => void) | undefined;

onMounted(() => {
  unsubscribeScreenshotResult = window.screenshotApi?.onCaptureResult((result) => {
    screenshotStore.receiveResult(result);
  });
});

onBeforeUnmount(() => {
  unsubscribeScreenshotResult?.();
});
```

- [ ] **Step 3: Add minimal launcher command in a visible surface**

Add a toolbar or command button where existing global tools live:

```ts
async function startScreenshotRecognition() {
  await window.screenshotApi?.startCapture({ mode: 'region', recognize: true });
}
```

Button label:

```text
截图识别
```

- [ ] **Step 4: Add result summary drawer or panel**

Render the latest result as a compact diagnostics panel:

```vue
<section v-if="screenshotStore.latestResult" class="screenshot-result-panel">
  <header>
    <strong>截图识别</strong>
    <span>{{ screenshotStore.latestBlocks.length }} 个 UI 块</span>
  </header>
  <ol>
    <li v-for="block in screenshotStore.latestBlocks" :key="block.id">
      <span>{{ block.kind }}</span>
      <code>{{ block.rect.x }},{{ block.rect.y }} {{ block.rect.width }}x{{ block.rect.height }}</code>
    </li>
  </ol>
</section>
```

Use existing drawer/panel components if one already exists in the chosen shell surface.

- [ ] **Step 5: Run design-system lint**

Run:

```bash
pnpm --dir desktop run lint:design-system
```

Expected: pass, or fix class/control usage according to the checker output.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/windows/main/stores/screenshot_store.ts desktop/src/windows/main
git commit -m "feat(desktop): surface screenshot recognition results"
```

## Task 8: Knowledge And AI Export Hooks

**Files:**
- Modify: `desktop/src/main/screenshot/ipc.ts`
- Modify: `desktop/src/contracts/screenshot.ts`
- Modify: `desktop/src/windows/main/stores/screenshot_store.ts`

- [ ] **Step 1: Extend API contract**

Modify `ScreenshotApi` in `desktop/src/contracts/screenshot.ts`:

```ts
saveCaptureToKnowledge: (result: ScreenshotRecognitionResult) => Promise<{ assetId: string }>;
createAiAttachment: (result: ScreenshotRecognitionResult) => Promise<import('@/contracts/ai').AiChatAttachment>;
```

- [ ] **Step 2: Add knowledge save handler**

Modify `desktop/src/main/screenshot/ipc.ts`:

```ts
ipcMain.handle('screenshot:save-to-knowledge', async (_event, result: ScreenshotRecognitionResult) => {
  const database = dbManager.getDatabase() as unknown as {
    createKnowledgeAsset: (input: import('@/contracts/knowledge').CreateKnowledgeAssetPayload) => Promise<import('@/contracts/knowledge').KnowledgeAsset>;
  };
  const bytes = Buffer.from(result.image.pngBase64, 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const originalName = `screenshot-${result.image.capturedAt.replace(/[:.]/g, '-')}.png`;
  const storagePath = await writeScreenshotKnowledgeAsset(hash, originalName, bytes);
  const asset = await database.createKnowledgeAsset({
    hash,
    originalName,
    mimeType: 'image/png',
    extension: '.png',
    sizeBytes: bytes.length,
    storagePath,
    extractedText: '',
    metadataJson: JSON.stringify({
      screenshotRecognition: {
        region: result.image.region,
        blocks: result.blocks,
        elapsedMs: result.elapsedMs,
      },
    }),
    importStatus: 'ready',
  });
  return { assetId: asset.id };
});
```

Add imports:

```ts
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { dbManager } from '@/core/database';
```

Add helper:

```ts
async function writeScreenshotKnowledgeAsset(hash: string, originalName: string, bytes: Buffer) {
  const assetDir = path.join(app.getPath('userData'), 'knowledge-assets', 'screenshots', hash.slice(0, 2));
  await fs.mkdir(assetDir, { recursive: true });
  const storagePath = path.join(assetDir, `${hash}.png`);
  try {
    await fs.writeFile(storagePath, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
  return storagePath;
}
```

This V1 handler intentionally writes screenshots into `userData/knowledge-assets/screenshots/<hash-prefix>/` and then creates the asset record through `createKnowledgeAsset`. Keep the existing `knowledge/ipc.ts` asset helper unchanged in this task to avoid widening the diff.

- [ ] **Step 3: Add AI attachment handler**

Modify `desktop/src/main/screenshot/ipc.ts`:

```ts
ipcMain.handle('screenshot:create-ai-attachment', async (_event, result: ScreenshotRecognitionResult) => ({
  id: crypto.randomUUID(),
  kind: 'image',
  source: 'clipboard',
  name: `screenshot-${result.image.capturedAt}.png`,
  mimeType: 'image/png',
  size: result.image.byteSize,
  data: result.image.pngBase64,
  metadata: {
    screenshotRecognition: {
      region: result.image.region,
      blocks: result.blocks,
      elapsedMs: result.elapsedMs,
    },
  },
}));
```

- [ ] **Step 4: Expose preload methods**

Modify `desktop/src/preload.ts` screenshot API:

```ts
saveCaptureToKnowledge: (result) => ipcRenderer.invoke('screenshot:save-to-knowledge', result),
createAiAttachment: (result) => ipcRenderer.invoke('screenshot:create-ai-attachment', result),
```

- [ ] **Step 5: Add store actions**

Modify `desktop/src/windows/main/stores/screenshot_store.ts`:

```ts
async function saveLatestToKnowledge() {
  if (!latestResult.value) return null;
  return window.screenshotApi.saveCaptureToKnowledge(latestResult.value);
}

async function createLatestAiAttachment() {
  if (!latestResult.value) return null;
  return window.screenshotApi.createAiAttachment(latestResult.value);
}
```

Return both actions from the store.

- [ ] **Step 6: Run AI verification**

Run:

```bash
pnpm --dir desktop run verify:ai-chat
```

Expected: pass; screenshot-created image attachments use the same shape as existing image attachments.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/contracts/screenshot.ts desktop/src/main/screenshot/ipc.ts desktop/src/preload.ts desktop/src/windows/main/stores/screenshot_store.ts
git commit -m "feat(desktop): export screenshot recognition results"
```

## Task 9: Final Verification

**Files:**
- Modify only if verification reveals concrete issues.

- [ ] **Step 1: Run screenshot verifier**

```bash
pnpm --dir desktop run verify:screenshot-recognition
```

Expected:

```text
[verify-screenshot-recognition] OK
```

- [ ] **Step 2: Run native tests**

```bash
cargo test --manifest-path multi_platform_core/Cargo.toml screenshot
```

Expected:

```text
test result: ok
```

- [ ] **Step 3: Run desktop typecheck**

```bash
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run desktop lint**

```bash
pnpm --dir desktop run lint
```

Expected: no ESLint errors.

- [ ] **Step 5: Run desktop build**

```bash
pnpm --dir desktop run build:app
```

Expected: Electron main, preload, plugin preload, and renderer builds all succeed.

- [ ] **Step 6: Manual smoke test**

Run:

```bash
pnpm run desktop:start
```

Manual checks:

- Press the configured screenshot shortcut.
- Draw a region around a UI surface containing at least one button, one input-like rectangle, one card, two list rows, and a top navigation bar.
- Confirm the overlay shows block rectangles and labels.
- Press Enter to accept.
- Confirm the main window receives a result summary.
- Save to knowledge and confirm an image asset is created.
- Create AI attachment and confirm the selected AI model must have `vision` capability before sending.

- [ ] **Step 7: Commit verification fixes**

If any verification change was needed:

```bash
git add <changed-files>
git commit -m "fix(desktop): stabilize screenshot recognition verification"
```

## Self-Review

Spec coverage:

- Electron screenshot capture is covered by Task 4 and Task 5.
- Rust acceleration is covered by Task 2 and Task 3.
- Structured UI block kinds are covered by Task 1 and Task 2.
- Main-window result delivery is covered by Task 7.
- Knowledge and AI export hooks are covered by Task 8.
- OCR/PaddleOCR ONNX is intentionally excluded from implementation and represented through optional contract fields.

Placeholder scan:

- No placeholder markers or empty implementation steps remain.
- The only future scope is explicitly excluded from V1 and represented as contract compatibility.

Type consistency:

- `ScreenshotUiBlock`, `ScreenshotRecognitionResult`, and `ScreenshotApi` are defined in Task 1 before use.
- Rust `ScreenshotUiBlockKind` uses `snake_case` serialization to match TypeScript union values.
- Native wrapper normalizes Rust JSON before renderer use.
