/**
 * Minimal, dependency-free PNG codec (8-bit greyscale, RGB, RGBA, palette; non-interlaced) and a
 * lossless optimizing encoder. Pure functions over Node's zlib; used by the capture (to optimize the
 * Roboto baselines) and by the parity spec (to decode both sides).
 */
import zlib from 'node:zlib';

export interface RGBAImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf: Uint8Array): RGBAImage {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (!b.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let off = 8;
  let width = 0,
    height = 0,
    bitDepth = 0,
    colorType = 0,
    interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('latin1', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace) throw new Error('interlaced PNG not supported');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const up = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (a + up) >> 1;
      else if (filter === 4) v += paeth(a, up, c);
      out[x] = v & 0xff;
    }
    prev = out;
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    const s = i * channels;
    if (colorType === 6) {
      rgba[o] = pixels[s];
      rgba[o + 1] = pixels[s + 1];
      rgba[o + 2] = pixels[s + 2];
      rgba[o + 3] = pixels[s + 3];
    } else if (colorType === 2) {
      rgba[o] = pixels[s];
      rgba[o + 1] = pixels[s + 1];
      rgba[o + 2] = pixels[s + 2];
      rgba[o + 3] = 255;
    } else if (colorType === 0) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[s];
      rgba[o + 3] = 255;
    } else if (colorType === 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[s];
      rgba[o + 3] = pixels[s + 1];
    } else {
      const p = pixels[s];
      rgba[o] = palette![p * 3];
      rgba[o + 1] = palette![p * 3 + 1];
      rgba[o + 2] = palette![p * 3 + 2];
      rgba[o + 3] = trns && p < trns.length ? trns[p] : 255;
    }
  }
  return { width, height, data: rgba };
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Lossless optimizing encoder: drops the alpha channel when every pixel is opaque, picks the
 * filter per row by the minimum-sum-of-absolute-differences heuristic, deflates at level 9.
 */
export function encodePng(img: RGBAImage): Buffer {
  const { width, height, data } = img;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let i = 0, n = width * height; i < n; i++) {
    rows[i * channels] = data[i * 4];
    rows[i * channels + 1] = data[i * 4 + 1];
    rows[i * channels + 2] = data[i * 4 + 2];
    if (channels === 4) rows[i * channels + 3] = data[i * 4 + 3];
  }
  const out = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const line = rows.subarray(y * stride, (y + 1) * stride);
    let best = 0,
      bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? line[x - channels] : 0;
        const up = prev[x];
        const cc = x >= channels ? prev[x - channels] : 0;
        let v = line[x];
        if (f === 1) v -= a;
        else if (f === 2) v -= up;
        else if (f === 3) v -= (a + up) >> 1;
        else if (f === 4) v -= paeth(a, up, cc);
        v &= 0xff;
        c[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    out[y * (stride + 1)] = best;
    out.set(cand[best], y * (stride + 1) + 1);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(out, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
}

/** True when both images have the same size and identical RGBA pixels. */
export function samePixels(a: RGBAImage, b: RGBAImage): boolean {
  return a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));
}
