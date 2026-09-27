import type { OcrPageResult } from "./ocr";
import {
  MM_PER_PT,
  MARGIN_MM,
  resolvePageMm,
  type PageNumberFormat,
  type PageNumberPosition,
  type PdfSettings,
  type TextAlignment,
} from "./pdf-meta";

export interface ProcessedImageResult {
  /** Canvas-derived JPEG data URL at processed resolution. */
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfGenerationResult {
  blob: Blob;
  pages: number;
  images: number;
  fileName: string;
  sizeBytes: number;
}

export interface PdfDrawImage {
  dataUrl: string;
  /** Pixel dimensions of the (already rotated/cropped/filtered) bitmap. */
  width: number;
  height: number;
  ocr?: OcrPageResult | null;
}

/** Styles applied to one image via the editor. */
export interface ImageFilters {
  brightness: number; // 100 = neutral
  contrast: number;
  saturation: number;
  grayscale: boolean;
  blur: number; // px
  sharpen: number; // 0 = off
}

export const NEUTRAL_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: false,
  blur: 0,
  sharpen: 0,
};

export function isNeutralFilters(f: ImageFilters): boolean {
  return (
    f.brightness === NEUTRAL_FILTERS.brightness &&
    f.contrast === NEUTRAL_FILTERS.contrast &&
    f.saturation === NEUTRAL_FILTERS.saturation &&
    !f.grayscale &&
    f.blur === 0 &&
    f.sharpen === 0
  );
}

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

export const ACCEPTED_EXTENSIONS = "JPG, JPEG, PNG, WEBP, GIF, BMP";

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per image

