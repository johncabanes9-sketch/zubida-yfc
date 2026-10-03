/**
 * Reads an image's pixel dimensions from its header, as it will be DISPLAYED.
 *
 * Only the formats validateImage() admits (JPEG, PNG, WebP). A JPEG carrying an
 * EXIF orientation of 5–8 is stored on its side and shown rotated, so its width
 * and height are swapped here — a phone photo taken upright reads portrait.
 *
 * Returns null when no dimensions can be read; the caller rejects the upload
 * rather than guessing a size. Every read is bounds-checked, so a truncated or
 * hostile header yields null instead of reading past the buffer.
 */
export type ImageSize = { width: number; height: number };

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

const valid = (s: ImageSize): ImageSize | null => (s.width > 0 && s.height > 0 ? s : null);

function pngSize(b: Uint8Array): ImageSize | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  if (b.length < 24 || b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  return valid({ width: be32(b, 16), height: be32(b, 20) });
}

/**
 * EXIF orientation from an APP1 segment: null when the segment is not Exif
 * (an XMP packet also uses APP1, and often follows the Exif one), 1 when it is
 * Exif but carries no readable orientation.
 */
function exifOrientation(b: Uint8Array, start: number, end: number): number | null {
  // "Exif\0\0" then a TIFF header.
  if (end - start < 14 || b[start] !== 0x45 || b[start + 1] !== 0x78 || b[start + 2] !== 0x69 || b[start + 3] !== 0x66) return null;
  const t = start + 6;
  const little = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!little && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return 1;
  const u16 = (i: number) => (little ? le16(b, i) : be16(b, i));
  const u32 = (i: number) => (little ? (le16(b, i) | (le16(b, i + 2) << 16)) >>> 0 : be32(b, i));
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

function jpegSize(b: Uint8Array): ImageSize | null {
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan: no frame header found
    const len = be16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    if (marker === 0xe1) orientation = exifOrientation(b, i + 4, i + 2 + len) ?? orientation;
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (len < 7) return null;
      const height = be16(b, i + 5);
      const width = be16(b, i + 7);
      const sideways = orientation >= 5 && orientation <= 8;
      return valid(sideways ? { width: height, height: width } : { width, height });
    }
    i += 2 + len;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 16) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8 " && b.length >= 30) {
    // Frame tag (3) then the start code 9D 01 2A, then 14-bit width/height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return valid({ width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff });
  }
  if (chunk === "VP8L" && b.length >= 25) {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return valid({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
  }
  if (chunk === "VP8X" && b.length >= 30) {
    return valid({ width: le24(b, 24) + 1, height: le24(b, 27) + 1 });
  }
  return null;
}

export function imageSize(b: Uint8Array): ImageSize | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return pngSize(b);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpegSize(b);
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return webpSize(b);
  return null;
}
