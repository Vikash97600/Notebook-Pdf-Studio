/** PDF page size tables, quality presets and filename helpers. */

export type PageSizeName = "A4" | "A3" | "A5" | "Letter" | "Legal" | "Custom";

/** Custom page dimensions in millimetres (0 disables Custom). */
export interface CustomPageSize {
  widthMm: number;
  heightMm: number;
}

export type Orientation = "portrait" | "landscape" | "auto";

export type MarginSize = "none" | "small" | "medium" | "large";

export type ImageFit = "contain" | "cover" | "original" | "fitToPage";

export type QualityPreset = "low" | "medium" | "high" | "maximum";

export type BackgroundChoice = "white" | "black" | "custom";

export type PageNumberPosition =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PageNumberFormat =
  | "n"
  | "page-n"
  | "n-total"
  | "page-n-of-total";

export type TextAlignment = "left" | "center" | "right";

export interface PdfSettings {
  pageSize: PageSizeName;
  customSize: CustomPageSize;
  orientation: Orientation;
  margin: MarginSize;
  fit: ImageFit;
  quality: QualityPreset;
  background: BackgroundChoice;
  backgroundColor: string;
  pageNumbers: boolean;
  pageNumberPosition: PageNumberPosition;
  pageNumberFormat: PageNumberFormat;
  headerText: string;
  headerAlignment: TextAlignment;
  footerText: string;
  footerAlignment: TextAlignment;
  title: string;
  author: string;
  subject: string;
  keywords: string;
  fileName: string;
  embedSearchableText: boolean;
  ocrLanguage: string;
}

export const PDF_SETTINGS_VERSION = 2;

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  pageSize: "A4",
  customSize: { widthMm: 210, heightMm: 297 },
  orientation: "auto",
  margin: "medium",
  fit: "contain",
  quality: "high",
  background: "white",
  backgroundColor: "#F6F1E6",
  pageNumbers: false,
  pageNumberPosition: "bottom-center",
  pageNumberFormat: "page-n-of-total",
  headerText: "",
  headerAlignment: "center",
  footerText: "",
  footerAlignment: "center",
  title: "",
  author: "",
  subject: "",
  keywords: "",
  fileName: "notebook-to-pdf",
  embedSearchableText: false,
  ocrLanguage: "eng",
};

/** Page sizes in millimetres, portrait. */
export const PAGE_SIZES_MM: Record<Exclude<PageSizeName, "Custom">, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export const MM_PER_PT = 25.4 / 72;

export const MARGIN_MM: Record<MarginSize, number> = {
  none: 0,
  small: 6,
  medium: 12,
  large: 24,
};

/** Max pixel dimension an image is rasterised to, per quality preset. */
export const QUALITY_LIMITS: Record<QualityPreset, number | null> = {
  low: 1200,
  medium: 2200,
  high: 3000,
  maximum: null,
};

export const QUALITY_DESCRIPTIONS: Record<QualityPreset, string> = {
  low: "Smallest PDF — quick to share",
  medium: "Balanced size and clarity",
  high: "Sharp for reading and printing",
  maximum: "Full original resolution",
};

export const FIT_DESCRIPTIONS: Record<ImageFit, string> = {
  contain: "Whole image on the page",
  cover: "Fill the page, crop overflow",
  original: "Keep the image's own size",
  fitToPage: "Stretch to the printable area",
};

export function resolvePageMm(settings: PdfSettings, imageAspect: number | null): {
  widthMm: number;
  heightMm: number;
} {
  let w: number;
  let h: number;
  if (settings.pageSize === "Custom") {
    w = Math.max(10, settings.customSize.widthMm);
    h = Math.max(10, settings.customSize.heightMm);
  } else {
    [w, h] = PAGE_SIZES_MM[settings.pageSize];
  }

  const aspect = imageAspect ?? null;
  let landscape =
    settings.orientation === "landscape" ||
    (settings.orientation === "auto" && aspect !== null && aspect > 1);
  if (settings.orientation === "auto" && aspect === null) {
    landscape = false;
  }
  return landscape ? { widthMm: h, heightMm: w } : { widthMm: w, heightMm: h };
}

/** Remove filesystem-hostile characters and normalise; empty falls back to default. */
export function sanitizeFileName(raw: string, fallback = "notebook-to-pdf"): string {
  const cleaned = (raw || "")
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  const base = cleaned.replace(/\.pdf$/i, "").trim() || fallback;
  return base;
}

export function pdfFileName(settings: PdfSettings): string {
  return `${sanitizeFileName(settings.fileName, DEFAULT_PDF_SETTINGS.fileName)}.pdf`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function qualityLabel(q: QualityPreset): string {
  return q.charAt(0).toUpperCase() + q.slice(1);
}
