/**
 * Document Scanner & CamScanner-style Magic Filters
 * - Perspective Quad Warp (Homography with Bilinear Interpolation)
 * - Auto-detect Document Corners
 * - Magic Color Enhancement (Notebook paper whitening & ink boost)
 * - Adaptive B&W Thresholding (Crisp monochrome document)
 * - Shadow & Glare Removal (Illumination leveling / background division)
 */

export interface Point {
  x: number; // 0..1 fraction
  y: number; // 0..1 fraction
}

export interface PerspectiveQuad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type ScanFilterMode = "none" | "magic-color" | "bw-threshold" | "shadow-remove";

export const DEFAULT_QUAD: PerspectiveQuad = {
  tl: { x: 0, y: 0 },
  tr: { x: 1, y: 0 },
  br: { x: 1, y: 1 },
  bl: { x: 0, y: 1 },
};

export function isDefaultQuad(q: PerspectiveQuad | null | undefined): boolean {
  if (!q) return true;
  const eps = 0.005;
  return (
    Math.abs(q.tl.x) < eps &&
    Math.abs(q.tl.y) < eps &&
    Math.abs(q.tr.x - 1) < eps &&
    Math.abs(q.tr.y) < eps &&
    Math.abs(q.br.x - 1) < eps &&
    Math.abs(q.br.y - 1) < eps &&
    Math.abs(q.bl.x) < eps &&
    Math.abs(q.bl.y - 1) < eps
  );
}

/**
 * Solve a 3x3 homography matrix mapping (x_i, y_i) to (u_i, v_i) for 4 points.
 */
function getPerspectiveTransform(
  src: [number, number][],
  dst: [number, number][],
): number[] {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  // Gaussian elimination to solve 8x8 linear system
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) {
        maxRow = k;
      }
    }
    const tmpA = a[i];
    a[i] = a[maxRow];
    a[maxRow] = tmpA;
    const tmpB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tmpB;

    const pivot = a[i][i];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let j = i; j < n; j++) a[i][j] /= pivot;
    b[i] /= pivot;

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = a[k][i];
      for (let j = i; j < n; j++) {
        a[k][j] -= factor * a[i][j];
      }
      b[k] -= factor * b[i];
    }
  }

  return [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1];
}

/**
 * Invert a 3x3 matrix.
 */
