const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, getPixel) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const toCrc = Buffer.concat([typeBuf, data]);
    const crcVal = crc32(toCrc);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function drawIconPixel(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  const r = 0.22;
  const inRoundBox = (px, py, rx, ry, rw, rh, radius) => {
    let dx = Math.max(rx + radius - px, 0, px - (rx + rw - radius));
    let dy = Math.max(ry + radius - py, 0, py - (ry + rh - radius));
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  };

  const inCard = inRoundBox(nx, ny, 0.08, 0.12, 0.84, 0.80, r);
  if (!inCard) return [0, 0, 0, 0];

  const isHeader = ny < 0.36;
  if (isHeader) {
    const isRing1 = Math.abs(nx - 0.32) < 0.05 && ny < 0.22;
    const isRing2 = Math.abs(nx - 0.68) < 0.05 && ny < 0.22;
    if (isRing1 || isRing2) return [255, 255, 255, 255];
    return [255, 107, 139, 255];
  }

  const hx = (nx - 0.5) * 2.8;
  const hy = -(ny - 0.62) * 2.8;
  const heartEquation = Math.pow(hx * hx + hy * hy - 0.7, 3) - hx * hx * Math.pow(hy, 3);
  if (heartEquation <= 0) return [255, 128, 159, 255];

  return [255, 245, 248, 255];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const buf = createPNG(size, size, drawIconPixel);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`생성 완료: icon${size}.png (${size}x${size})`);
});
