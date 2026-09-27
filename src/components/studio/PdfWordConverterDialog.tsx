import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText,
  FileType,
  ArrowRightLeft,
  Download,
  Upload,
  Copy,
  Check,
  Sparkles,
  Loader2,
  FolderInput,
} from "lucide-react";
import {
  convertPdfToWord,
  convertWordToPdf,
  extractPdfPagesAsImages,
  type PdfToWordResult,
  type WordToPdfResult,
} from "@/lib/pdf-word";
import { OCR_LANGUAGES } from "@/lib/ocr";
import { formatBytes } from "@/lib/pdf-meta";

interface PdfWordConverterDialogProps {
  open: boolean;
  onClose: () => void;
  onImportPdfPagesToWorkspace?: (files: File[]) => void;
}

export function PdfWordConverterDialog({
  open,
  onClose,
  onImportPdfPagesToWorkspace,
}: PdfWordConverterDialogProps) {
  const [activeTab, setActiveTab] = useState<"pdf2word" | "word2pdf">("pdf2word");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");

  // Options
  const [enableOcr, setEnableOcr] = useState(true);
  const [ocrLanguage, setOcrLanguage] = useState("eng");

  // Results
  const [pdfResult, setPdfResult] = useState<PdfToWordResult | null>(null);
  const [wordResult, setWordResult] = useState<WordToPdfResult | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setIsConverting(false);
    setProgress(0);
    setStatusText("");
    setPdfResult(null);
    setWordResult(null);
    setCopied(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (activeTab === "pdf2word" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please select a valid PDF file (.pdf)");
      return;
    }
    if (activeTab === "word2pdf" && !file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Please select a valid Word file (.docx)");
      return;
    }

    setSelectedFile(file);
    setPdfResult(null);
    setWordResult(null);
  };

  const handleConvert = async () => {
    if (!selectedFile) return;

    setIsConverting(true);
    setProgress(0);

    try {
      if (activeTab === "pdf2word") {
        const result = await convertPdfToWord(selectedFile, {
          enableOcr,
          ocrLanguage,
          onProgress: (p) => {
            setProgress(p.percent);
            setStatusText(p.status);
          },
        });
        setPdfResult(result);
        toast.success(`Converted ${result.pageCount} page(s) to Word (.docx)!`);
      } else {
        const result = await convertWordToPdf(selectedFile, {
          onProgress: (p) => {
            setProgress(p.percent);
            setStatusText(p.status);
          },
        });
        setWordResult(result);
        toast.success("Converted Word document to PDF!");
      }
    } catch (err) {
      console.error("Conversion failed", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Conversion failed. Please verify the file and try again.",
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownloadDocx = () => {
    if (!pdfResult) return;
    const url = URL.createObjectURL(pdfResult.docxBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdfResult.fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${pdfResult.fileName}`);
  };

  const handleDownloadPdf = () => {
    if (!wordResult) return;
    const url = URL.createObjectURL(wordResult.pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = wordResult.fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${wordResult.fileName}`);
  };

  const handleCopyText = async () => {
    if (!pdfResult?.extractedText) return;
    try {
      await navigator.clipboard.writeText(pdfResult.extractedText);
      setCopied(true);
      toast.success("Text copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy text.");
    }
  };

  const handleImportToStudio = async () => {
    if (!selectedFile || !onImportPdfPagesToWorkspace) return;
    setIsConverting(true);
    setStatusText("Extracting pages into Studio…");

    try {
      const pageImages = await extractPdfPagesAsImages(selectedFile, (p) => setProgress(p));
      onImportPdfPagesToWorkspace(pageImages);
      toast.success(`Imported ${pageImages.length} page(s) into workspace!`);
      onClose();
    } catch (err) {
      console.error("PDF page extraction failed", err);
      toast.error("Failed to import PDF pages into Studio.");
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArrowRightLeft className="size-4" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              PDF ⇄ Word Converter
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Convert PDF documents to editable Microsoft Word (.docx) and Word files to PDF — 100% in your browser.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selector */}
        <div className="flex gap-2 border-b pb-2 pt-1">
          <Button
            type="button"
            variant={activeTab === "pdf2word" ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs gap-1.5"
            onClick={() => {
              setActiveTab("pdf2word");
              resetState();
            }}
          >
            <FileText className="size-4" />
            PDF to Word (.docx)
          </Button>
          <Button
            type="button"
            variant={activeTab === "word2pdf" ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs gap-1.5"
            onClick={() => {
              setActiveTab("word2pdf");
              resetState();
            }}
          >
            <FileType className="size-4" />
            Word (.docx) to PDF
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* File Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
              <Upload className="size-5" />
            </div>
            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)} · Click to replace</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  {activeTab === "pdf2word" ? "Choose or drag a PDF document" : "Choose or drag a Word document (.docx)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeTab === "pdf2word" ? "Supports text & scanned/handwritten PDFs" : "Supports formatted .docx files"}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={activeTab === "pdf2word" ? ".pdf,application/pdf" : ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Options for PDF to Word */}
          {activeTab === "pdf2word" && (
            <div className="rounded-lg border bg-card p-3 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pdf-ocr-toggle" className="cursor-pointer font-medium">
                    OCR for Scanned Notes
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Extracts handwritten/scanned notebook pages using OCR fallback.
                  </p>
                </div>
                <Switch
                  id="pdf-ocr-toggle"
                  checked={enableOcr}
                  onCheckedChange={setEnableOcr}
                />
              </div>

              {enableOcr && (
                <div className="flex items-center justify-between gap-2 border-t pt-2">
                  <span className="text-muted-foreground">OCR Language:</span>
                  <select
                    value={ocrLanguage}
                    onChange={(e) => setOcrLanguage(e.target.value)}
                    className="h-7 rounded border bg-background px-2 text-xs font-medium"
                  >
                    {OCR_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          {isConverting && (
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

          {/* PDF to Word Result Preview */}
          {pdfResult && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Converted Word Document</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {pdfResult.pageCount} page(s) extracted into {pdfResult.fileName}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleCopyText}
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy Text"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleDownloadDocx}
                  >
                    <Download className="size-3.5" />
                    Download .DOCX
                  </Button>
                </div>
              </div>

              {/* Text Preview Box */}
              <div className="max-h-40 overflow-y-auto rounded border bg-muted/30 p-2.5 text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                {pdfResult.extractedText || "(No readable text detected)"}
              </div>
            </div>
          )}

          {/* Word to PDF Result Preview */}
          {wordResult && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Generated PDF Document</h4>
                  <p className="text-[11px] text-muted-foreground">{wordResult.fileName}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleDownloadPdf}
                >
                  <Download className="size-3.5" />
                  Download PDF
                </Button>
              </div>

              {/* Conversion summary */}
              <div className="rounded border bg-background/50 p-4 text-xs text-muted-foreground flex items-center justify-between">
                <span>Layout, spacing, fonts, and pages preserved ({wordResult.pageCount} page{wordResult.pageCount > 1 ? "s" : ""})</span>
                <span className="text-emerald-500 font-medium">Ready to download</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            {activeTab === "pdf2word" && selectedFile && onImportPdfPagesToWorkspace && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={isConverting}
                onClick={handleImportToStudio}
              >
                <FolderInput className="size-3.5" />
                Import Pages into Workspace
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!selectedFile || isConverting}
              onClick={handleConvert}
            >
              <Sparkles className="size-3.5" />
              {activeTab === "pdf2word" ? "Convert to Word" : "Convert to PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
