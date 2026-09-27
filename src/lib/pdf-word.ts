/**
 * PDF <-> Word (.docx) Conversion Engine (100% Client-Side)
 * - PDF to Word: Intelligent layout reconstruction (2-column entries, tab stops, section headings, bullets, links, styles)
 * - Word to PDF: High-fidelity sandboxed rendering via docx-preview & html2canvas in isolated iframe
 * - PDF Page Extractor: High-res page images for Studio workspace
 */

import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  AlignmentType,
  ImageRun,
  TabStopType,
  TabStopPosition,
} from "docx";
import { renderAsync } from "docx-preview";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { extractOcrFromImage } from "./ocr";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ConversionProgress {
  percent: number;
  status: string;
}

export interface PdfToWordResult {
  docxBlob: Blob;
  fileName: string;
  pageCount: number;
  extractedText: string;
  pages: { pageNumber: number; text: string }[];
}

export interface WordToPdfResult {
  pdfBlob: Blob;
  fileName: string;
  pageCount: number;
  htmlPreviewElement?: HTMLElement;
}

interface TextItemObj {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

interface LineItem {
  items: TextItemObj[];
  text: string;
  y: number;
  height: number;
  minX: number;
  maxX: number;
  leftText?: string;
  rightText?: string;
  isCentered?: boolean;
  isSectionHeading?: boolean;
  isBullet?: boolean;
  bulletLevel?: number;
  isLargeName?: boolean;
  isBlankLine?: boolean;
}

/**
 * Format a text string into styled TextRuns:
 * - Detects bold labels before colons (e.g., "Languages:", "Frameworks:")
 * - Detects links, emails, and action badges (e.g., "LINK", "CERTIFICATE", "http...")
 * - Applies custom bold / font size overrides
 */
function formatTextToRuns(
  text: string,
  options?: {
    bold?: boolean;
    size?: number; // half-points (24 = 12pt)
    font?: string;
    isName?: boolean;
  },
): TextRun[] {
  const font = options?.font || "Calibri";
  const defaultSize = options?.size || (options?.isName ? 32 : 22); // 16pt for name, 11pt body

  if (!text) {
    return [new TextRun({ text: "", font, size: defaultSize })];
  }

  // If it's the main user name header
  if (options?.isName) {
    return [
      new TextRun({
        text,
        bold: true,
        font,
        size: defaultSize,
        color: "111827",
      }),
    ];
  }

  const runs: TextRun[] = [];

  // Check if line has a bold prefix before a colon (e.g. "• Languages: Python, SQL...")
  const colonMatch = text.match(/^([^:]+:)(\s+.*)?$/);
  if (colonMatch && (options?.bold === undefined || !options.bold)) {
    const prefix = colonMatch[1];
    const rest = colonMatch[2] || "";

    runs.push(
      new TextRun({
        text: prefix,
        bold: true,
        font,
        size: defaultSize,
      }),
    );

    if (rest) {
      runs.push(...formatSubTokens(rest, defaultSize, font, false));
    }
    return runs;
  }

  return formatSubTokens(text, defaultSize, font, options?.bold ?? false);
}

function formatSubTokens(
  text: string,
  size: number,
  font: string,
  baseBold: boolean,
): TextRun[] {
  // Split tokens to highlight LINK, CERTIFICATE, URLs, and emails
  const tokenRegex = /(\bLINK\b|\bCERTIFICATE\b|https?:\/\/[^\s]+|[\w.-]+@[\w.-]+\.[a-z]{2,})/g;
  const parts = text.split(tokenRegex);
  const runs: TextRun[] = [];

  for (const part of parts) {
    if (!part) continue;
    if (part === "LINK" || part === "CERTIFICATE") {
      runs.push(
        new TextRun({
          text: part,
          bold: true,
          color: "0A66C2", // professional hyperlink blue
          underline: {},
          font,
          size,
        }),
      );
    } else if (
      part.startsWith("http://") ||
      part.startsWith("https://") ||
      part.includes("@")
    ) {
      runs.push(
        new TextRun({
          text: part,
          color: "0A66C2",
          underline: {},
          font,
          size,
        }),
      );
    } else {
      runs.push(
        new TextRun({
          text: part,
          bold: baseBold,
          font,
          size,
        }),
      );
    }
  }

  return runs.length > 0
    ? runs
    : [new TextRun({ text, bold: baseBold, font, size })];
}

/**
 * Extract structured text, paragraphs, line gaps, and images from a PDF file,
 * outputting a clean Microsoft Word (.docx) document matching original layout.
 */
export async function convertPdfToWord(
  file: File | Blob,
  options?: {
    enableOcr?: boolean;
    ocrLanguage?: string;
    includePageImages?: boolean;
    onProgress?: (progress: ConversionProgress) => void;
  },
): Promise<PdfToWordResult> {
  const arrayBuffer = await file.arrayBuffer();
  options?.onProgress?.({ percent: 5, status: "Loading PDF document…" });

  const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const docSections: Paragraph[] = [];
  const pagesSummary: { pageNumber: number; text: string }[] = [];
  let allExtractedText = "";

  const originalName = file instanceof File ? file.name : "document.pdf";
  const docTitle = originalName.replace(/\.[^/.]+$/, "");

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const currentPercent = Math.round(10 + (pageNum / numPages) * 75);
    options?.onProgress?.({
      percent: currentPercent,
      status: `Analyzing Page ${pageNum} of ${numPages}…`,
    });

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const pageWidthPt = viewport.width / 2.0;

    // 1. Render page to canvas for image extraction / OCR fallback
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }

