import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Copy,
  Download,
  FileText,
  Sparkles,
  Check,
  Languages,
  Loader2,
  FileDown,
} from "lucide-react";
import type { StudioImage } from "@/types/studio";
import {
  extractOcrFromImage,
  formatPagesAsMarkdown,
  formatPagesAsPlainText,
  OCR_LANGUAGES,
  type OcrPageResult,
} from "@/lib/ocr";
import { loadImageElement, renderProcessedImage } from "@/lib/images";

interface OcrDialogProps {
  images: StudioImage[];
  selectedImageId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdateImageOcr: (id: string, result: OcrPageResult) => void;
}

export function OcrDialog({
  images,
  selectedImageId,
  open,
  onClose,
  onUpdateImageOcr,
}: OcrDialogProps) {
  const [activeTab, setActiveTab] = useState<"single" | "all">("single");
  const [activeImageId, setActiveImageId] = useState<string | null>(selectedImageId);
  const [language, setLanguage] = useState("eng");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState("");

  // Sync active image when dialog opens or selectedImageId changes
  useEffect(() => {
    if (selectedImageId) {
      setActiveImageId(selectedImageId);
      setActiveTab("single");
    } else if (images.length > 0 && !activeImageId) {
      setActiveImageId(images[0].id);
    }
  }, [selectedImageId, images, activeImageId]);

  const activeImage = images.find((img) => img.id === activeImageId) ?? images[0] ?? null;

  // Sync editable text with active image's OCR result
  useEffect(() => {
    if (activeTab === "single" && activeImage?.ocrResult?.text) {
      setEditableText(activeImage.ocrResult.text);
    } else if (activeTab === "single" && !activeImage?.ocrResult?.text) {
      setEditableText("");
    }
  }, [activeImage, activeTab]);

  // Extract OCR for single image
  const handleRunOcrSingle = useCallback(async (image: StudioImage) => {
    setIsProcessing(true);
    setProgress(0);
    setStatusText("Preparing image…");
    try {
      const el = await loadImageElement(image.file);
      const processed = renderProcessedImage(el, {
        rotation: image.rotation,
        crop: image.crop,
        filters: image.filters,
        maxSide: 2500,
        flipH: image.flipH,
        flipV: image.flipV,
      });

      setStatusText("Initializing OCR model…");
      const result = await extractOcrFromImage(
        processed.dataUrl,
        language,
        (p, status) => {
          setProgress(p);
          setStatusText(
            status === "recognizing text"
              ? `Recognizing text (${p}%)…`
              : `Loading OCR engine (${p}%)…`,
          );
        },
      );

      onUpdateImageOcr(image.id, result);
      setEditableText(result.text);
      toast.success(`OCR completed with ${result.confidence}% confidence!`);
    } catch (err) {
      console.error("OCR failed", err);
      toast.error("Failed to extract text. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [language, onUpdateImageOcr]);

  // Extract OCR for all images sequentially
  const handleRunOcrAll = useCallback(async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    const total = images.length;

    try {
      for (let i = 0; i < total; i++) {
        const image = images[i];
        setStatusText(`Extracting Page ${i + 1} of ${total}…`);
        setProgress(Math.round((i / total) * 100));

        const el = await loadImageElement(image.file);
        const processed = renderProcessedImage(el, {
          rotation: image.rotation,
          crop: image.crop,
          filters: image.filters,
          maxSide: 2500,
          flipH: image.flipH,
          flipV: image.flipV,
        });

        const result = await extractOcrFromImage(
          processed.dataUrl,
          language,
          (p) => {
            const overall = Math.round(((i + p / 100) / total) * 100);
            setProgress(overall);
          },
        );

        onUpdateImageOcr(image.id, result);
      }
      setProgress(100);
      toast.success(`OCR finished for all ${total} pages!`);
    } catch (err) {
      console.error("Batch OCR failed", err);
      toast.error("Batch OCR encountered an error.");
    } finally {
      setIsProcessing(false);
    }
  }, [images, language, onUpdateImageOcr]);

  // Copy text handler
  const handleCopy = useCallback(async () => {
    let textToCopy = "";
    if (activeTab === "single") {
      textToCopy = editableText || activeImage?.ocrResult?.text || "";
    } else {
      const pages = images.map((img, idx) => ({
        pageNumber: idx + 1,
        name: img.name,
        text: img.ocrResult?.text || "",
      }));
      textToCopy = formatPagesAsMarkdown(pages);
    }

    if (!textToCopy.trim()) {
      toast.error("No text available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("Text copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }, [activeTab, editableText, activeImage, images]);

  // Download handlers
  const handleDownloadTxt = useCallback(() => {
    let content = "";
    let fileName = "notes.txt";

    if (activeTab === "single" && activeImage) {
      content = editableText || activeImage.ocrResult?.text || "";
      fileName = `${activeImage.name.replace(/\.[^/.]+$/, "")}-ocr.txt`;
    } else {
      const pages = images.map((img, idx) => ({
        pageNumber: idx + 1,
        name: img.name,
        text: img.ocrResult?.text || "",
      }));
      content = formatPagesAsPlainText(pages);
      fileName = "notebook-all-pages-ocr.txt";
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${fileName}`);
  }, [activeTab, activeImage, editableText, images]);

  const handleDownloadMd = useCallback(() => {
    const pages = images.map((img, idx) => ({
      pageNumber: idx + 1,
      name: img.name,
      text:
        activeTab === "single" && img.id === activeImage?.id
          ? editableText
          : img.ocrResult?.text || "",
    }));

    const content = formatPagesAsMarkdown(pages);
    const fileName = "notebook-notes.md";
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${fileName}`);
  }, [activeTab, activeImage, editableText, images]);

  const handleSaveTextChanges = useCallback(() => {
    if (!activeImage) return;
    const existing = activeImage.ocrResult;
    const updatedResult: OcrPageResult = {
      text: editableText,
      confidence: existing?.confidence ?? 100,
      lines: existing?.lines ?? [],
      words: existing?.words ?? [],
    };
    onUpdateImageOcr(activeImage.id, updatedResult);
    toast.success("Saved text changes for this page.");
  }, [activeImage, editableText, onUpdateImageOcr]);

  const allExtractedCount = images.filter((img) => img.ocrResult?.text).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" />
              </div>
              <DialogTitle className="text-lg font-semibold">
                Text Extraction &amp; OCR Notes
              </DialogTitle>
            </div>
            {/* Language Selector */}
            <div className="flex items-center gap-1 text-xs">
              <Languages className="size-3.5 text-muted-foreground" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isProcessing}
                className="h-8 rounded-md border bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="OCR Language"
              >
                {OCR_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogDescription className="text-xs">
            Extract, edit, and export text from your images locally in your browser.
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher: Single Page vs All Pages */}
        <div className="flex items-center justify-between border-b pb-2 pt-1">
          <div className="flex gap-1">
            <Button
              type="button"
              variant={activeTab === "single" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => setActiveTab("single")}
            >
              Current Page
            </Button>
            <Button
              type="button"
              variant={activeTab === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => setActiveTab("all")}
            >
              All Pages ({allExtractedCount}/{images.length})
            </Button>
          </div>

          {activeTab === "single" && images.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Page:</span>
              <select
                value={activeImageId ?? ""}
                onChange={(e) => setActiveImageId(e.target.value)}
                className="h-7 rounded border bg-background px-2 text-xs font-medium"
              >
                {images.map((img, idx) => (
                  <option key={img.id} value={img.id}>
                    {idx + 1}. {img.name.slice(0, 18)}
                    {img.ocrResult ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Progress Bar while working */}
        {isProcessing && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5 text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                {statusText}
              </span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto min-h-[260px] max-h-[380px] py-2">
          {activeTab === "single" ? (
            activeImage ? (
              <div className="space-y-3">
                {activeImage.ocrResult ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                          {activeImage.ocrResult.confidence}% confidence
                        </span>
                        <span className="text-muted-foreground">
                          {editableText.split(/\s+/).filter(Boolean).length} words
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={handleSaveTextChanges}
                      >
                        Save edits
                      </Button>
                    </div>

                    <textarea
                      value={editableText}
                      onChange={(e) => setEditableText(e.target.value)}
                      placeholder="Extracted text will appear here. You can edit it freely…"
                      className="w-full h-64 rounded-md border bg-background p-3 text-xs leading-relaxed font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed p-6">
                    <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                      <Sparkles className="size-6" />
                    </div>
                    <h4 className="text-sm font-semibold">No text extracted yet</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      Run OCR on "{activeImage.name}" to recognize handwritten or printed text from this page.
                    </p>
                    <Button
                      type="button"
                      className="mt-4 gap-1.5"
                      size="sm"
                      disabled={isProcessing}
                      onClick={() => void handleRunOcrSingle(activeImage)}
                    >
                      <Sparkles className="size-4" />
                      Extract Text from this Page
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground py-10">
                No images available in workspace.
              </p>
            )
          ) : (
            /* All Pages Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div>
                  <p className="text-xs font-semibold">Consolidated Notes</p>
                  <p className="text-[11px] text-muted-foreground">
                    {allExtractedCount} of {images.length} pages processed
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  disabled={isProcessing}
                  onClick={() => void handleRunOcrAll()}
                >
                  <Sparkles className="size-3.5" />
                  {allExtractedCount === images.length ? "Re-run All Pages" : "Extract All Pages"}
                </Button>
              </div>

              <div className="space-y-3">
                {images.map((img, idx) => (
                  <div key={img.id} className="rounded-md border bg-card p-3 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-foreground">
                        Page {idx + 1}: {img.name}
                      </span>
                      {img.ocrResult ? (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ {img.ocrResult.confidence}% confidence
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] text-primary"
                          disabled={isProcessing}
                          onClick={() => void handleRunOcrSingle(img)}
                        >
                          Extract
                        </Button>
                      )}
                    </div>
                    {img.ocrResult?.text ? (
                      <p className="line-clamp-3 text-muted-foreground font-mono text-[11px] whitespace-pre-wrap bg-muted/30 p-2 rounded">
                        {img.ocrResult.text}
                      </p>
                    ) : (
                      <p className="text-muted-foreground italic text-[11px]">
                        Not scanned yet.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 text-xs"
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copied ? "Copied!" : "Copy Text"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTxt}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3.5" />
              Export .TXT
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadMd}
              className="gap-1.5 text-xs"
            >
              <FileDown className="size-3.5" />
              Export .MD
            </Button>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
