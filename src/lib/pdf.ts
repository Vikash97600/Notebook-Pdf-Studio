import { extractOcrFromImage, type OcrPageResult } from "./ocr";
import { jsPDF } from "jspdf";
import {
  MARGIN_MM,
  QUALITY_LIMITS,
  pdfFileName,
  resolvePageMm,
  type PdfSettings,
  type QualityPreset,
  type TextAlignment,
} from "./pdf-meta";
import {
  computeImageRect,
  loadImageElement,
  pageNumberPositionPt,
  pageNumberText,
  renderProcessedImage,
  type PdfDrawImage,
  type PdfGenerationResult,
  type RenderOptions,
} from "./images";
import type { StudioImage } from "@/types/studio";

const INK = "#3B4A6B";
const MUTED = "#5A6478";

const PT_PER_MM = 72 / 25.4;

export interface GenerationStage {
  stage: "preparing" | "generating" | "finalizing";
  index: number;
  total: number;
  label: string;
}

function qualityLimit(q: QualityPreset): number | null {
  return QUALITY_LIMITS[q];
}

function drawText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  alignment: TextAlignment,
  size = 9,
  color = MUTED,
): void {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(color);
  pdf.text(text, x, y, { align: alignment, baseline: "alphabetic" });
}

/** Rasterise each workspace image (order preserved), then assemble the PDF. */
export async function generatePdfFromImages(
  images: StudioImage[],
  settings: PdfSettings,
  onStage: (stage: GenerationStage) => void,
): Promise<PdfGenerationResult> {
  if (images.length === 0) {
    throw new Error("Add at least one image before generating a PDF.");
  }

  const total = images.length;

  // Stage 1 — rasterise every image with its edits applied (and OCR if enabled).
  const rendered: PdfDrawImage[] = [];
  for (let i = 0; i < total; i++) {
    const item = images[i];
    onStage({
      stage: "preparing",
      index: i,
      total,
      label: `Preparing page ${i + 1} of ${total}…`,
    });
    // Yield to the event loop so progress UI can repaint between images.
    await new Promise((r) => setTimeout(r, 0));
    const el = await loadImageElement(item.file);
    const options: RenderOptions = {
      rotation: item.rotation,
      crop: item.crop,
      filters: item.filters,
      maxSide: qualityLimit(settings.quality),
      flipH: item.flipH,
      flipV: item.flipV,
    };
    const processed = renderProcessedImage(el, options);

    let ocr: OcrPageResult | null = item.ocrResult ?? null;
    if (settings.embedSearchableText && !ocr) {
      onStage({
        stage: "preparing",
        index: i,
        total,
        label: `Extracting searchable text on page ${i + 1} of ${total}…`,
      });
      try {
        ocr = await extractOcrFromImage(
          processed.dataUrl,
          settings.ocrLanguage || "eng",
        );
      } catch (err) {
        console.warn(`OCR skipped for page ${i + 1}`, err);
      }
    }

    rendered.push({
      dataUrl: processed.dataUrl,
      width: processed.width,
      height: processed.height,
      ocr,
    });
  }

  // Stage 2 — draw pages.
  onStage({
    stage: "generating",
    index: 0,
    total,
    label: "Generating PDF…",
  });
  const pdf = buildPdfDocument(rendered, settings);

  // Stage 3 — finalise.
  onStage({ stage: "finalizing", index: total, total, label: "Finalizing…" });

  const blob = pdf.output("blob");
  return {
    blob,
    pages: total,
    images: total,
    fileName: pdfFileName(settings),
    sizeBytes: blob.size,
  };
}

