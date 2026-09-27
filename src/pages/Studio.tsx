import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import {
  createThumbnail,
  loadImageElement,
  NEUTRAL_FILTERS,
  renderProcessedImage,
  validateImageFile,
  type ImageFilters,
} from "@/lib/images";
import {
  DEFAULT_PDF_SETTINGS,
  formatBytes,
  pdfFileName,
  type PdfSettings,
} from "@/lib/pdf-meta";
import { generatePdfFromImages } from "@/lib/pdf";
import {
  ArrowRightLeft,
  CheckSquare,
  Eye,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  List,
  LayoutGrid,
  LogOut,
  Moon,
  Pencil,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Trash2,
} from "lucide-react";
import { UploadZone } from "@/components/studio/UploadZone";
import { ImageCard } from "@/components/studio/ImageCard";
import { ImageEditorDialog } from "@/components/studio/ImageEditorDialog";
import { PdfSettingsPanel } from "@/components/studio/PdfSettingsPanel";
import { ConvertDialog } from "@/components/studio/ConvertDialog";
import { PreviewDialog } from "@/components/studio/PreviewDialog";
import { OcrDialog } from "@/components/studio/OcrDialog";
import { PdfWordConverterDialog } from "@/components/studio/PdfWordConverterDialog";
import { extractPdfPagesAsImages } from "@/lib/pdf-word";
import type { StudioImage } from "@/types/studio";
import type { OcrPageResult } from "@/lib/ocr";
import type { PerspectiveQuad } from "@/lib/scanner";

const SETTINGS_STORAGE_KEY = "nps-pdf-settings";
const VIEW_STORAGE_KEY = "nps-view-mode";

type ViewMode = "grid" | "list";

function defaultSettings(): PdfSettings {
  return {
    ...DEFAULT_PDF_SETTINGS,
    customSize: { ...DEFAULT_PDF_SETTINGS.customSize },
  };
}

function loadStoredSettings(): PdfSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<PdfSettings>;
    return {
      ...defaultSettings(),
      ...parsed,
      customSize: { ...DEFAULT_PDF_SETTINGS.customSize, ...(parsed.customSize ?? {}) },
    };
  } catch {
    return defaultSettings();
  }
}

function loadStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function makeId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function signatureOf(patch: {
  rotation: number;
  crop: { x: number; y: number; w: number; h: number } | null;
  perspectiveQuad?: PerspectiveQuad | null;
  filters: ImageFilters;
  flipH: boolean;
  flipV: boolean;
}): string {
  const quadStr = patch.perspectiveQuad
    ? `${patch.perspectiveQuad.tl.x.toFixed(3)},${patch.perspectiveQuad.tl.y.toFixed(3)}-${patch.perspectiveQuad.tr.x.toFixed(3)},${patch.perspectiveQuad.tr.y.toFixed(3)}-${patch.perspectiveQuad.br.x.toFixed(3)},${patch.perspectiveQuad.br.y.toFixed(3)}-${patch.perspectiveQuad.bl.x.toFixed(3)},${patch.perspectiveQuad.bl.y.toFixed(3)}`
    : "none";
  return `${patch.rotation}|${patch.crop ? `${patch.crop.x},${patch.crop.y},${patch.crop.w},${patch.crop.h}` : "none"}|${quadStr}|${patch.filters.brightness},${patch.filters.contrast},${patch.filters.saturation},${patch.filters.grayscale},${patch.filters.blur},${patch.filters.sharpen},${patch.filters.scanPreset || "none"}|${patch.flipH ? 1 : 0},${patch.flipV ? 1 : 0}`;
}

