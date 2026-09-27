import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NEUTRAL_FILTERS,
  isNeutralFilters,
  type ImageFilters,
} from "@/lib/images";
import type { StudioImage } from "@/types/studio";
import { cn } from "@/lib/utils";
import {
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
  Sparkles,
  ScanLine,
  Crop as CropIcon,
  Sliders,
  Wand2,
  Maximize2,
} from "lucide-react";
import {
  autoDetectDocumentCorners,
  DEFAULT_QUAD,
  isDefaultQuad,
  warpPerspectiveCanvas,
  applyMagicColorFilter,
  applyBwThresholdFilter,
  applyShadowRemovalFilter,
  type PerspectiveQuad,
  type Point,
  type ScanFilterMode,
} from "@/lib/scanner";

interface ImageEditorDialogProps {
  image: StudioImage | null;
  open: boolean;
  onApply: (
    id: string,
    patch: {
      rotation: number;
      crop: { x: number; y: number; w: number; h: number } | null;
      perspectiveQuad?: PerspectiveQuad | null;
      filters: ImageFilters;
      flipH: boolean;
      flipV: boolean;
    },
  ) => void;
  onClose: () => void;
}

type EditorTab = "scan" | "crop" | "rotate" | "filter" | "adjust";

const CROP_PRESETS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "original", label: "Original", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "A4", label: "A4", ratio: 210 / 297 },
];

interface CropRect {
  x: number; // 0..1 fractions of the displayed image
  y: number;
  w: number;
  h: number;
}

const MIN_CROP = 0.05;

function clampRect(rect: CropRect): CropRect {
  const w = Math.min(Math.max(rect.w, MIN_CROP), 1);
  const h = Math.min(Math.max(rect.h, MIN_CROP), 1);
  const x = Math.min(Math.max(rect.x, 0), 1 - w);
  const y = Math.min(Math.max(rect.y, 0), 1 - h);
  return { x, y, w, h };
}

