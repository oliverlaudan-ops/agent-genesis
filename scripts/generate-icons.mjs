#!/usr/bin/env node
/**
 * Generate PWA icons from scratch — no external assets, no design tool.
 *
 * Design: a single luminous node at the center, with two concentric rings
 * (orbit traces) and three small satellite nodes. Reads as "genesis" /
 * "agent swarm" at any size. Dark gradient background matching the app theme.
 *
 * Outputs:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png
 *   public/icons/apple-touch-icon.png
 *
 * Uses pure-JS PNG encoding (zlib + manual CRC). No native deps, no canvas.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// ---------- Bitmap helpers ----------
function makeBitmap(size) {
  return new Uint8ClampedArray(size * size * 4);
}
function blend(buf, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size || a === 0) return;
  const i = (y * size + x) * 4;
  const sa = a / 255;
  const inv = 1 - sa;
  buf[i] = Math.round(r * sa + buf[i] * inv);
  buf[i + 1] = Math.round(g * sa + buf[i + 1] * inv);
  buf[i + 2] = Math.round(b * sa + buf[i + 2] * inv);
  buf[i + 3] = Math.round(a + buf[i + 3] * inv);
}

// Disc with feathered edge, returns RGBA contribution. Used for "soft" shapes
// (rings, glow) where we want anti-aliased edges.
function paintDisc(buf, size, cx, cy, radius, r, g, b, intensity = 1) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // Soft edge: 1px feather inside the radius
      const a = Math.max(0, Math.min(1, radius - d + 0.5)) * intensity;
      if (a > 0) blend(buf, size, x, y, r, g, b, Math.round(a * 255));
    }
  }
}

// Ring: annulus between rIn and rOut, feathered on both sides.
function paintRing(buf, size, cx, cy, rIn, rOut, r, g, b) {
  const x0 = Math.max(0, Math.floor(cx - rOut - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + rOut + 1));
  const y0 = Math.max(0, Math.floor(cy - rOut - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + rOut + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < rIn - 0.5 || d > rOut + 0.5) continue;
      const aIn = Math.max(0, Math.min(1, d - rIn + 0.5));
      const aOut = Math.max(0, Math.min(1, rOut - d + 0.5));
      const a = Math.min(aIn, aOut);
      if (a > 0) blend(buf, size, x, y, r, g, b, Math.round(a * 255));
    }
  }
}

// Linear gradient on rows, dark blue → near-black.
function paintBackground(buf, size) {
  const bgTop = [27, 32, 48];   // #1b2030
  const bgBot = [11, 13, 18];   // #0b0d12
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(bgTop[0] + (bgBot[0] - bgTop[0]) * t);
    const g = Math.round(bgTop[1] + (bgBot[1] - bgTop[1]) * t);
    const b = Math.round(bgTop[2] + (bgBot[2] - bgTop[2]) * t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
}

// Subtle radial glow behind the central node, tinted with the accent.
function paintBackglow(buf, size, cx, cy, radius, r, g, b) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.max(0, 1 - d / radius);
      if (a > 0) blend(buf, size, x, y, r, g, b, Math.round(a * 50));
    }
  }
}

// Rounded-rect mask (alpha) for non-maskable icon. 22% corner radius — looks
// nice on iOS/Android launchers.
function roundedRectMask(size, radius) {
  const buf = new Float32Array(size * size);
  const cx0 = radius;
  const cy0 = radius;
  const cx1 = size - radius;
  const cy1 = size - radius;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ccx = x < cx0 ? cx0 : x > cx1 ? cx1 : x;
      const ccy = y < cy0 ? cy0 : y > cy1 ? cy1 : y;
      const dx = x - ccx;
      const dy = y - ccy;
      const d = Math.sqrt(dx * dx + dy * dy);
      buf[y * size + x] = Math.max(0, Math.min(1, radius - d + 0.5));
    }
  }
  return buf;
}

// ---------- PNG encoder ----------
const SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(buf) {
  const table = (crc32.table ||= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  ihdr[9] = 6;  ihdr[10] = 0;  ihdr[11] = 0;  ihdr[12] = 0;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Build the icon artwork ----------
const ACCENT = [76, 201, 240];   // var(--accent) #4cc9f0
const ACCENT_2 = [247, 37, 133]; // var(--accent-2) #f72585
const WHITE = [232, 238, 245];

function buildIcon(size, { maskable = false } = {}) {
  const rgba = makeBitmap(size);
  paintBackground(rgba, size);

  const cx = size / 2;
  const cy = size / 2;
  const unit = size / 64; // design grid: 64 logical units

  // Backglow under everything
  paintBackglow(rgba, size, cx, cy, 30 * unit, ACCENT[0], ACCENT[1], ACCENT[2]);

  // Inner ring (orbit trace) — accent color, subtle
  paintRing(rgba, size, cx, cy, 14.5 * unit, 15.5 * unit, ACCENT[0], ACCENT[1], ACCENT[2]);
  // Outer ring (orbit trace) — accent-2 / pink, dashed-feel via thinner stroke
  paintRing(rgba, size, cx, cy, 21 * unit, 21.6 * unit, ACCENT_2[0], ACCENT_2[1], ACCENT_2[2]);

  // Three satellite nodes on the inner ring at 12, 4, and 8 o'clock-ish
  // positions. 12 o'clock is white, 4 o'clock is accent, 8 o'clock is accent-2.
  // The slight asymmetry keeps it visually interesting at small sizes.
  const nodes = [
    { ang: -Math.PI / 2,         r: 3.2 * unit, color: WHITE,   glow: true  }, // top
    { ang: -Math.PI / 2 + 2.094, r: 2.4 * unit, color: ACCENT,  glow: true  }, // 4 o'clock
    { ang: -Math.PI / 2 - 2.094, r: 2.4 * unit, color: ACCENT_2,glow: true  }, // 8 o'clock
  ];
  for (const n of nodes) {
    const nx = cx + Math.cos(n.ang) * 15 * unit;
    const ny = cy + Math.sin(n.ang) * 15 * unit;
    if (n.glow) paintDisc(rgba, size, nx, ny, n.r * 1.8, n.color[0], n.color[1], n.color[2], 0.18);
    paintDisc(rgba, size, nx, ny, n.r, n.color[0], n.color[1], n.color[2], 1);
  }

  // Central node — biggest, brightest, the "genesis" core
  const coreR = 7 * unit;
  paintDisc(rgba, size, cx, cy, coreR * 1.6, WHITE[0], WHITE[1], WHITE[2], 0.22);
  paintDisc(rgba, size, cx, cy, coreR, WHITE[0], WHITE[1], WHITE[2], 1);
  // Inner highlight to give it dimension
  paintDisc(rgba, size, cx - coreR * 0.25, cy - coreR * 0.25, coreR * 0.5, 255, 255, 255, 0.6);

  if (!maskable) {
    // Apply rounded-square mask for non-maskable icon (launcher shape)
    const mask = roundedRectMask(size, Math.round(size * 0.22));
    for (let i = 0; i < size * size; i++) {
      const a = mask[i];
      if (a < 1) rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * a);
    }
  }
  // For maskable, leave full bleed — the OS will mask it.

  return encodePng(size, size, rgba);
}

// ---------- Emit ----------
const write = (name, buf) => {
  const p = join(OUT_DIR, name);
  writeFileSync(p, buf);
  console.log(`  ${p}  (${buf.length} bytes)`);
};

console.log('Generating icons…');
write('icon-192.png', buildIcon(192));
write('icon-512.png', buildIcon(512));
write('icon-maskable-512.png', buildIcon(512, { maskable: true }));
write('apple-touch-icon.png', buildIcon(180));
console.log('Done.');