export default function Studio() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();
  const [images, setImages] = useState<StudioImage[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(loadStoredView);
  const [settings, setSettings] = useState<PdfSettings>(loadStoredSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrImageId, setOcrImageId] = useState<string | null>(null);
  const [pdfWordOpen, setPdfWordOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const imagesRef = useRef<StudioImage[]>([]);
  imagesRef.current = images;

  const handleUpdateImageOcr = useCallback((id: string, result: OcrPageResult) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ocrResult: result } : img)),
    );
  }, []);

  // Persist PDF settings and view mode.
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  /* ----------------------------- adding images & PDFs ----------------------------- */

  const addFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    const accepted: StudioImage[] = [];
    let rejected = 0;

    for (const file of files) {
      // If PDF file, extract all pages as images
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        try {
          toast.info(`Extracting pages from "${file.name}"…`);
          const pageFiles = await extractPdfPagesAsImages(file);
          for (const pFile of pageFiles) {
            const el = await loadImageElement(pFile);
            accepted.push({
              id: makeId(),
              file: pFile,
              name: pFile.name,
              sizeBytes: pFile.size,
              width: el.naturalWidth,
              height: el.naturalHeight,
              rotation: 0,
              crop: null,
              filters: { ...NEUTRAL_FILTERS },
              flipH: false,
              flipV: false,
              thumbnailUrl: createThumbnail(el),
              thumbSignature: "",
              selected: false,
            });
          }
          continue;
        } catch (err) {
          console.error("PDF import error", err);
          toast.error(`Failed to extract pages from "${file.name}".`);
          rejected++;
          continue;
        }
      }

      const error = validateImageFile(file);
      if (error) {
        toast.error(error);
        rejected++;
        continue;
      }
      try {
        const el = await loadImageElement(file);
        accepted.push({
          id: makeId(),
          file,
          name: file.name,
          sizeBytes: file.size,
          width: el.naturalWidth,
          height: el.naturalHeight,
          rotation: 0,
          crop: null,
          filters: { ...NEUTRAL_FILTERS },
          flipH: false,
          flipV: false,
          thumbnailUrl: createThumbnail(el),
          thumbSignature: "",
          selected: false,
        });
      } catch {
        toast.error(`We couldn't read "${file.name}". The file may be corrupted.`);
        rejected++;
      }
    }
    if (accepted.length > 0) {
      setImages((prev) => [...prev, ...accepted]);
      toast.success(
        `Added ${accepted.length} image${accepted.length === 1 ? "" : "s"}` +
          (rejected > 0 ? ` · ${rejected} skipped` : ""),
      );
    }
    setIsProcessing(false);
  }, []);

  /* --------------------------- per-image actions --------------------------- */

  const handleRotate = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, rotation: (img.rotation + 90) % 360 } : img,
      ),
    );
  }, []);

  // Thumbnails must reflect quick rotations too — regenerate them after the
  // rotation state settles so the grid is always WYSIWYG.
  useEffect(() => {
    if (editorId !== null) return; // editor dialog applies its own thumbnails
    const stale = images.filter(
      (img) =>
        img.thumbSignature !== signatureOf(img),
    );
    if (stale.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const img of stale) {
        try {
          const el = await loadImageElement(img.file);
          const processed = renderProcessedImage(el, {
            rotation: img.rotation,
            crop: img.crop,
            perspectiveQuad: img.perspectiveQuad,
            filters: img.filters,
            maxSide: 320,
            flipH: img.flipH,
            flipV: img.flipV,
          });
          if (cancelled) return;
          setImages((prev) =>
            prev.map((item) =>
              item.id === img.id
                ? {
                    ...item,
                    thumbnailUrl: processed.dataUrl,
                    thumbSignature: signatureOf(item),
                  }
                : item,
            ),
            );
        } catch {
          /* keep the old thumbnail */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [images, editorId]);

  const handleDuplicate = useCallback((id: string) => {
    setImages((prev) => {
      const idx = prev.findIndex((img) => img.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const copy: StudioImage = {
        ...original,
        id: makeId(),
        selected: false,
        filters: { ...original.filters },
        crop: original.crop ? { ...original.crop } : null,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    toast.success("Image duplicated");
  }, []);

  const handleRemove = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    toast.success("Image removed");
  }, []);

  /* --------------------------- reorder & selection -------------------------- */

  const handleMove = useCallback((id: string, direction: -1 | 1) => {
    setImages((prev) => {
      const from = prev.findIndex((img) => img.id === id);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  // ImageCard preventDefaults dragover so the drop event can fire.
  const handleDragOverCard = useCallback((_index: number) => {
    /* index tracked via dragIndexRef on drop */
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from === null || from === targetIndex) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, selected: !img.selected } : img)),
    );
  }, []);

  const selectedCount = images.filter((img) => img.selected).length;
  const anySelected = selectedCount > 0;

  const handleSelectAll = useCallback(() => {
    setImages((prev) => prev.map((img) => ({ ...img, selected: true })));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setImages((prev) => prev.map((img) => ({ ...img, selected: false })));
  }, []);

  const handleRotateSelected = useCallback(() => {
    setImages((prev) =>
      prev.map((img) =>
        img.selected ? { ...img, rotation: (img.rotation + 90) % 360 } : img,
      ),
    );
  }, []);

  const confirmThen = useCallback((message: string, action: () => void) => {
    if (window.confirm(message)) action();
  }, []);

  const handleRemoveSelected = useCallback(() => {
    confirmThen(
      `Remove ${selectedCount} selected image${selectedCount === 1 ? "" : "s"}? This cannot be undone.`,
      () => {
        setImages((prev) => prev.filter((img) => !img.selected));
        toast.success("Images removed");
      },
    );
  }, [selectedCount, confirmThen]);

  const handleClearAll = useCallback(() => {
    confirmThen("Remove all images? This cannot be undone.", () => {
      setImages([]);
      toast.success("Workspace cleared");
    });
  }, [confirmThen]);

  /* ------------------------------ editing ---------------------------------- */

  const editingImage = useMemo(
    () => images.find((img) => img.id === editorId) ?? null,
    [images, editorId],
  );

  const handleEditorApply = useCallback(
    (
      id: string,
      patch: {
        rotation: number;
        crop: { x: number; y: number; w: number; h: number } | null;
        perspectiveQuad?: PerspectiveQuad | null;
        filters: ImageFilters;
        flipH: boolean;
        flipV: boolean;
      },
    ) => {
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, ...patch } : img)),
      );
      toast.success("Edits applied");
      // Regenerate the thumbnail so the grid reflects rotation/crop/filters.
      void (async () => {
        const target = imagesRef.current.find((img) => img.id === id);
        if (!target) return;
        try {
          const el = await loadImageElement(target.file);
          const processed = renderProcessedImage(el, {
            rotation: patch.rotation,
            crop: patch.crop,
            perspectiveQuad: patch.perspectiveQuad,
            filters: patch.filters,
            maxSide: 320,
            flipH: patch.flipH,
            flipV: patch.flipV,
          });
          setImages((prev) =>
            prev.map((img) =>
              img.id === id
                ? { ...img, thumbnailUrl: processed.dataUrl, thumbSignature: signatureOf(patch) }
                : img,
            ),
          );
        } catch {
          /* keep the old thumbnail */
        }
      })();
    },
    [],
  );

  /* --------------------------- convert & preview --------------------------- */

  const openConvert = useCallback(() => {
    if (images.length === 0) {
      toast.error("Add at least one image first.");
      return;
    }
    setConvertOpen(true);
  }, [images.length]);

  const openPreview = useCallback(() => {
    if (images.length === 0) {
      toast.error("Add at least one image first.");
      return;
    }
    setPreviewPending(true);
    setPreviewOpen(true);
  }, [images.length]);

  // Generate the preview PDF from the current workspace when requested.
  useEffect(() => {
    if (!previewPending || images.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await generatePdfFromImages(images, settings, () => {});
        if (cancelled) return;
        const url = URL.createObjectURL(result.blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err) {
        console.error("Preview generation failed", err);
        toast.error("Preview generation failed.");
        setPreviewOpen(false);
      } finally {
        if (!cancelled) setPreviewPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewPending, images, settings]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate("/");
  }, [signOut, navigate]);

  /* --------------------------- keyboard shortcuts --------------------------- */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      // Never hijack keys while a dialog (editor/convert/preview) is open.
      if (document.querySelector("[role=\"dialog\"]")) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        addInputRef.current?.click();
        return;
      }
      if (event.key === "Delete" && anySelected) {
        event.preventDefault();
        handleRemoveSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [anySelected, handleRemoveSelected]);

  const totalBytes = useMemo(
    () => images.reduce((sum, img) => sum + img.sizeBytes, 0),
    [images],
  );

  const updateSettings = useCallback((patch: Partial<PdfSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings());
    toast.success("Settings reset to defaults");
  }, []);

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <FilePlus2 className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">
                Notebook PDF Studio
              </h1>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Images → PDF, right in your browser
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary"
              onClick={() => setPdfWordOpen(true)}
            >
              <ArrowRightLeft className="size-3.5" />
              PDF ⇄ Word
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 lg:hidden"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open PDF settings"
            >
              <SlidersHorizontal className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={toggle}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[250px_minmax(0,1fr)_330px]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <div className="tape rounded-xl border bg-card p-4 space-y-2">
              <h2 className="text-sm font-semibold">Add pages</h2>
              <p className="text-xs text-muted-foreground">
                Photos, scans, notes, or existing PDFs.
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => addInputRef.current?.click()}
              >
                <FolderOpen className="size-4" />
                Add images / PDFs
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs gap-1.5"
                onClick={() => setPdfWordOpen(true)}
              >
                <ArrowRightLeft className="size-3.5" />
                PDF ⇄ Word Hub
              </Button>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Workspace</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {images.length}
              </p>
              <p className="text-xs text-muted-foreground">
                image{images.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
              </p>
              {images.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 w-full text-xs text-destructive hover:text-destructive"
                  onClick={handleClearAll}
                >
                  Clear all
                </Button>
              )}
            </div>
            <p className="hand-note px-1 text-xs leading-relaxed">
              Privacy note: every conversion runs locally — your images are never
              uploaded.
            </p>
          </div>
        </aside>

        {/* Main workspace */}
        <section className="min-w-0 space-y-4">
          {images.length === 0 ? (
            <>
              <div className="text-center">
                <h2 className="ink-underline inline-block text-2xl font-bold sm:text-3xl">
                  Convert Images to PDF
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Combine, edit, organize and convert your images into a
                  professional PDF — directly in your browser.
                </p>
              </div>
              <UploadZone onFiles={(files) => void addFiles(files)} />
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-semibold">How it works</h3>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>Add images or take photos</li>
                  <li>Rotate, crop and adjust each page</li>
                  <li>Drag to set the page order</li>
                  <li>Choose PDF settings and convert</li>
                </ol>
              </div>
            </>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{images.length}</span>{" "}
                  images · {formatBytes(totalBytes)}
                  {anySelected && (
                    <span className="text-foreground"> · {selectedCount} selected</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[36px] gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
                    onClick={() => {
                      setOcrImageId(images[0]?.id ?? null);
                      setOcrOpen(true);
                    }}
                  >
                    <Sparkles className="size-3.5" />
                    Extract Notes (OCR)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[36px]"
                    onClick={anySelected ? handleDeselectAll : handleSelectAll}
                  >
                    {anySelected ? (
                      <Square className="size-3.5" />
                    ) : (
                      <CheckSquare className="size-3.5" />
                    )}
                    {anySelected ? "Deselect all" : "Select all"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[36px]"
                    disabled={!anySelected}
                    onClick={handleRotateSelected}
                  >
                    <RotateCw className="size-3.5" />
                    Rotate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[36px] text-destructive hover:text-destructive"
                    disabled={!anySelected}
                    onClick={handleRemoveSelected}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                  <div className="flex overflow-hidden rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-none"
                      aria-pressed={viewMode === "grid"}
                      aria-label="Grid view"
                      onClick={() => setViewMode("grid")}
                    >
                      <LayoutGrid className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-none"
                      aria-pressed={viewMode === "list"}
                      aria-label="List view"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Grid / list */}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {images.map((img, index) => (
                    <ImageCard
                      key={img.id}
                      image={img}
                      index={index}
                      total={images.length}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOverCard}
                      onDrop={handleDrop}
                      onRotate={handleRotate}
                      onEdit={setEditorId}
                      onDuplicate={handleDuplicate}
                      onRemove={handleRemove}
                      onToggleSelect={handleToggleSelect}
                      onMove={handleMove}
                      onOcr={(id) => {
                        setOcrImageId(id);
                        setOcrOpen(true);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(index));
                        e.dataTransfer.effectAllowed = "move";
                        handleDragStart(index);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(index);
                      }}
                      className="flex items-center gap-3 rounded-lg border bg-card p-2"
                    >
                      <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <img
                        src={img.thumbnailUrl}
                        alt={`Page ${index + 1} thumbnail`}
                        className="size-12 rounded object-cover"
                        draggable={false}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{img.name}</p>
                          {img.ocrResult && (
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              OCR
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {img.width} × {img.height} · {formatBytes(img.sizeBytes)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          onClick={() => {
                            setOcrImageId(img.id);
                            setOcrOpen(true);
                          }}
                          aria-label={`Extract text for page ${index + 1}`}
                          title="Extract text / OCR"
                        >
                          <FileText className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          onClick={() => handleRotate(img.id)}
                          aria-label={`Rotate page ${index + 1}`}
                        >
                          <RotateCw className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          onClick={() => setEditorId(img.id)}
                          aria-label={`Edit page ${index + 1}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(img.id)}
                          aria-label={`Remove page ${index + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Settings panel (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">PDF settings</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={resetSettings}
              >
                Reset
              </Button>
            </div>
            <PdfSettingsPanel settings={settings} onChange={updateSettings} />
            <div className="mt-6 space-y-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={openPreview}
                disabled={images.length === 0}
              >
                <Eye className="size-4" />
                Preview PDF
              </Button>
              <Button
                type="button"
                className="w-full"
                onClick={openConvert}
                disabled={images.length === 0}
              >
                <FileDown className="size-4" />
                Convert &amp; Download PDF
              </Button>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile bottom action bar */}
      {images.length > 0 && (
        <div
          className="sticky bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <div className="flex items-center gap-1.5 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] flex-1 px-2 text-xs"
              onClick={() => addInputRef.current?.click()}
            >
              <FolderOpen className="size-4" />
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] flex-1 px-2 text-xs"
              onClick={() => {
                setOcrImageId(images[0]?.id ?? null);
                setOcrOpen(true);
              }}
            >
              <Sparkles className="size-4 text-primary" />
              OCR
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] flex-1 px-2 text-xs"
              onClick={openPreview}
            >
              <Eye className="size-4" />
              Preview
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-[44px] flex-1 px-2 text-xs"
              onClick={openConvert}
            >
              <FileDown className="size-4" />
              PDF
            </Button>
          </div>
        </div>
      )}

      {/* Mobile settings bottom sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden"
        >
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-base">PDF settings</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <PdfSettingsPanel settings={settings} onChange={updateSettings} />
            <Button
              type="button"
              variant="outline"
              className="mt-6 w-full"
              onClick={resetSettings}
            >
              Reset to defaults
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Hidden add-more input */}
      <input
        ref={addInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length > 0) void addFiles(files);
        }}
        aria-label="Add images or PDFs from device"
      />

      {/* Editor */}
      <ImageEditorDialog
        image={editingImage}
        open={editorId !== null}
        onApply={handleEditorApply}
        onClose={() => setEditorId(null)}
      />

      {/* Convert */}
      <ConvertDialog
        images={images}
        settings={settings}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
      />

      {/* Preview */}
      <PreviewDialog
        blobUrl={previewUrl}
        fileName={pdfFileName(settings)}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {/* OCR & Notes Extraction Dialog */}
      <OcrDialog
        images={images}
        selectedImageId={ocrImageId}
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        onUpdateImageOcr={handleUpdateImageOcr}
      />

      {/* PDF <-> Word Converter Dialog */}
      <PdfWordConverterDialog
        open={pdfWordOpen}
        onClose={() => setPdfWordOpen(false)}
        onImportPdfPagesToWorkspace={(files) => void addFiles(files)}
      />

      {isProcessing && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border bg-card px-4 py-2 text-xs shadow-lg">
          Processing images…
        </div>
      )}
    </div>
  );
}