function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, k] = m;
  const det =
    a * (e * k - f * h) -
    b * (d * k - f * g) +
    c * (d * h - e * g);

  if (Math.abs(det) < 1e-12) return m;
  const invDet = 1 / det;

  return [
    (e * k - f * h) * invDet,
    (c * h - b * k) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * k) * invDet,
    (a * k - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (g * b - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

/**
 * Perspective warp a canvas based on a 4-point quadrilateral using bilinear sampling.
 */
export function warpPerspectiveCanvas(
  sourceCanvas: HTMLCanvasElement,
  quad: PerspectiveQuad,
  targetWidth?: number,
  targetHeight?: number,
): HTMLCanvasElement {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  const srcPts: [number, number][] = [
    [quad.tl.x * sw, quad.tl.y * sh],
    [quad.tr.x * sw, quad.tr.y * sh],
    [quad.br.x * sw, quad.br.y * sh],
    [quad.bl.x * sw, quad.bl.y * sh],
  ];

  // Calculate target dimensions from quad edges
  const widthTop = Math.hypot(srcPts[1][0] - srcPts[0][0], srcPts[1][1] - srcPts[0][1]);
  const widthBottom = Math.hypot(srcPts[2][0] - srcPts[3][0], srcPts[2][1] - srcPts[3][1]);
  const heightLeft = Math.hypot(srcPts[3][0] - srcPts[0][0], srcPts[3][1] - srcPts[0][1]);
  const heightRight = Math.hypot(srcPts[2][0] - srcPts[1][0], srcPts[2][1] - srcPts[1][1]);

  const dw = Math.max(10, Math.round(targetWidth ?? Math.max(widthTop, widthBottom)));
  const dh = Math.max(10, Math.round(targetHeight ?? Math.max(heightLeft, heightRight)));

  const dstPts: [number, number][] = [
    [0, 0],
    [dw, 0],
    [dw, dh],
    [0, dh],
  ];

  // We want to map dst pixels (u, v) back to src (x, y)
  const H = getPerspectiveTransform(srcPts, dstPts);
  const Hinv = invert3x3(H);

  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) return sourceCanvas;

  const srcData = srcCtx.getImageData(0, 0, sw, sh);
  const srcPixels = srcData.data;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = dw;
  outCanvas.height = dh;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return sourceCanvas;

  const outData = outCtx.createImageData(dw, dh);
  const outPixels = outData.data;

  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = Hinv;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const z = h6 * x + h7 * y + h8;
      const invZ = 1 / z;
      const sx = (h0 * x + h1 * y + h2) * invZ;
      const sy = (h3 * x + h4 * y + h5) * invZ;

      const outIdx = (y * dw + x) * 4;

      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) {
        // Out of bounds - fill white
        outPixels[outIdx] = 255;
        outPixels[outIdx + 1] = 255;
        outPixels[outIdx + 2] = 255;
        outPixels[outIdx + 3] = 255;
        continue;
      }

      // Bilinear interpolation
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const dx = sx - x0;
      const dy = sy - y0;
      const dx1 = 1 - dx;
      const dy1 = 1 - dy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      for (let c = 0; c < 3; c++) {
        const val =
          dx1 * dy1 * srcPixels[i00 + c] +
          dx * dy1 * srcPixels[i10 + c] +
          dx1 * dy * srcPixels[i01 + c] +
          dx * dy * srcPixels[i11 + c];
        outPixels[outIdx + c] = Math.min(255, Math.max(0, Math.round(val)));
      }
      outPixels[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

/**
 * Auto-detect corners of a document page in an image.
 */
export function autoDetectDocumentCorners(
  canvas: HTMLCanvasElement,
): PerspectiveQuad {
  const w = canvas.width;
  const h = canvas.height;

  // Downsample to fast detection grid
  const maxDim = 300;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const sw = Math.max(20, Math.round(w * scale));
  const sh = Math.max(20, Math.round(h * scale));

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = sw;
  tmpCanvas.height = sh;
  const tmpCtx = tmpCanvas.getContext("2d", { willReadFrequently: true });
  if (!tmpCtx) return { ...DEFAULT_QUAD };

  tmpCtx.drawImage(canvas, 0, 0, sw, sh);
  const imgData = tmpCtx.getImageData(0, 0, sw, sh);
  const pixels = imgData.data;

  // Grayscale & luminance calculation
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < gray.length; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Sobel edge gradient magnitude
  const edges = new Float32Array(sw * sh);
  let maxGrad = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;
      const gx =
        -gray[idx - sw - 1] +
        gray[idx - sw + 1] -
        2 * gray[idx - 1] +
        2 * gray[idx + 1] -
        gray[idx + sw - 1] +
        gray[idx + sw + 1];

      const gy =
        -gray[idx - sw - 1] -
        2 * gray[idx - sw] -
        gray[idx - sw + 1] +
        gray[idx + sw - 1] +
        2 * gray[idx + sw] +
        gray[idx + sw + 1];

      const mag = Math.hypot(gx, gy);
      edges[idx] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }

  // Find candidate corner points by scanning from the 4 corners towards center
  const threshold = maxGrad * 0.25;

  function findCorner(
    startX: number,
    startY: number,
    dx: number,
    dy: number,
    limit: number,
  ): Point {
    for (let step = 0; step < limit; step++) {
      const cx = Math.round(startX + dx * step);
      const cy = Math.round(startY + dy * step);
      if (cx >= 0 && cx < sw && cy >= 0 && cy < sh) {
        if (edges[cy * sw + cx] > threshold) {
          return { x: cx / sw, y: cy / sh };
        }
      }
    }
    return { x: startX / sw, y: startY / sh };
  }

  const diagLimit = Math.min(sw, sh) * 0.4;
  const tl = findCorner(0, 0, 1, 1, diagLimit);
  const tr = findCorner(sw - 1, 0, -1, 1, diagLimit);
  const br = findCorner(sw - 1, sh - 1, -1, -1, diagLimit);
  const bl = findCorner(0, sh - 1, 1, -1, diagLimit);

  // Fallback to small 3% inset if detected corners are at the absolute borders
  const inset = 0.03;
  return {
    tl: { x: Math.max(inset, tl.x), y: Math.max(inset, tl.y) },
    tr: { x: Math.min(1 - inset, tr.x), y: Math.max(inset, tr.y) },
    br: { x: Math.min(1 - inset, br.x), y: Math.min(1 - inset, br.y) },
    bl: { x: Math.max(inset, bl.x), y: Math.min(1 - inset, bl.y) },
  };
}

/**
 * CamScanner-style Magic Color filter:
 * Whitens notebook background, removes yellow cast, boosts ink vibrancy & contrast.
 */
export function applyMagicColorFilter(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Calculate luminance statistics to adaptively map paper background
  let sumL = 0;
  let minL = 255;
  let maxL = 0;
  const len = data.length;

  for (let i = 0; i < len; i += 16) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sumL += l;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }

  const avgL = sumL / (len / 16);
  // Paper white point threshold
  const whitePoint = Math.min(245, Math.max(170, avgL + 25));
  const blackPoint = Math.max(10, minL + 15);

  const range = Math.max(1, whitePoint - blackPoint);

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Compute luminance
    const l = 0.299 * r + 0.587 * g + 0.114 * b;

    if (l >= whitePoint) {
      // Whiten background
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else {
      // Dynamic contrast stretch & slight color preservation for ink/highlighter
      const stretched = Math.min(255, Math.max(0, ((l - blackPoint) / range) * 255));
      const factor = (stretched / Math.max(1, l)) * 1.08;

      data[i] = Math.min(255, Math.max(0, Math.round(r * factor)));
      data[i + 1] = Math.min(255, Math.max(0, Math.round(g * factor)));
      data[i + 2] = Math.min(255, Math.max(0, Math.round(b * factor)));
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Adaptive B&W Thresholding filter:
 * Converts document into clean binary black & white for pencil/pen notes.
 */
export function applyBwThresholdFilter(
  canvas: HTMLCanvasElement,
  thresholdOffset = 0,
): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Local adaptive thresholding via integral image / local mean
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
    );
  }

  // Integral image for fast box blur
  const integral = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      sum += gray[y * w + x];
      integral[y * w + x] = sum + (y > 0 ? integral[(y - 1) * w + x] : 0);
    }
  }

  const s = Math.max(5, Math.round(w / 16));
  const s2 = Math.floor(s / 2);
  const c = 7 + thresholdOffset; // threshold bias

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s2);
    const y2 = Math.min(h - 1, y + s2);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s2);
      const x2 = Math.min(w - 1, x + s2);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum =
        integral[y2 * w + x2] -
        (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0) -
        (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0) +
        (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);

      const mean = sum / count;
      const idx = (y * w + x) * 4;
      const pixelVal = gray[y * w + x] < mean - c ? 0 : 255;

      data[idx] = pixelVal;
      data[idx + 1] = pixelVal;
      data[idx + 2] = pixelVal;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Shadow & Glare Removal filter:
 * Equalizes uneven mobile illumination and removes phone/hand shadows.
 */
