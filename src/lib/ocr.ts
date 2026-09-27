import { createWorker, type Worker } from "tesseract.js";

export interface OcrBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBBox;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: OcrBBox;
  words: OcrWord[];
}

export interface OcrPageResult {
  text: string;
  confidence: number;
  lines: OcrLine[];
  words: OcrWord[];
}

export interface OcrLanguageOption {
  code: string;
  name: string;
}

export const OCR_LANGUAGES: OcrLanguageOption[] = [
  { code: "eng", name: "English" },
  { code: "spa", name: "Spanish" },
  { code: "fra", name: "French" },
  { code: "deu", name: "German" },
  { code: "hin", name: "Hindi" },
  { code: "chi_sim", name: "Chinese (Simplified)" },
  { code: "jpn", name: "Japanese" },
  { code: "por", name: "Portuguese" },
  { code: "ita", name: "Italian" },
  { code: "rus", name: "Russian" },
  { code: "ara", name: "Arabic" },
];

let cachedWorker: Worker | null = null;
let currentLanguage: string | null = null;
let workerInitPromise: Promise<Worker> | null = null;

/**
 * Get or initialize a singleton Tesseract Worker.
 */
export async function getOcrWorker(
  language = "eng",
  onProgress?: (progress: number, status: string) => void,
): Promise<Worker> {
  if (cachedWorker && currentLanguage === language) {
    return cachedWorker;
  }

  if (workerInitPromise && currentLanguage === language) {
    return workerInitPromise;
  }

  workerInitPromise = (async () => {
    if (cachedWorker) {
      try {
        await cachedWorker.terminate();
      } catch {
        /* ignore termination error */
      }
      cachedWorker = null;
    }

    const worker = await createWorker(language, 1, {
      logger: (m) => {
        if (onProgress && m.status) {
          const p = typeof m.progress === "number" ? Math.round(m.progress * 100) : 0;
          onProgress(p, m.status);
        }
      },
    });

    cachedWorker = worker;
    currentLanguage = language;
    return worker;
  })();

  const worker = await workerInitPromise;
  workerInitPromise = null;
  return worker;
}

/**
 * Extract text and bounding boxes from an image data URL, Blob, or Canvas.
 */
export async function extractOcrFromImage(
  imageSource: string | Blob | HTMLCanvasElement,
  language = "eng",
  onProgress?: (progress: number, status: string) => void,
): Promise<OcrPageResult> {
  const worker = await getOcrWorker(language, onProgress);
  const result = await worker.recognize(imageSource);
  const data = result.data;

  const lines: OcrLine[] = [];
  const words: OcrWord[] = [];

  if (data.blocks) {
    for (const block of data.blocks) {
      if (!block.paragraphs) continue;
      for (const para of block.paragraphs) {
        if (!para.lines) continue;
        for (const line of para.lines) {
          const lineWords: OcrWord[] = (line.words || []).map((word) => ({
            text: word.text.trim(),
            confidence: word.confidence,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            },
          }));

          lines.push({
            text: line.text.trim(),
            confidence: line.confidence,
            bbox: {
              x0: line.bbox.x0,
              y0: line.bbox.y0,
              x1: line.bbox.x1,
              y1: line.bbox.y1,
            },
            words: lineWords,
          });

          words.push(...lineWords);
        }
      }
    }
  }

  return {
    text: data.text.trim(),
    confidence: Math.round(data.confidence || 0),
    lines,
    words,
  };
}

/**
 * Cleanly format extracted text from all pages into a Markdown note file.
 */
export function formatPagesAsMarkdown(
  pages: { pageNumber: number; name: string; text: string }[],
  docTitle = "Notebook Notes",
): string {
  const timestamp = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# ${docTitle}\n\n`;
  md += `*Extracted on ${timestamp} via Notebook PDF Studio*\n\n---\n\n`;

  pages.forEach(({ pageNumber, name, text }) => {
    md += `## Page ${pageNumber}: ${name}\n\n`;
    if (text.trim()) {
      md += `${text.trim()}\n\n`;
    } else {
      md += `*(No readable text detected on this page)*\n\n`;
    }
    md += `---\n\n`;
  });

  return md;
}

/**
 * Cleanly format extracted text from all pages into plain text.
 */
export function formatPagesAsPlainText(
  pages: { pageNumber: number; name: string; text: string }[],
  docTitle = "Notebook Notes",
): string {
  let txt = `=== ${docTitle} ===\n\n`;
  pages.forEach(({ pageNumber, name, text }) => {
    txt += `--- Page ${pageNumber}: ${name} ---\n`;
    txt += text.trim() ? `${text.trim()}\n\n` : `(No text detected)\n\n`;
  });
  return txt;
}
