const zlib = require('node:zlib');
const core = require('@guyantools/core');

function crc32(buffer) {
  let value = ~0;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (~value) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodeRgbaPng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)));
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fillRect(rgba, imageWidth, rect, color) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }
}

async function main() {
  if (typeof core.recognizeScreenshotUiBlocks !== 'function') {
    throw new Error('@guyantools/core missing recognizeScreenshotUiBlocks export');
  }

  const width = 360;
  const height = 220;
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = 245;
    rgba[offset + 1] = 247;
    rgba[offset + 2] = 250;
    rgba[offset + 3] = 255;
  }

  fillRect(rgba, width, { x: 0, y: 0, width: 360, height: 44 }, [32, 42, 58, 255]);
  fillRect(rgba, width, { x: 24, y: 66, width: 312, height: 124 }, [255, 255, 255, 255]);
  fillRect(rgba, width, { x: 44, y: 88, width: 170, height: 28 }, [248, 250, 252, 255]);
  fillRect(rgba, width, { x: 230, y: 88, width: 82, height: 28 }, [37, 99, 235, 255]);
  fillRect(rgba, width, { x: 44, y: 132, width: 268, height: 24 }, [241, 245, 249, 255]);
  fillRect(rgba, width, { x: 44, y: 160, width: 268, height: 24 }, [241, 245, 249, 255]);

  const raw = await core.recognizeScreenshotUiBlocks(
    encodeRgbaPng(width, height, rgba),
    JSON.stringify({
      minBlockWidth: 12,
      minBlockHeight: 10,
      mergeGap: 6,
      maxBlocks: 64,
    }),
  );
  const blocks = JSON.parse(raw);
  if (!Array.isArray(blocks)) {
    throw new Error('Native screenshot recognizer returned non-array JSON');
  }

  const kinds = new Set(blocks.map((block) => block.kind));
  const missing = ['navigation', 'card', 'input', 'button', 'list_item']
    .filter((kind) => !kinds.has(kind));
  if (missing.length) {
    throw new Error(`Native screenshot recognizer missing expected kinds: ${missing.join(', ')}`);
  }

  console.log(`[smoke-screenshot-recognition] OK ${blocks.length} blocks: ${[...kinds].join(', ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