export function applyShadowRemovalFilter(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Background illumination estimation by heavy downsampling & low-pass filtering
  const lowW = Math.max(16, Math.round(w / 20));
  const lowH = Math.max(16, Math.round(h / 20));

  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = lowW;
  bgCanvas.height = lowH;
  const bgCtx = bgCanvas.getContext("2d");
  if (!bgCtx) return;

  bgCtx.drawImage(canvas, 0, 0, lowW, lowH);

  // Create full-scale smooth illumination map
  const smoothCanvas = document.createElement("canvas");
  smoothCanvas.width = w;
  smoothCanvas.height = h;
  const smoothCtx = smoothCanvas.getContext("2d", { willReadFrequently: true });
  if (!smoothCtx) return;

  smoothCtx.imageSmoothingEnabled = true;
  smoothCtx.drawImage(bgCanvas, 0, 0, w, h);
  const bgData = smoothCtx.getImageData(0, 0, w, h).data;

  // Divide original by background illumination
  for (let i = 0; i < data.length; i += 4) {
    const bgR = Math.max(30, bgData[i]);
    const bgG = Math.max(30, bgData[i + 1]);
    const bgB = Math.max(30, bgData[i + 2]);

    const newR = Math.min(255, (data[i] / bgR) * 235);
    const newG = Math.min(255, (data[i + 1] / bgG) * 235);
    const newB = Math.min(255, (data[i + 2] / bgB) * 235);

    data[i] = Math.round(newR);
    data[i + 1] = Math.round(newG);
    data[i + 2] = Math.round(newB);
  }

  ctx.putImageData(imgData, 0, 0);
}
