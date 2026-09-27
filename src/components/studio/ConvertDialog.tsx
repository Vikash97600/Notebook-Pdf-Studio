import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generatePdfFromImages, type GenerationStage } from "@/lib/pdf";
import { formatBytes } from "@/lib/pdf-meta";
import type { StudioImage } from "@/types/studio";
import { toast } from "sonner";
import { CheckCircle2, Download, Share2, TriangleAlert } from "lucide-react";

interface ConvertDialogProps {
  images: StudioImage[];
  settings: PdfSettings;
  open: boolean;
  onClose: () => void;
}

type PdfSettings = import("@/lib/pdf-meta").PdfSettings;

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string; percent: number; stage: GenerationStage["stage"] }
  | { kind: "success"; fileName: string; sizeBytes: number; pages: number; url: string }
  | { kind: "error"; message: string };

const PREPARING_FRACTION = 0.55;
const GENERATING_FRACTION = 0.9;

/**
 * Runs the real conversion and reports honest, stage-based progress:
 * image rasterisation is measured image-by-image; PDF assembly is a
 * coarse stage, not a fake percentage.
 */
export function ConvertDialog({ images, settings, open, onClose }: ConvertDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const resultUrlRef = useRef<string | null>(null);
  const resultBlobRef = useRef<Blob | null>(null);

  const releaseUrl = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    resultBlobRef.current = null;
  }, []);

  const reset = useCallback(() => {
    releaseUrl();
    setPhase({ kind: "idle" });
  }, [releaseUrl]);

  useEffect(() => {
    if (!open) {
      releaseUrl();
      setPhase({ kind: "idle" });
    }
  }, [open, releaseUrl]);

  const run = useCallback(async () => {
    if (images.length === 0) return;
    releaseUrl();
    setPhase({ kind: "working", label: "Preparing images…", percent: 0, stage: "preparing" });
    try {
      const result = await generatePdfFromImages(images, settings, (stage) => {
        setPhase((prev) => {
          if (prev.kind !== "working") return prev;
          if (stage.stage === "preparing") {
            const percent = Math.round(
              ((stage.index + 1) / stage.total) * PREPARING_FRACTION * 100,
            );
            return { kind: "working", label: stage.label, percent, stage: "preparing" };
          }
          if (stage.stage === "generating") {
            return {
              kind: "working",
              label: stage.label,
              percent: Math.round(GENERATING_FRACTION * 100),
              stage: "generating",
  };
          }
          return { kind: "working", label: stage.label, percent: 100, stage: "finalizing" };
        });
      });
      const url = URL.createObjectURL(result.blob);
      resultUrlRef.current = url;
      resultBlobRef.current = result.blob;
      setPhase({
        kind: "success",
        fileName: result.fileName,
        sizeBytes: result.sizeBytes,
        pages: result.pages,
        url,
      });
    } catch (error) {
      console.error("PDF generation failed", error);
      setPhase({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "PDF generation failed. Please try again or reduce image quality.",
      });
    }
  }, [images, settings, releaseUrl]);

  // Kick off automatically when the dialog opens.
  const startedRef = useRef(false);
  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      void run();
    }
    if (!open) {
      startedRef.current = false;
    }
  }, [open, run]);

  const handleDownload = useCallback(() => {
    if (phase.kind !== "success") return;
    const link = document.createElement("a");
    link.href = phase.url;
    link.download = phase.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Download started");
  }, [phase]);

  const handleShare = useCallback(async () => {
    if (phase.kind !== "success") return;
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (!resultBlobRef.current) return;
    const file = new File([resultBlobRef.current], phase.fileName, { type: "application/pdf" });
    try {
      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: phase.fileName });
      } else {
        handleDownload();
      }
    } catch {
      // User cancelled or share failed — fall back to download.
      handleDownload();
    }
  }, [phase, handleDownload]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {phase.kind === "success" ? "PDF created" : "Creating your PDF"}
          </DialogTitle>
          <DialogDescription>
            {phase.kind === "success"
              ? "Your document is ready to download or share."
              : "Processed locally in your browser — nothing is uploaded."}
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "working" && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{phase.label}</p>
            <Progress value={phase.percent} aria-label="Conversion progress" />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {phase.percent}%
            </p>
          </div>
        )}

        {phase.kind === "success" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-chart-4" />
              <div className="text-sm">
                <p className="font-medium">{phase.fileName}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {phase.pages} page{phase.pages === 1 ? "" : "s"} ·{" "}
                  {formatBytes(phase.sizeBytes)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={handleDownload}>
                <Download className="size-4" />
                Download PDF
              </Button>
              {"share" in navigator ? (
                <Button type="button" variant="outline" onClick={handleShare}>
                  <Share2 className="size-4" />
                  Share
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={reset}>
                  Create another
                </Button>
              )}
            </div>
            <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <p className="text-sm">{phase.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => void run()}>
                Try again
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
