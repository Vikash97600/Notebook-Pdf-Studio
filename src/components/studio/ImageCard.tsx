import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/pdf-meta";
import type { StudioImage } from "@/types/studio";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useId } from "react";

interface ImageCardProps {
  image: StudioImage;
  index: number;
  total: number;
  /** Grid item is draggable from this card (desktop HTML5 DnD). */
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDrop?: (index: number) => void;
  onRotate: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

/**
 * One page card in the workspace grid. Shows the thumbnail, page number,
 * filename/size, and per-card actions (rotate, edit, duplicate, remove, move).
 */
export function ImageCard({
  image,
  index,
  total,
  onDragStart,
  onDragOver,
  onDrop,
  onRotate,
  onEdit,
  onDuplicate,
  onRemove,
  onToggleSelect,
  onMove,
}: ImageCardProps) {
  const selectLabelId = useId();

  return (
    <div
      draggable={Boolean(onDragStart)}
      onDragStart={
        onDragStart
          ? (e) => {
              // Firefox refuses to start a DnD session without payload data.
              e.dataTransfer.setData("text/plain", String(index));
              e.dataTransfer.effectAllowed = "move";
              onDragStart(index);
            }
          : undefined
      }
      onDragOver={onDragOver ? (e) => { e.preventDefault(); onDragOver(index); } : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(index); } : undefined}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md",
        image.selected && "ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        className="relative block w-full cursor-zoom-in"
        onClick={() => onEdit(image.id)}
        aria-label={`Edit page ${index + 1}: ${image.name}`}
      >
        <img
          src={image.thumbnailUrl}
          alt={`Page ${index + 1} thumbnail`}
          className="aspect-[4/3] w-full bg-muted object-contain"
          draggable={false}
          loading="lazy"
        />
        <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {index + 1}
        </span>
        {image.selected && (
          <span className="absolute inset-0 bg-primary/10" aria-hidden="true" />
        )}
      </button>

      <div className="flex items-center justify-between gap-1 border-t px-2 py-1.5">
        <label
          htmlFor={selectLabelId}
          className="flex min-w-0 items-center gap-1.5 text-xs"
        >
          <input
            id={selectLabelId}
            type="checkbox"
            className="size-3.5 accent-[var(--primary)]"
            checked={image.selected}
            onChange={() => onToggleSelect(image.id)}
            aria-label={`Select page ${index + 1}`}
          />
          <span className="truncate text-muted-foreground" title={image.name}>
            {formatBytes(image.sizeBytes)}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onRotate(image.id)}
            aria-label={`Rotate page ${index + 1} clockwise`}
          >
            <RotateCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onEdit(image.id)}
            aria-label={`Edit page ${index + 1}`}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onDuplicate(image.id)}
            aria-label={`Duplicate page ${index + 1}`}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onRemove(image.id)}
            aria-label={`Remove page ${index + 1}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="truncate px-2 pb-1.5 text-[11px] text-muted-foreground" title={image.name}>
        {image.name}
      </p>

      {onMove && (
        <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-6 shadow"
            disabled={index === 0}
            onClick={() => onMove(image.id, -1)}
            aria-label={`Move page ${index + 1} earlier`}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-6 shadow"
            disabled={index === total - 1}
            onClick={() => onMove(image.id, 1)}
            aria-label={`Move page ${index + 1} later`}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
