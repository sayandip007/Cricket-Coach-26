import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Generates valid, standards-compliant PNG icons (192x192, 512x512, maskable 512x512, and 180x180 apple-touch-icon)
 * plus a crisp SVG vector icon in /public for Android PWA & APK packaging.
 */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createIconPng(size: number, maskable: boolean): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * (maskable ? 0.36 : 0.44);
  const innerPitchW = size * (maskable ? 0.09 : 0.11);
  const innerPitchH = size * (maskable ? 0.24 : 0.29);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Default dark stadium background (#070b13)
      let r = 7;
      let g = 11;
      let b = 19;

      if (dist <= maxR) {
        // Lush cricket turf circle with concentric mowing stripes
        const band = Math.floor((dist / maxR) * 5) % 2;
        r = band === 0 ? 36 : 29;
        g = band === 0 ? 112 : 95;
        b = band === 0 ? 62 : 52;

        // Gold boundary ring
        if (Math.abs(dist - maxR * 0.92) < size * 0.015) {
          r = 245;
          g = 184;
          b = 46;
        }

        // Center pitch strip (#cfb084)
        if (Math.abs(dx) <= innerPitchW / 2 && Math.abs(dy) <= innerPitchH / 2) {
          r = 207;
          g = 176;
          b = 132;

          // White popping creases
          if (Math.abs(Math.abs(dy) - innerPitchH * 0.34) < size * 0.01) {
            r = 248;
            g = 250;
            b = 252;
          }
        }

        // Crimson cricket ball badge at center-top of pitch
        const ballDist = Math.hypot(dx, dy + innerPitchH * 0.18);
        if (ballDist <= size * 0.048) {
          r = 245;
          g = 158;
          b = 11;
        }
      } else if (Math.abs(dist - maxR) < size * 0.022) {
        // Outer gold stadium rim
        r = 245;
        g = 184;
        b = 46;
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createIconPng(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createIconPng(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createIconPng(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createIconPng(180, false));

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#070b13"/>
  <circle cx="256" cy="256" r="210" fill="#24703e" stroke="#f5b82e" stroke-width="12"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="5" stroke-dasharray="14 10"/>
  <rect x="226" y="166" width="60" height="180" rx="8" fill="#cfb084" stroke="#a18359" stroke-width="4"/>
  <line x1="226" y1="196" x2="286" y2="196" stroke="#ffffff" stroke-width="4"/>
  <line x1="226" y1="316" x2="286" y2="316" stroke="#ffffff" stroke-width="4"/>
  <circle cx="256" cy="196" r="18" fill="#7c3aed" stroke="#f5b82e" stroke-width="5"/>
  <circle cx="256" cy="316" r="18" fill="#ef4444" stroke="#ffffff" stroke-width="4"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
console.log('Generated Android PWA & iOS icons in /public successfully.');
