import { app, nativeImage, type NativeImage } from "electron";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

const TRAY_ICON_FILES = ["share-the-spire-32.png"];
const WINDOW_ICON_FILES = ["share-the-spire-64.png", "share-the-spire-32.png"];

/**
 * Resolve the tray icon to use.
 *
 * Prefers the bundled `images/share-the-spire-32.png`; falls back to a tiny
 * synthetic PNG generated at runtime so the tray still has *some* icon if
 * the asset goes missing.
 */
export function loadTrayIcon(): NativeImage {
  return loadIcon(TRAY_ICON_FILES);
}

/**
 * Resolve the window / taskbar icon. Prefers the larger 64px asset, then the
 * 32px one, then the synthetic fallback.
 */
export function loadWindowIcon(): NativeImage {
  return loadIcon(WINDOW_ICON_FILES);
}

function loadIcon(filenames: string[]): NativeImage {
  for (const filename of filenames) {
    for (const file of iconCandidatePaths(filename)) {
      if (existsSync(file)) {
        const img = nativeImage.createFromPath(file);
        if (!img.isEmpty()) return img;
      }
    }
  }
  return nativeImage.createFromBuffer(makeFallbackIconPng());
}

function iconCandidatePaths(filename: string): string[] {
  const candidates: string[] = [path.join(app.getAppPath(), "images", filename)];
  // `process.resourcesPath` is only populated when the app is packaged; skip
  // it in dev to avoid resolving to a stray relative `./images/...` path.
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "images", filename));
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Synthetic fallback PNG
//
// Builds a 32x32 RGBA PNG of a filled rounded square in the Spire-ish brand
// purple — small enough to assemble by hand: IHDR + IDAT + IEND chunks with
// a zlib-compressed scanline buffer.
// ---------------------------------------------------------------------------

const FALLBACK_SIZE = 32;
const FALLBACK_RADIUS = 6;
const FALLBACK_RGB: readonly [number, number, number] = [142, 84, 233];

function makeFallbackIconPng(): Buffer {
  const raw = buildScanlines(FALLBACK_SIZE, FALLBACK_RADIUS, FALLBACK_RGB);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(FALLBACK_SIZE, 0);
  ihdr.writeUInt32BE(FALLBACK_SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildScanlines(
  size: number,
  radius: number,
  rgb: readonly [number, number, number],
): Buffer {
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter byte: None
    for (let x = 0; x < size; x++) {
      const off = y * rowLen + 1 + x * 4;
      if (pointInRoundedSquare(x, y, size, radius)) {
        raw[off] = rgb[0];
        raw[off + 1] = rgb[1];
        raw[off + 2] = rgb[2];
        raw[off + 3] = 255;
      }
      // Pixels outside the rounded square stay zero (transparent).
    }
  }
  return raw;
}

function pointInRoundedSquare(
  x: number,
  y: number,
  size: number,
  radius: number,
): boolean {
  const r = Math.max(0, Math.min(radius, Math.floor(size / 2)));
  if (r === 0) return true;

  // Top-left corner.
  if (x < r && y < r) return inCircle(r - 1 - x, r - 1 - y, r);
  // Top-right corner.
  if (x >= size - r && y < r) return inCircle(x - (size - r), r - 1 - y, r);
  // Bottom-left corner.
  if (x < r && y >= size - r) return inCircle(r - 1 - x, y - (size - r), r);
  // Bottom-right corner.
  if (x >= size - r && y >= size - r) {
    return inCircle(x - (size - r), y - (size - r), r);
  }
  return true;
}

function inCircle(dx: number, dy: number, r: number): boolean {
  return dx * dx + dy * dy <= r * r;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const CRC_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = (CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}
