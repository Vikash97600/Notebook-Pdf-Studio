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
} from "lucide-react";

interface ImageEditorDialogProps {
  image: StudioImage | null;
  open: boolean;
  onApply: (
    id: string,
    patch: {
      rotation: number;
      crop: { x: number; y: number; w: number; h: number } | null;
      filters: ImageFilters;
      flipH: boolean;
      flipV: boolean;
    },
  ) => void;
  onClose: () => void;
}

type EditorTab = "rotate" | "crop" | "adjust" | "filter";

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

/** Draw rotation+crop+flip+filters into a canvas and return a JPEG data URL. */
function renderEditorPreview(
  img: HTMLImageElement,
  rotation: number,
  crop: CropRect | null,
  filters: ImageFilters,
  flipH: boolean,
  flipV: boolean,
): string {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
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
  // White base so transparent PNGs don't render black in the JPEG preview.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Draw the source at full crop resolution, then scale the whole context to
  // the preview canvas — fills exactly for every rotation angle.
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
  ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
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

/**
 * Image editor: rotate, crop with aspect presets, flip, adjust, filter.
 * All edits are previews until "Apply" — the original file is never modified.
 */
export function ImageEditorDialog({
  image,
  open,
  onApply,
  onClose,
}: ImageEditorDialogProps) {
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [filters, setFilters] = useState<ImageFilters>(NEUTRAL_FILTERS);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [tab, setTab] = useState<EditorTab>("rotate");
  const [cropPreset, setCropPreset] = useState("free");
  const [previewUrl, setPreviewUrl] = useState("");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    kind: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    rect: CropRect;
  } | null>(null);

  // Seed editor state from the image being edited.
  useEffect(() => {
    if (!image || !open) return;
    setRotation(image.rotation);
    setCrop(image.crop ? { ...image.crop } : null);
    setFilters({ ...image.filters });
    setFlipH(image.flipH);
    setFlipV(image.flipV);
    setTab("rotate");
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

  // Re-render the preview whenever any edit changes.
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const url = renderEditorPreview(imgRef.current, rotation, crop, filters, flipH, flipV);
    setPreviewUrl(url);
  }, [imgLoaded, rotation, crop, filters, flipH, flipV]);

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
    (key: keyof ImageFilters, value: number | boolean) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetAll = useCallback(() => {
    setRotation(0);
    setCrop(null);
    setFilters(NEUTRAL_FILTERS);
    setFlipH(false);
    setFlipV(false);
    setCropPreset("free");
  }, []);

  const handleApply = useCallback(() => {
    if (!image) return;
    onApply(image.id, { rotation, crop, filters, flipH, flipV });
    onClose();
  }, [image, rotation, crop, filters, flipH, flipV, onApply, onClose]);

  const hasEdits =
    rotation !== 0 || crop !== null || flipH || flipV || !isNeutralFilters(filters);

  /* ------------------------- crop dragging ------------------------- */

  const updateCropOnPointer = useCallback(
    (event: PointerEvent) => {
      if (!drag || !frameRef.current) return;
      const bounds = frameRef.current.getBoundingClientRect();
      const dx = (event.clientX - drag.startX) / bounds.width;
      const dy = (event.clientY - drag.startY) / bounds.height;
      const rect = { ...drag.rect };
      if (drag.kind === "move") {
        rect.x += dx;
        rect.y += dy;
      } else {
        if (drag.kind.includes("n")) {
          rect.y += dy;
          rect.h -= dy;
        }
        if (drag.kind.includes("s")) {
          rect.h += dy;
        }
        if (drag.kind.includes("w")) {
          rect.x += dx;
          rect.w -= dx;
        }
        if (drag.kind.includes("e")) {
          rect.w += dx;
        }
      }
      setCrop(clampRect(rect));
    },
    [drag],
  );

  const beginDrag = useCallback(
    (kind: "move" | "nw" | "ne" | "sw" | "se") =>
      (event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const startRect: CropRect = crop
          ? { ...crop }
          : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
        if (!crop) setCrop(startRect);
        setDrag({ kind, startX: event.clientX, startY: event.clientY, rect: startRect });
      },
    [crop],
  );

  const endDrag = useCallback(() => setDrag(null), []);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => updateCropOnPointer(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", endDrag);
    };
  }, [drag, updateCropOnPointer, endDrag]);

  const cropStyle = useMemo(() => {
    if (!crop) return null;
    return {
      left: `${crop.x * 100}%`,
      top: `${crop.y * 100}%`,
      width: `${crop.w * 100}%`,
      height: `${crop.h * 100}%`,
    };
  }, [crop]);

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[88vh]">
        <DialogHeader className="border-b px-4 py-3 text-left">
          <DialogTitle className="truncate text-base">Edit — {image.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Rotate, crop and adjust this image before adding it to the PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Preview pane with crop overlay */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-3">
            <div ref={frameRef} className="relative inline-block max-h-full max-w-full">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Editing preview"
                  className="max-h-[46vh] max-w-full rounded-md object-contain shadow-md md:max-h-[62vh]"
                  draggable={false}
                />
              ) : (
                <div className="flex h-64 w-72 items-center justify-center rounded-md bg-muted">
                  <span className="text-sm text-muted-foreground">Loading preview…</span>
                </div>
              )}
              {tab === "crop" && cropStyle && (
                <div
                  className="absolute cursor-move rounded-sm border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={cropStyle}
                  onPointerDown={beginDrag("move")}
                >
                  {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      tabIndex={-1}
                      className={cn(
                        "absolute size-5 rounded-full border-2 border-white bg-primary/80",
                        handle === "nw" && "-left-2.5 -top-2.5 cursor-nwse-resize",
                        handle === "ne" && "-right-2.5 -top-2.5 cursor-nesw-resize",
                        handle === "sw" && "-bottom-2.5 -left-2.5 cursor-nesw-resize",
                        handle === "se" && "-bottom-2.5 -right-2.5 cursor-nwse-resize",
                      )}
                      onPointerDown={beginDrag(handle)}
                      aria-label={`Crop handle ${handle}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Controls pane */}
          <div className="flex w-full shrink-0 flex-col border-t md:w-72 md:border-l md:border-t-0">
            <div
              className="flex gap-1 border-b p-2"
              role="tablist"
              aria-label="Editor tools"
            >
              {(
                [
                  ["rotate", "Rotate"],
                  ["crop", "Crop"],
                  ["adjust", "Adjust"],
                  ["filter", "Filter"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "min-h-[36px] flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors",
                    tab === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {tab === "rotate" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => setRotation((r) => (r + 270) % 360)}
                    >
                      <RotateCcw className="size-4" />
                      Rotate left
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                    >
                      <RotateCw className="size-4" />
                      Rotate right
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px]"
                      aria-pressed={flipH}
                      onClick={() => setFlipH((f) => !f)}
                    >
                      <FlipHorizontal className="size-4" />
                      Flip H
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px]"
                      aria-pressed={flipV}
                      onClick={() => setFlipV((f) => !f)}
                    >
                      <FlipVertical className="size-4" />
                      Flip V
                    </Button>
                  </div>
                  <p className="hand-note text-xs">Tip: crop works best after rotating.</p>
                </div>
              )}

              {tab === "crop" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {CROP_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        variant={cropPreset === preset.id ? "default" : "outline"}
                        size="sm"
                        className="min-h-[40px]"
                        onClick={() => applyCropPreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => {
                        setCrop(null);
                        setCropPreset("free");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Drag the frame or its corner handles to set the crop area.
                  </p>
                </div>
              )}

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
                        <Label htmlFor={`editor-${key}`}>{label}</Label>
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
                  <p className="hand-note text-xs">
                    Adjustments are baked into the PDF page.
                  </p>
                </div>
              )}

              {tab === "filter" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={filters.grayscale ? "default" : "outline"}
                      className="min-h-[44px]"
                      aria-pressed={filters.grayscale}
                      onClick={() => setFilterValue("grayscale", !filters.grayscale)}
                    >
                      <Sparkles className="size-4" />
                      Grayscale
                    </Button>
                    <Button
                      type="button"
                      variant={filters.sharpen > 0 ? "default" : "outline"}
                      className="min-h-[44px]"
                      aria-pressed={filters.sharpen > 0}
                      onClick={() =>
                        setFilterValue("sharpen", filters.sharpen > 0 ? 0 : 40)
                      }
                    >
                      Sharpen {filters.sharpen > 0 ? "on" : "off"}
                    </Button>
                    <Button
                      type="button"
                      variant={filters.blur > 0 ? "default" : "outline"}
                      className="min-h-[44px]"
                      aria-pressed={filters.blur > 0}
                      onClick={() => setFilterValue("blur", filters.blur > 0 ? 0 : 2)}
                    >
                      Blur {filters.blur > 0 ? "on" : "off"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={resetAll}
                    >
                      Reset all
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sharpen and blur are applied when the page is rendered.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t p-3">
              {hasEdits ? (
                <span className="hand-note text-xs">Unsaved edits</span>
              ) : (
                <span className="text-xs text-muted-foreground">No changes yet</span>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleApply} disabled={!imgLoaded}>
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