/** Build the jsPDF document from rendered page bitmaps and optional OCR text layer. */
function buildPdfDocument(
  rendered: PdfDrawImage[],
  settings: PdfSettings,
): jsPDF {
  const first = rendered[0];
  const firstMm = resolvePageMm(
    settings,
    first.width / Math.max(1, first.height),
  );
  const pdf = new jsPDF({
    orientation: firstMm.widthMm > firstMm.heightMm ? "landscape" : "portrait",
    unit: "pt",
    format: [firstMm.widthMm * PT_PER_MM, firstMm.heightMm * PT_PER_MM],
    compress: true,
  });

  rendered.forEach((image, index) => {
    const { widthMm, heightMm } = resolvePageMm(
      settings,
      image.width / Math.max(1, image.height),
    );
    if (index > 0) {
      pdf.addPage(
        [widthMm * PT_PER_MM, heightMm * PT_PER_MM],
        widthMm > heightMm ? "landscape" : "portrait",
      );
    }
    const pageWpt = widthMm * PT_PER_MM;
    const pageHpt = heightMm * PT_PER_MM;

    // Background fill first.
    const bg =
      settings.background === "white"
        ? "#FFFFFF"
        : settings.background === "black"
          ? "#000000"
          : settings.backgroundColor;
    pdf.setFillColor(bg);
    pdf.rect(0, 0, pageWpt, pageHpt, "F");

    // The image itself — rect is already in points and centered.
    const rect = computeImageRect(settings, image);
    try {
      pdf.addImage(
        image.dataUrl,
        "JPEG",
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        undefined,
        "FAST",
        0,
      );
    } catch (err) {
      console.error(`Failed to draw page ${index + 1}`, err);
    }

    // Embed invisible searchable text layer if OCR data exists.
    if (image.ocr && image.ocr.words && image.ocr.words.length > 0) {
      const scaleX = rect.w / Math.max(1, image.width);
      const scaleY = rect.h / Math.max(1, image.height);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);

      for (const word of image.ocr.words) {
        if (!word.text || !word.text.trim()) continue;
        const wx = rect.x + word.bbox.x0 * scaleX;
        const wy = rect.y + word.bbox.y1 * scaleY;
        const fontH = Math.max(4, (word.bbox.y1 - word.bbox.y0) * scaleY);
        pdf.setFontSize(fontH);
        try {
          pdf.text(word.text, wx, wy, {
            renderingMode: "invisible",
            baseline: "alphabetic",
          });
        } catch {
          /* ignore word render failure */
        }
      }
    }

    // Header / footer / page numbers sit inside the margin.
    const marginMm = MARGIN_MM[settings.margin];
    const margin = marginMm * PT_PER_MM;
    const headerBaseline = Math.max(16, margin * 0.9);
    const footerBaseline = pageHpt - Math.max(12, margin * 0.45);

    if (settings.headerText.trim()) {
      drawText(
        pdf,
        settings.headerText.trim(),
        headerFooterX(settings.headerAlignment, pageWpt, margin),
        headerBaseline,
        settings.headerAlignment,
        9,
        MUTED,
      );
    }
    if (settings.footerText.trim()) {
      drawText(
        pdf,
        settings.footerText.trim(),
        headerFooterX(settings.footerAlignment, pageWpt, margin),
        footerBaseline,
        settings.footerAlignment,
        9,
        MUTED,
      );
    }
    if (settings.pageNumbers) {
      const label = pageNumberText(
        settings.pageNumberFormat,
        index + 1,
        rendered.length,
      );
      const pos = pageNumberPositionPt(
        settings.pageNumberPosition,
        pageWpt,
        pageHpt,
        marginMm,
        0,
      );
      drawText(pdf, label, pos.x, pos.y, pos.align, 9, INK);
    }
  });

  applyMetadata(pdf, settings);
  return pdf;
}

function headerFooterX(
  alignment: TextAlignment,
  pageWpt: number,
  marginPt: number,
): number {
  const m = Math.max(marginPt, 6);
  if (alignment === "left") return m;
  if (alignment === "right") return pageWpt - m;
  return pageWpt / 2;
}

function applyMetadata(pdf: jsPDF, settings: PdfSettings): void {
  const props: Record<string, string> = {};
  if (settings.title.trim()) props.title = settings.title.trim();
  if (settings.author.trim()) props.author = settings.author.trim();
  if (settings.subject.trim()) props.subject = settings.subject.trim();
  if (settings.keywords.trim()) props.keywords = settings.keywords.trim();
  if (Object.keys(props).length > 0) {
    pdf.setProperties(props);
  }
}