/** Draw perspective warp + rotation + crop + flip + filters into a canvas preview. */
function renderEditorPreview(
  img: HTMLImageElement,
  rotation: number,
  crop: CropRect | null,
  perspectiveQuad: PerspectiveQuad | null,
  filters: ImageFilters,
  flipH: boolean,
  flipV: boolean,
): string {
  let sourceEl: HTMLImageElement | HTMLCanvasElement = img;
  let iw = img.naturalWidth;
  let ih = img.naturalHeight;

  // Step 1: Perspective warp if quad is customized
  if (perspectiveQuad && !isDefaultQuad(perspectiveQuad)) {
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = iw;
    rawCanvas.height = ih;
    const rawCtx = rawCanvas.getContext("2d");
    if (rawCtx) {
      rawCtx.drawImage(img, 0, 0);
      const warped = warpPerspectiveCanvas(rawCanvas, perspectiveQuad);
      sourceEl = warped;
      iw = warped.width;
      ih = warped.height;
    }
  }

  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = c.x * iw;
  const sy = c.y * ih;
  const sw = Math.max(1, c.w * iw);
  const sh = Math.max(1, c.h * ih);
  const swap = (((rotation % 360) + 360) % 180) === 90;
  const dw = swap ? sh : sw;
  const dh = swap ? sw : sh;
  const maxPreview = 1400;
  const scale = Math.min(1, maxPreview / Math.max(dw, dh));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(dw * scale));
  canvas.height = Math.max(1, Math.round(dh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // White base so transparent PNGs don't render black
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / dw, canvas.height / dh);
  ctx.translate(dw / 2, dh / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.rotate((rotation * Math.PI) / 180);

  const filterParts: string[] = [];
  if (filters.brightness !== 100) filterParts.push(`brightness(${filters.brightness}%)`);
  if (filters.contrast !== 100) filterParts.push(`contrast(${filters.contrast}%)`);
  if (filters.saturation !== 100) filterParts.push(`saturate(${filters.saturation}%)`);
  if (filters.grayscale) filterParts.push("grayscale(1)");
  if (filters.blur > 0) filterParts.push(`blur(${(filters.blur * scale).toFixed(2)}px)`);
  ctx.filter = filterParts.join(" ") || "none";

  ctx.drawImage(sourceEl, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  // CamScanner Presets
  if (filters.scanPreset === "magic-color") {
    applyMagicColorFilter(canvas);
  } else if (filters.scanPreset === "bw-threshold") {
    applyBwThresholdFilter(canvas);
  } else if (filters.scanPreset === "shadow-remove") {
    applyShadowRemovalFilter(canvas);
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Resolve the w/h ratio for a crop preset relative to the rotated image. */
function presetRatioFor(
  presetId: string,
  img: HTMLImageElement,
  rotation: number,
): number | null {
  const swap = (((rotation % 360) + 360) % 180) === 90;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const naturalRatio = swap ? ih / iw : iw / ih;
  if (presetId === "original") return naturalRatio;
  if (presetId === "free") return null;
  const preset = CROP_PRESETS.find((p) => p.id === presetId);
  return preset?.ratio ?? null;
}

export function ImageEditorDialog({
  image,
  open,
  onApply,
  onClose,
}: ImageEditorDialogProps) {
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [perspectiveQuad, setPerspectiveQuad] = useState<PerspectiveQuad | null>(null);
  const [filters, setFilters] = useState<ImageFilters>(NEUTRAL_FILTERS);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [tab, setTab] = useState<EditorTab>("scan");
  const [cropPreset, setCropPreset] = useState("free");
  const [previewUrl, setPreviewUrl] = useState("");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  // Dragging crop frame
  const [cropDrag, setCropDrag] = useState<{
    kind: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    rect: CropRect;
  } | null>(null);

  // Dragging perspective corner handle
  const [quadDragCorner, setQuadDragCorner] = useState<keyof PerspectiveQuad | null>(null);

  // Seed editor state from image
  useEffect(() => {
    if (!image || !open) return;
    setRotation(image.rotation);
    setCrop(image.crop ? { ...image.crop } : null);
    setPerspectiveQuad(image.perspectiveQuad ? { ...image.perspectiveQuad } : null);
    setFilters({ ...image.filters });
    setFlipH(image.flipH);
    setFlipV(image.flipV);
    setTab("scan");
    setCropPreset("free");
    setImgLoaded(false);
    setPreviewUrl("");

    const url = URL.createObjectURL(image.file);
    const el = new Image();
    el.onload = () => {
      imgRef.current = el;
      setImgLoaded(true);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
    };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image, open]);

  // Re-render preview whenever edits change
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const url = renderEditorPreview(
      imgRef.current,
      rotation,
      crop,
      perspectiveQuad,
      filters,
      flipH,
      flipV,
    );
    setPreviewUrl(url);
  }, [imgLoaded, rotation, crop, perspectiveQuad, filters, flipH, flipV]);

  // Auto-detect corners handler
  const handleAutoDetectCorners = useCallback(() => {
    if (!imgRef.current) return;
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = imgRef.current.naturalWidth;
    rawCanvas.height = imgRef.current.naturalHeight;
    const ctx = rawCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(imgRef.current, 0, 0);
      const detected = autoDetectDocumentCorners(rawCanvas);
      setPerspectiveQuad(detected);
    }
  }, []);

  const handleResetCorners = useCallback(() => {
    setPerspectiveQuad(null);
  }, []);

  const applyCropPreset = useCallback(
    (presetId: string) => {
      setCropPreset(presetId);
      if (!imgRef.current) return;
      if (presetId === "free") {
        setCrop(null);
        return;
      }
      const ratio = presetRatioFor(presetId, imgRef.current, rotation);
      if (ratio == null) return;
      const swapped = (((rotation % 360) + 360) % 180) === 90;
      const iw = imgRef.current.naturalWidth;
      const ih = imgRef.current.naturalHeight;
      const baseW = swapped ? ih : iw;
      const baseH = swapped ? iw : ih;
      let w = 1;
      let h = 1;
      if (ratio >= baseW / baseH) {
        w = 1;
        h = baseW / ratio / baseH;
      } else {
        h = 1;
        w = (baseH * ratio) / baseW;
      }
      setCrop(clampRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h }));
    },
    [rotation],
  );

  const setFilterValue = useCallback(
    (key: keyof ImageFilters, value: number | boolean | ScanFilterMode) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetAll = useCallback(() => {
    setRotation(0);
    setCrop(null);
    setPerspectiveQuad(null);
    setFilters(NEUTRAL_FILTERS);
    setFlipH(false);
    setFlipV(false);
    setCropPreset("free");
  }, []);

  const handleApply = useCallback(() => {
    if (!image) return;
    onApply(image.id, { rotation, crop, perspectiveQuad, filters, flipH, flipV });
    onClose();
  }, [image, rotation, crop, perspectiveQuad, filters, flipH, flipV, onApply, onClose]);

  const hasEdits =
    rotation !== 0 ||
    crop !== null ||
    (perspectiveQuad !== null && !isDefaultQuad(perspectiveQuad)) ||
    flipH ||
    flipV ||
    !isNeutralFilters(filters);

  /* ------------------------- perspective quad dragging ------------------------- */

  const activeQuad = useMemo(() => perspectiveQuad ?? DEFAULT_QUAD, [perspectiveQuad]);

  const handleQuadHandlePointerDown = (corner: keyof PerspectiveQuad) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setQuadDragCorner(corner);
  };

  const handleQuadFramePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!quadDragCorner || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

      setPerspectiveQuad((prev) => {
        const current = prev ?? { ...DEFAULT_QUAD };
        return {
          ...current,
          [quadDragCorner]: { x, y },
        };
      });
    },
    [quadDragCorner],
  );

  const handleQuadPointerUp = useCallback((e: React.PointerEvent) => {
    if (quadDragCorner) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setQuadDragCorner(null);
    }
  }, [quadDragCorner]);

  /* ------------------------- crop dragging ------------------------- */

  const activeCrop = useMemo(() => crop ?? { x: 0, y: 0, w: 1, h: 1 }, [crop]);

  const beginCropDrag = (kind: "move" | "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setCropDrag({
      kind,
      startX: e.clientX,
      startY: e.clientY,
      rect: activeCrop,
    });
  };

  const handleCropFramePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!cropDrag || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      const dx = (e.clientX - cropDrag.startX) / rect.width;
      const dy = (e.clientY - cropDrag.startY) / rect.height;
      const init = cropDrag.rect;

      let next: CropRect = { ...init };

      if (cropDrag.kind === "move") {
        next.x = Math.min(Math.max(0, init.x + dx), 1 - init.w);
        next.y = Math.min(Math.max(0, init.y + dy), 1 - init.h);
      } else if (cropDrag.kind === "se") {
        next.w = Math.max(MIN_CROP, Math.min(1 - init.x, init.w + dx));
        next.h = Math.max(MIN_CROP, Math.min(1 - init.y, init.h + dy));
      } else if (cropDrag.kind === "nw") {
        const maxX = init.x + init.w - MIN_CROP;
        const maxY = init.y + init.h - MIN_CROP;
        const newX = Math.max(0, Math.min(maxX, init.x + dx));
        const newY = Math.max(0, Math.min(maxY, init.y + dy));
        next = {
          x: newX,
          y: newY,
          w: init.w + (init.x - newX),
          h: init.h + (init.y - newY),
        };
      } else if (cropDrag.kind === "ne") {
        const maxY = init.y + init.h - MIN_CROP;
        const newY = Math.max(0, Math.min(maxY, init.y + dy));
        next = {
          x: init.x,
          y: newY,
          w: Math.max(MIN_CROP, Math.min(1 - init.x, init.w + dx)),
          h: init.h + (init.y - newY),
        };
      } else if (cropDrag.kind === "sw") {
        const maxX = init.x + init.w - MIN_CROP;
        const newX = Math.max(0, Math.min(maxX, init.x + dx));
        next = {
          x: newX,
          y: init.y,
          w: init.w + (init.x - newX),
          h: Math.max(MIN_CROP, Math.min(1 - init.y, init.h + dy)),
        };
      }
      setCrop(clampRect(next));
    },
    [cropDrag],
  );

  const handleCropPointerUp = useCallback((e: React.PointerEvent) => {
    if (cropDrag) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setCropDrag(null);
    }
  }, [cropDrag]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base font-semibold">
            Edit Page {image ? `· ${image.name}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Deskew document, apply magic scan presets, crop, rotate, and adjust.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row md:h-[620px]">
          {/* Visual Workspace Canvas */}
          <div className="relative flex flex-1 items-center justify-center bg-muted/40 p-4 select-none overflow-hidden">
            <div
              ref={frameRef}
              onPointerMove={(e) => {
                if (tab === "scan") handleQuadFramePointerMove(e);
                if (tab === "crop") handleCropFramePointerMove(e);
              }}
              onPointerUp={(e) => {
                if (tab === "scan") handleQuadPointerUp(e);
                if (tab === "crop") handleCropPointerUp(e);
              }}
              className="relative max-h-[520px] max-w-full touch-none"
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Live preview"
                  className="max-h-[500px] w-auto rounded border object-contain shadow-sm pointer-events-none"
                  draggable={false}
                />
              )}

              {/* Perspective Quad Handles (Deskew tab) */}
              {tab === "scan" && (
                <svg
                  className="absolute inset-0 size-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {/* Connected quadrilateral polygon */}
                  <polygon
                    points={`${activeQuad.tl.x * 100},${activeQuad.tl.y * 100} ${activeQuad.tr.x * 100},${activeQuad.tr.y * 100} ${activeQuad.br.x * 100},${activeQuad.br.y * 100} ${activeQuad.bl.x * 100},${activeQuad.bl.y * 100}`}
                    className="fill-primary/15 stroke-primary stroke-[1.5]"
                    strokeDasharray="3 2"
                  />
                </svg>
              )}

              {tab === "scan" && (
                <>
                  {(["tl", "tr", "br", "bl"] as const).map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      tabIndex={-1}
                      style={{
                        left: `${activeQuad[corner].x * 100}%`,
                        top: `${activeQuad[corner].y * 100}%`,
                      }}
                      className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                      onPointerDown={handleQuadHandlePointerDown(corner)}
                      aria-label={`Perspective corner ${corner}`}
                    />
                  ))}
                </>
              )}

              {/* Crop Box Overlay (Crop tab) */}
              {tab === "crop" && crop && (
                <div
                  className="absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] cursor-move"
                  style={{
                    left: `${activeCrop.x * 100}%`,
                    top: `${activeCrop.y * 100}%`,
                    width: `${activeCrop.w * 100}%`,
                    height: `${activeCrop.h * 100}%`,
                  }}
                  onPointerDown={beginCropDrag("move")}
                >
                  {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      tabIndex={-1}
                      className={cn(
                        "absolute size-5 rounded-full border-2 border-white bg-primary shadow",
                        handle === "nw" && "-left-2.5 -top-2.5 cursor-nwse-resize",
                        handle === "ne" && "-right-2.5 -top-2.5 cursor-nesw-resize",
                        handle === "sw" && "-bottom-2.5 -left-2.5 cursor-nesw-resize",
                        handle === "se" && "-bottom-2.5 -right-2.5 cursor-nwse-resize",
                      )}
                      onPointerDown={beginCropDrag(handle)}
                      aria-label={`Crop handle ${handle}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Controls Panel */}
          <div className="flex w-full shrink-0 flex-col border-t md:w-80 md:border-l md:border-t-0">
            {/* Tools Tabs */}
            <div
              className="flex gap-1 border-b p-2 overflow-x-auto"
              role="tablist"
              aria-label="Editor tools"
            >
              {(
                [
                  ["scan", "Scanner", ScanLine],
                  ["filter", "Presets", Wand2],
                  ["crop", "Crop", CropIcon],
                  ["rotate", "Rotate", RotateCw],
                  ["adjust", "Adjust", Sliders],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    tab === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {/* 1. Scanner & Deskew Tab */}
              {tab === "scan" && (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-3 space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5">
                      <ScanLine className="size-4 text-primary" />
                      Perspective Deskew
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Drag the 4 corner pins to match the corners of your notebook page. It will automatically flatten and square the page.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      className="gap-2 text-xs"
                      onClick={handleAutoDetectCorners}
                    >
                      <Wand2 className="size-4" />
                      Auto-Detect Corners
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 text-xs"
                      onClick={handleResetCorners}
                    >
                      <Maximize2 className="size-4" />
                      Reset to Full Page
                    </Button>
                  </div>

                  {perspectiveQuad && !isDefaultQuad(perspectiveQuad) && (
                    <div className="rounded-md bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Perspective unskew active
                    </div>
                  )}
                </div>
              )}

              {/* 2. CamScanner Enhancement Presets Tab */}
              {tab === "filter" && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold mb-2">CamScanner-Style Presets</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={filters.scanPreset === "magic-color" ? "default" : "outline"}
                        className="h-16 flex flex-col items-center justify-center p-2 text-center"
                        onClick={() =>
                          setFilterValue(
                            "scanPreset",
                            filters.scanPreset === "magic-color" ? "none" : "magic-color",
                          )
                        }
                      >
                        <Sparkles className="size-4 mb-1 text-amber-500" />
                        <span className="text-xs font-semibold">Magic Color</span>
                        <span className="text-[9px] text-muted-foreground">Whitens page &amp; inks</span>
                      </Button>

                      <Button
                        type="button"
                        variant={filters.scanPreset === "bw-threshold" ? "default" : "outline"}
                        className="h-16 flex flex-col items-center justify-center p-2 text-center"
                        onClick={() =>
                          setFilterValue(
                            "scanPreset",
                            filters.scanPreset === "bw-threshold" ? "none" : "bw-threshold",
                          )
                        }
                      >
                        <ScanLine className="size-4 mb-1" />
                        <span className="text-xs font-semibold">B&amp;W Clean</span>
                        <span className="text-[9px] text-muted-foreground">Binary high contrast</span>
                      </Button>

                      <Button
                        type="button"
                        variant={filters.scanPreset === "shadow-remove" ? "default" : "outline"}
                        className="h-16 flex flex-col items-center justify-center p-2 text-center"
                        onClick={() =>
                          setFilterValue(
                            "scanPreset",
                            filters.scanPreset === "shadow-remove" ? "none" : "shadow-remove",
                          )
                        }
                      >
                        <Wand2 className="size-4 mb-1 text-blue-500" />
                        <span className="text-xs font-semibold">Shadow Fix</span>
                        <span className="text-[9px] text-muted-foreground">Remove glare/shadows</span>
                      </Button>

                      <Button
                        type="button"
                        variant={!filters.scanPreset || filters.scanPreset === "none" ? "default" : "outline"}
                        className="h-16 flex flex-col items-center justify-center p-2 text-center"
                        onClick={() => setFilterValue("scanPreset", "none")}
                      >
                        <Maximize2 className="size-4 mb-1" />
                        <span className="text-xs font-semibold">Original</span>
                        <span className="text-[9px] text-muted-foreground">Natural photo</span>
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <h4 className="text-xs font-semibold">Additional Toggles</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={filters.grayscale ? "default" : "outline"}
                        className="text-xs"
                        onClick={() => setFilterValue("grayscale", !filters.grayscale)}
                      >
                        Grayscale
                      </Button>
                      <Button
                        type="button"
                        variant={filters.sharpen > 0 ? "default" : "outline"}
                        className="text-xs"
                        onClick={() =>
                          setFilterValue("sharpen", filters.sharpen > 0 ? 0 : 40)
                        }
                      >
                        Sharpen {filters.sharpen > 0 ? "✓" : ""}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Crop Tab */}
              {tab === "crop" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {CROP_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        variant={cropPreset === preset.id ? "default" : "outline"}
                        size="sm"
                        className="min-h-[40px] text-xs"
                        onClick={() => applyCropPreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px] text-xs"
                      onClick={() => {
                        setCrop(null);
                        setCropPreset("free");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Drag the frame or corner handles to set the crop area.
                  </p>
                </div>
              )}

              {/* 4. Rotate Tab */}
              {tab === "rotate" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] text-xs"
                      onClick={() => setRotation((r) => (r + 270) % 360)}
                    >
                      <RotateCcw className="size-4" />
                      Rotate left
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] text-xs"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                    >
                      <RotateCw className="size-4" />
                      Rotate right
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] text-xs"
                      aria-pressed={flipH}
                      onClick={() => setFlipH((f) => !f)}
                    >
                      <FlipHorizontal className="size-4" />
                      Flip H
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] text-xs"
                      aria-pressed={flipV}
                      onClick={() => setFlipV((f) => !f)}
                    >
                      <FlipVertical className="size-4" />
                      Flip V
                    </Button>
                  </div>
                </div>
              )}

              {/* 5. Adjust Tab */}
              {tab === "adjust" && (
                <div className="space-y-5">
                  {(
                    [
                      ["brightness", "Brightness", 50, 150],
                      ["contrast", "Contrast", 50, 150],
                      ["saturation", "Saturation", 0, 200],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`editor-${key}`} className="text-xs">{label}</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {filters[key]}%
                        </span>
                      </div>
                      <Slider
                        id={`editor-${key}`}
                        min={min}
                        max={max}
                        step={1}
                        value={[filters[key]]}
                        onValueChange={([v]) => setFilterValue(key, v)}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={resetAll}
                  >
                    Reset All Edits
                  </Button>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-2 border-t p-3">
              {hasEdits ? (
                <span className="hand-note text-xs">Unsaved edits</span>
              ) : (
                <span className="text-xs text-muted-foreground">No changes</span>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleApply} disabled={!imgLoaded}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
