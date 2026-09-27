import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_EXTENSIONS } from "@/lib/images";
import { cn } from "@/lib/utils";
import { Camera, FolderOpen, Images } from "lucide-react";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  /** Smaller inline variant used once images exist. */
  compact?: boolean;
  className?: string;
}

/**
 * Drag-and-drop / browse / camera capture entry point. The camera input uses
 * `capture="environment"` so mobile browsers open the camera directly; on
 * devices without one the picker falls back to the normal file chooser.
 */
export function UploadZone({ onFiles, compact = false, className }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = ""; // allow re-adding the same file later
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "ruled-paper dashed-frame rounded-xl bg-card/80 transition-colors",
        isDragging && "border-primary bg-primary/5",
        className,
      )}
    >
      {compact ? (
        <div className="flex flex-wrap items-center justify-center gap-3 p-4">
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            <FolderOpen className="size-4" />
            Add images
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="size-4" />
            Take photo
          </Button>
          <span className="hand-note text-xs">{ACCEPTED_EXTENSIONS}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Images className="size-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Drag &amp; drop images here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              or add them from your device
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              <FolderOpen className="size-4" />
              Add images
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="size-4" />
              Take photo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Accepts {ACCEPTED_EXTENSIONS} · up to 25 MB per image
          </p>
          <p className="hand-note max-w-sm text-xs">
            Your files stay on this device — conversion happens in your browser.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
        aria-label="Add images from device"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
        aria-label="Take a photo with your camera"
      />
    </div>
  );
}