    // 2. Extract text items from PDF
    const textContent = await page.getTextContent({ includeMarkedContent: true });
    const rawItems: TextItemObj[] = [];

    for (const rawItem of textContent.items) {
      if ("str" in rawItem && rawItem.str) {
        const tx = rawItem.transform;
        rawItems.push({
          str: rawItem.str,
          x: tx[4],
          y: tx[5], // PDF Y coordinate: higher values are near the TOP of page
          width: rawItem.width,
          height: rawItem.height,
          fontName: (rawItem as any).fontName,
        });
      }
    }

    // 3. Group items by baseline Y coordinate into structured LineItems
    const lines: LineItem[] = [];

    if (rawItems.length > 0) {
      // Sort items top-to-bottom (Y descending), then left-to-right (X ascending)
      rawItems.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3.5) return yDiff;
        return a.x - b.x;
      });

      // Cluster items into lines
      const lineClusters: TextItemObj[][] = [];
      let currentCluster: TextItemObj[] = [];
      let currentClusterY: number | null = null;

      for (const item of rawItems) {
        if (currentClusterY === null) {
          currentCluster = [item];
          currentClusterY = item.y;
        } else if (Math.abs(item.y - currentClusterY) <= 3.5) {
          currentCluster.push(item);
        } else {
          if (currentCluster.length > 0) {
            lineClusters.push(currentCluster);
          }
          currentCluster = [item];
          currentClusterY = item.y;
        }
      }
      if (currentCluster.length > 0) {
        lineClusters.push(currentCluster);
      }

      // Analyze each line cluster
      let prevLineY: number | null = null;
      let prevLineH = 12;

      for (let cIdx = 0; cIdx < lineClusters.length; cIdx++) {
        const cluster = lineClusters[cIdx];
        cluster.sort((a, b) => a.x - b.x);

        const lineY = cluster[0].y;
        const lineH = Math.max(...cluster.map((i) => i.height || 12));
        const minX = cluster[0].x;
        const lastItem = cluster[cluster.length - 1];
        const maxX = lastItem.x + lastItem.width;

        // Check vertical gap from previous line (empty paragraphs)
        if (prevLineY !== null) {
          const verticalGap = prevLineY - lineY; // positive downwards
          if (verticalGap > prevLineH * 1.7) {
            const emptyGaps = Math.min(
              4,
              Math.floor(verticalGap / (prevLineH * 1.4)) - 1,
            );
            for (let g = 0; g < emptyGaps; g++) {
              lines.push({
                items: [],
                text: "",
                y: lineY,
                height: prevLineH,
                minX: 0,
                maxX: 0,
                isBlankLine: true,
              });
            }
          }
        }

        prevLineY = lineY;
        prevLineH = lineH;

        // Check if there is a 2-column split (Left vs Right aligned items on same line)
        let splitIndex = -1;
        for (let i = 0; i < cluster.length - 1; i++) {
          const currentItemEnd = cluster[i].x + cluster[i].width;
          const nextItemStart = cluster[i + 1].x;
          const gap = nextItemStart - currentItemEnd;

          // If gap between words is large (> 40pt) and the right item starts in right half of page
          if (gap > 40 && nextItemStart > pageWidthPt * 0.45) {
            splitIndex = i + 1;
            break;
          }
        }

        let leftStr = "";
        let rightStr = "";

        if (splitIndex !== -1) {
          const leftItems = cluster.slice(0, splitIndex);
          const rightItems = cluster.slice(splitIndex);

          leftStr = leftItems
            .map((i) => i.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          rightStr = rightItems
            .map((i) => i.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        } else {
          leftStr = cluster
            .map((i) => i.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        }

        const fullLineText = rightStr ? `${leftStr}    ${rightStr}` : leftStr;

        // Detect if line is centered
        const centerX = (minX + maxX) / 2;
        const isCentered =
          !rightStr &&
          Math.abs(centerX - pageWidthPt / 2) < 45 &&
          maxX - minX < pageWidthPt * 0.75;

        // Detect if line is a section heading
        const isSectionHeading =
          isCentered ||
          /^(EDUCATION|SKILLS SUMMARY|SKILLS|WORK EXPERIENCE|EXPERIENCE|PROJECTS|CERTIFICATES|CERTIFICATIONS|SUMMARY|ABOUT ME|AWARDS|PUBLICATIONS|PROFILE)$/i.test(
            leftStr.trim(),
          );

        // Detect bullet points
        const bulletMatch = leftStr.match(/^([•o*\-▪–—\u2022\u25E6\u25AA])\s*(.*)$/);
        const isBullet = !!bulletMatch;
        let cleanLeftText = leftStr;
        let bulletLevel = 0;

        if (bulletMatch) {
          cleanLeftText = bulletMatch[2];
          bulletLevel = bulletMatch[1] === "o" || minX > 80 ? 1 : 0;
        }

        // Detect if line is a large candidate name header (top of document, font size > 14pt)
        const isLargeName = cIdx === 0 && lineH >= 14 && !isSectionHeading;

        lines.push({
          items: cluster,
          text: fullLineText,
          y: lineY,
          height: lineH,
          minX,
          maxX,
          leftText: cleanLeftText,
          rightText: rightStr || undefined,
          isCentered,
          isSectionHeading,
          isBullet,
          bulletLevel,
          isLargeName,
        });
      }
    }

    // 4. OCR fallback if page has negligible native text
    let pageText = lines.map((l) => l.text).join("\n");
    if (pageText.trim().length < 15 && options?.enableOcr && ctx) {
      options?.onProgress?.({
        percent: currentPercent,
        status: `Transcribing scanned Page ${pageNum} of ${numPages}…`,
      });

      try {
        const ocrRes = await extractOcrFromImage(
          canvas,
          options?.ocrLanguage || "eng",
        );
        if (ocrRes.text.trim()) {
          pageText = ocrRes.text.trim();
          lines.length = 0;
          for (const lineStr of pageText.split("\n")) {
            if (!lineStr.trim()) {
              lines.push({
                items: [],
                text: "",
                y: 0,
                height: 12,
                minX: 0,
                maxX: 0,
                isBlankLine: true,
              });
            } else {
              lines.push({
                items: [],
                text: lineStr.trim(),
                leftText: lineStr.trim(),
                y: 0,
                height: 12,
                minX: 0,
                maxX: 0,
              });
            }
          }
        }
      } catch (ocrErr) {
        console.warn(`OCR fallback error on page ${pageNum}`, ocrErr);
      }
    }

    pagesSummary.push({ pageNumber: pageNum, text: pageText.trim() });
    allExtractedText += `\n\n=== Page ${pageNum} ===\n` + pageText.trim();

    // Page Break before page 2, 3, etc.
    if (pageNum > 1) {
      docSections.push(
        new Paragraph({
          children: [new PageBreak()],
        }),
      );
    }

    // Embed visual snapshot if page is pure scan/image
    const isImagePage = pageText.trim().length === 0 || options?.includePageImages;
    if (isImagePage && ctx) {
      try {
        const imgBlob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", 0.9),
        );
        if (imgBlob) {
          const imgBytes = new Uint8Array(await imgBlob.arrayBuffer());
          const aspect = viewport.width / Math.max(1, viewport.height);
          const imgW = 520;
          const imgH = Math.round(imgW / aspect);

          docSections.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBytes,
                  transformation: { width: imgW, height: imgH },
                  type: "jpg",
                }),
              ],
              spacing: { after: 150 },
            }),
          );
        }
      } catch (imgErr) {
        console.warn("Failed to embed page image", imgErr);
      }
    }

    // 5. Build Word (.docx) paragraphs with exact formatting
    for (const line of lines) {
      if (line.isBlankLine) {
        docSections.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            spacing: { after: 100 },
          }),
        );
        continue;
      }

      // Case A: Centered section heading (e.g. EDUCATION, WORK EXPERIENCE, SKILLS SUMMARY)
      if (line.isSectionHeading) {
        docSections.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: line.leftText || line.text,
                bold: true,
                size: 22, // 11pt
                font: "Calibri",
                color: "111827",
              }),
            ],
            spacing: { before: 180, after: 80 },
          }),
        );
        continue;
      }

      // Case B: Top Name / Header (e.g. Vikas Gupta)
      if (line.isLargeName) {
        if (line.rightText) {
          docSections.push(
            new Paragraph({
              tabStops: [
                { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
              ],
              children: [
                ...formatTextToRuns(line.leftText || "", { isName: true }),
                new TextRun({ text: "\t" }),
                ...formatTextToRuns(line.rightText, { bold: false, size: 20 }),
              ],
              spacing: { after: 40, line: 240 },
            }),
          );
        } else {
          docSections.push(
            new Paragraph({
              children: formatTextToRuns(line.leftText || "", { isName: true }),
              spacing: { after: 40, line: 240 },
            }),
          );
        }
        continue;
      }

      // Case C: 2-Column Split Line (e.g., Degree on left, Date on right)
      if (line.rightText) {
        // Detect if left text is a bold entry (like company/job title or college name)
        const isLeftBold =
          /^(Bachelor|Master|B\.|M\.|BUSINESS|STUDENT|CREDIT|HEART|PROGRAMMING|INTRODUCTION|FOUNDATIONS|Vellore|Barasat)/i.test(
            line.leftText || "",
          ) || (line.leftText || "").includes("|");

        docSections.push(
          new Paragraph({
            tabStops: [
              { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
            ],
            children: [
              ...formatTextToRuns(line.leftText || "", { bold: isLeftBold }),
              new TextRun({ text: "\t" }),
              ...formatTextToRuns(line.rightText, { bold: isLeftBold }),
            ],
            spacing: { after: 40, line: 240 },
          }),
        );
        continue;
      }

      // Case D: Bullet Point Line
      if (line.isBullet) {
        docSections.push(
          new Paragraph({
            bullet: { level: line.bulletLevel || 0 },
            children: formatTextToRuns(line.leftText || ""),
            spacing: { after: 30, line: 240 },
          }),
        );
        continue;
      }

      // Case E: Standard Body Paragraph
      const isBodyBold = /^(Bachelor|Master|B\.|M\.|Vellore|Barasat)/i.test(
        line.leftText || "",
      );

      docSections.push(
        new Paragraph({
          children: formatTextToRuns(line.leftText || line.text, {
            bold: isBodyBold,
          }),
          spacing: { after: 40, line: 240 },
        }),
      );
    }
  }

  options?.onProgress?.({ percent: 92, status: "Assembling Word (.docx) file…" });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720, // 0.5 inch margins
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children: docSections,
      },
    ],
  });

  const docxBlob = await Packer.toBlob(doc);
  const fileName = `${docTitle}.docx`;

  options?.onProgress?.({ percent: 100, status: "Complete!" });

  return {
    docxBlob,
    fileName,
    pageCount: numPages,
    extractedText: allExtractedText.trim(),
    pages: pagesSummary,
  };
}

