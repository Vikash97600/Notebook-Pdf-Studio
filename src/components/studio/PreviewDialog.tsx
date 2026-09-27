import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minus,
  Plus,
} from "lucide-react";

GlobalWorkerOptions.workerSrc = workerUrl;

interface PreviewDialogProps {
  blobUrl: string | null;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Real PDF preview: the generated blob is parsed with pdf.js and each page
 * is rendered to a canvas — never a fabricated screenshot.
 */
export function PreviewDialog({ blobUrl, fileName, open, onClose }: PreviewDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<Awaited<ReturnType<typeof getDocument>["promise"]> | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1); // 1 = fit width
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Load the document when opened.
  useEffect(() => {
    if (!open || !blobUrl) return;
    let cancelled = false;
    setError(null);
    setPage(1);
    setZoom(1);
    getDocument({ url: blobUrl }).promise
      .then((doc) => {
        if (cancelled) {
          void doc.cleanup();
          return;
        }
        pdfDocRef.current = doc;
        setPageCount(doc.numPages);
      })
      .catch((err: unknown) => {
        console.error("Preview failed to load PDF", err);
        setError("The PDF could not be previewed. You can still download it.");
      });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      void pdfDocRef.current?.cleanup();
      pdfDocRef.current = null;
    };
  }, [open, blobUrl]);

  // Render the current page.
  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || page < 1 || page > pageCount) return;
    let cancelled = false;
    setRendering(true);

    doc.getPage(page)
      .then((pdfPage) => {
        if (cancelled) return;
        const containerWidth = Math.min(
          canvas.parentElement?.clientWidth ?? 640,
          900,
        );
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = (containerWidth / base.width) * zoom;
        const viewport = pdfPage.getViewport({ scale: scale * window.devicePixelRatio });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${Math.round(viewport.width / window.devicePixelRatio)}px`;
        const task = pdfPage.render({ canvas, canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        return task.promise;
      })
      .catch((err: unknown) => {
        const errName = err instanceof Error ? err.name : String(err);
        if (!cancelled && errName !== "RenderingCancelledException") {
          console.error("Preview render failed", err);
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [page, pageCount, zoom, open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowRight") setPage((p) => Math.min(p + 1, pageCount));
      if (event.key === "ArrowLeft") setPage((p) => Math.max(p - 1, 1));
    },
    [pageCount],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-3xl flex-col gap-0 p-0 sm:h-[90vh]"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="border-b px-4 py-3 text-left">
          <DialogTitle className="truncate text-base">
            Preview — {fileName}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Page-by-page preview of the generated PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[72px] text-center text-xs tabular-nums text-muted-foreground">
              Page {page} / {pageCount || "—"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}
              aria-label="Zoom out"
            >
              <Minus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setZoom(1)}
              aria-label="Fit to width"
            >
              <Maximize className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.15) * 100) / 100))}
              aria-label="Zoom in"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-3">
          {error ? (
            <p className="pt-10 text-center text-sm text-destructive">{error}</p>
          ) : pageCount === 0 ? (
            <p className="pt-10 text-center text-sm text-muted-foreground">
              Loading preview…
            </p>
          ) : (
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                className={cn(
                  "max-w-full rounded-sm bg-white shadow-md",
                  rendering && "opacity-60",
                )}
                aria-label={`PDF preview page ${page}`}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