/** Classify an incoming file before any decode attempt. */
export function validateImageFile(file: File): string | null {
  const isKnownType = ACCEPTED_TYPES.has(file.type);
  const looksImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
  if (!isKnownType && !looksImage) {
    return `This file format isn't supported. Use ${ACCEPTED_EXTENSIONS}.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return "This image is too large to process efficiently. Try a smaller image (max 25 MB).";
  }
  return null;
}

export function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("We couldn't read this image — the file may be corrupted."));
    };
    img.src = url;
  });
}

/**
 * Hard cap for canvas bitmaps. Safari/iOS silently fails (blank or black
 * canvas) above roughly 4096px per side, so every render must respect this.
 */
export const MAX_TEXTURE_SIDE = 4096;

const JPEG_QUALITY = 0.92;
const THUMBNAIL_QUALITY = 0.75;

/**
 * Create a canvas with a white base coat. Pages are encoded as JPEG, which
 * has no alpha channel — without this, transparent PNGs turn black.
 */
function createCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, ctx: null };
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

function encodeJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
  failureMessage: string,
): ProcessedImageResult {
  try {
    return {
      dataUrl: canvas.toDataURL("image/jpeg", quality),
      width: canvas.width,
      height: canvas.height,
    };
  } catch (err) {
    console.error("Canvas export failed", err);
    throw new Error(failureMessage);
  }
}

/** Make a fitting thumbnail data URL for grid display. */
export function createThumbnail(source: HTMLImageElement, maxSide = 320): string {
  const sw = source.naturalWidth;
  const sh = source.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const { canvas, ctx } = createCanvas(w, h);
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, w, h);
  try {
    return canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
  } catch {
    return "";
  }
}

export interface RenderOptions {
  rotation: number; // degrees, multiples of 90
  crop: { x: number; y: number; w: number; h: number } | null; // 0..1 fractions
  filters: ImageFilters;
  maxSide: number | null; // cap for longest edge (quality preset)
  flipH?: boolean;
  flipV?: boolean;
}

/**
 * Apply rotation, flip, crop and filters to an image element and return a
 * JPEG data URL. The source bitmap is drawn at full resolution into a
 * rotated context, then the whole context is scaled to the (possibly capped)
 * output size — so the result fills the canvas exactly for all four angles.
 */
export function renderProcessedImage(
  img: HTMLImageElement,
  opts: RenderOptions,
): ProcessedImageResult {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const crop = opts.crop
    ? {
        x: Math.min(Math.max(opts.crop.x, 0), 0.99),
        y: Math.min(Math.max(opts.crop.y, 0), 0.99),
        w: Math.min(Math.max(opts.crop.w, 0.01), 1),
        h: Math.min(Math.max(opts.crop.h, 0.01), 1),
      }
    : { x: 0, y: 0, w: 1, h: 1 };

  const sx = Math.round(crop.x * iw);
  const sy = Math.round(crop.y * ih);
  const sw = Math.max(1, Math.round(crop.w * iw));
  const sh = Math.max(1, Math.round(crop.h * ih));

  const quarter = ((((opts.rotation % 360) + 360) % 360) / 90) % 4;
  const swap = quarter === 1 || quarter === 3;

  // Output dimensions at full resolution for the chosen rotation.
  const fullW = swap ? sh : sw;
  const fullH = swap ? sw : sh;

  // Quality preset cap + hard browser cap.
  const cap = Math.min(opts.maxSide ?? MAX_TEXTURE_SIDE, MAX_TEXTURE_SIDE);
  const scale = Math.min(1, cap / Math.max(fullW, fullH));
  const dw = Math.max(1, Math.round(fullW * scale));
  const dh = Math.max(1, Math.round(fullH * scale));

  const { canvas, ctx } = createCanvas(dw, dh);
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  ctx.save();
  ctx.scale(dw / fullW, dh / fullH);
  ctx.translate(fullW / 2, fullH / 2);
  // Flip is applied in the output frame (after rotation), so "Flip H" always
  // mirrors what you currently see on screen.
  ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
  ctx.rotate((quarter * 90 * Math.PI) / 180);
  ctx.filter = buildFilterString(opts.filters);
  ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  if (opts.filters.sharpen > 0) {
    applySharpen(canvas, ctx, opts.filters.sharpen);
  }

  return encodeJpeg(
    canvas,
    JPEG_QUALITY,
    "This image is too large to process on this device. Try a lower image quality setting.",
  );
}

function buildFilterString(f: ImageFilters): string {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.grayscale) parts.push("grayscale(1)");
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  return parts.join(" ") || "none";
}

/** Convolution sharpen pass on the canvas contents (amount 0..100). */
function applySharpen(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, amount: number): void {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 3 || h < 3) return;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const d = out.data;
  const a = amount / 100;
  const center = 1 + 4 * a;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v =
          center * s[i + c] -
          a * s[i - 4 + c] -
          a * s[i + 4 + c] -
          a * s[i - w * 4 + c] -
          a * s[i + w * 4 + c];
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      d[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

/* ------------------------- PDF assembly helpers ------------------------- */

/** Millimetres → PDF points (jsPDF runs in pt units here). */
export function mmToPt(mm: number): number {
  return mm / MM_PER_PT;
}

/**
 * Compute the draw rectangle for an image on its page, in POINTS, honouring
 * the fit mode. Every branch returns a rect centered on the page.
 */
export function computeImageRect(
  settings: PdfSettings,
  image: PdfDrawImage,
): { x: number; y: number; w: number; h: number } {
  const { widthMm, heightMm } = resolvePageMm(
    settings,
    image.width / Math.max(1, image.height),
  );
  const pageW = mmToPt(widthMm);
  const pageH = mmToPt(heightMm);
  // "original" mode ignores margins; every other mode respects them.
  const marginMm = settings.fit === "original" ? 0 : MARGIN_MM[settings.margin];
  const margin = mmToPt(marginMm);
  const availW = Math.max(1, pageW - 2 * margin);
  const availH = Math.max(1, pageH - 2 * margin);

  if (settings.fit === "fitToPage") {
    // Stretch to exactly the printable area (explicit user choice).
    return { x: margin, y: margin, w: availW, h: availH };
  }

  if (settings.fit === "original") {
    // 1 image px ≈ 1 pt, scaled down only if it would overflow the page.
    const scale = Math.min(1, pageW / image.width, pageH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
  }

  if (settings.fit === "cover") {
    // Fill the page and crop the overflow: draw larger than the printable
    // area, centered — viewers clip anything outside the page bounds.
    const scale = Math.max(availW / image.width, availH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
  }

  // contain — whole image inside the printable area, centered.
  const scale = Math.min(availW / image.width, availH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

export function pageNumberText(
  format: PageNumberFormat,
  page: number,
  total: number,
): string {
  switch (format) {
    case "n":
      return `${page}`;
    case "page-n":
      return `Page ${page}`;
    case "n-total":
      return `${page} / ${total}`;
    case "page-n-of-total":
      return `Page ${page} of ${total}`;
  }
}

export function pageNumberPositionPt(
  position: PageNumberPosition,
  pageWpt: number,
  pageHpt: number,
  marginMm: number,
  textWpt: number,
): { x: number; y: number; align: "left" | "center" | "right" } {
  const m = mmToPt(marginMm);
  const y = pageHpt - Math.max(10, m * 0.6);
  const align: "left" | "center" | "right" =
    position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
  const x =
    align === "left"
      ? m
      : align === "right"
        ? pageWpt - m
        : pageWpt / 2;
  void textWpt;
  return { x, y, align };
}