/**
 * Convert a Microsoft Word (.docx) document into a PDF,
 * using docx-preview to preserve exact fonts, spacing, tables, and page layout.
 */
export async function convertWordToPdf(
  file: File | Blob,
  options?: {
    onProgress?: (progress: ConversionProgress) => void;
  },
): Promise<WordToPdfResult> {
  options?.onProgress?.({ percent: 10, status: "Loading Word document styles…" });
  const arrayBuffer = await file.arrayBuffer();

  const originalName = file instanceof File ? file.name : "document.docx";
  const baseName = originalName.replace(/\.[^/.]+$/, "");

  // Create an isolated off-screen iframe so html2canvas doesn't parse host app oklch styles
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "900px";
  iframe.style.height = "1400px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error("Unable to create conversion sandbox.");
    }

    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Calibri, 'Segoe UI', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    #docx-render-target {
      width: 100%;
      min-height: 100vh;
      background: #ffffff;
    }
    .docx-wrapper {
      background: #ffffff !important;
      padding: 0 !important;
    }
    section.docx {
      box-shadow: none !important;
      margin: 0 auto !important;
      background: #ffffff !important;
    }
  </style>
</head>
<body>
  <div id="docx-render-target"></div>
</body>
</html>`);
    iframeDoc.close();

    const container = iframeDoc.getElementById("docx-render-target")!;

    options?.onProgress?.({ percent: 35, status: "Rendering Word pages and layout…" });

    // Render exact Word page layout using docx-preview inside isolated iframe
    await renderAsync(arrayBuffer, container, undefined, {
      className: "docx",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    });

    // Wait for fonts inside iframe to load
    try {
      if ((iframeDoc as any).fonts?.ready) {
        await (iframeDoc as any).fonts.ready;
      }
    } catch {
      // Font ready fallback
    }

    options?.onProgress?.({ percent: 65, status: "Converting pages to high-resolution PDF…" });

    // Find rendered page elements inside iframeDoc
    let pageElements = Array.from(
      iframeDoc.querySelectorAll<HTMLElement>("section.docx, .docx-wrapper > section"),
    );

    if (pageElements.length === 0) {
      pageElements = [container];
    }

    const PT_PER_PX = 72 / 96;
    let pdf: jsPDF | null = null;

    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i];
      const pageNum = i + 1;

      options?.onProgress?.({
        percent: Math.round(65 + (pageNum / pageElements.length) * 30),
        status: `Capturing Page ${pageNum} of ${pageElements.length}…`,
      });

      // Capture page with html2canvas inside iframe context (no oklch conflicts)
      const canvas = await html2canvas(pageEl, {
        scale: 2.0,
        useCORS: true,
        logging: false,
        backgroundColor: "#FFFFFF",
        windowWidth: pageEl.scrollWidth || 850,
      });

      const pageWpt = canvas.width * 0.5 * PT_PER_PX;
      const pageHpt = canvas.height * 0.5 * PT_PER_PX;

      if (!pdf) {
        pdf = new jsPDF({
          orientation: pageWpt > pageHpt ? "landscape" : "portrait",
          unit: "pt",
          format: [pageWpt, pageHpt],
          compress: true,
        });
      } else {
        pdf.addPage(
          [pageWpt, pageHpt],
          pageWpt > pageHpt ? "landscape" : "portrait",
        );
      }

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWpt, pageHpt, undefined, "FAST");
    }

    if (!pdf) {
      throw new Error("Unable to render Word document pages.");
    }

    options?.onProgress?.({ percent: 98, status: "Finalizing PDF file…" });

    const pdfBlob = pdf.output("blob");
    const fileName = `${baseName}.pdf`;

    options?.onProgress?.({ percent: 100, status: "Complete!" });

    return {
      pdfBlob,
      fileName,
      pageCount: pageElements.length,
    };
  } finally {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}

/**
 * Extract pages from an existing PDF file into an array of image File objects.
 */
export async function extractPdfPagesAsImages(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<File[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const originalName = file instanceof File ? file.name : "document.pdf";
  const baseName = originalName.replace(/\.[^/.]+$/, "");

  const extractedFiles: File[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(Math.round((pageNum / numPages) * 100));

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x print quality

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });

    if (blob) {
      const pageFile = new File(
        [blob],
        `${baseName}-page-${String(pageNum).padStart(2, "0")}.png`,
        { type: "image/png" },
      );
      extractedFiles.push(pageFile);
    }
  }

  return extractedFiles;
}
