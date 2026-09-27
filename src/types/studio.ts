import type { ImageFilters } from "@/lib/images";

/** One page in the workspace: the original file plus its edits. */
export interface StudioImage {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  width: number;
  height: number;
  rotation: number; // 0 | 90 | 180 | 270
  crop: { x: number; y: number; w: number; h: number } | null; // 0..1 fractions
  filters: ImageFilters;
  flipH: boolean;
  flipV: boolean;
  thumbnailUrl: string;
  /** Signature of the edits the current thumbnail was rendered with. */
  thumbSignature: string;
  selected: boolean;
}

/** Result of a successful conversion. */
export interface ConversionResult {
  blob: Blob;
  fileName: string;
  sizeBytes: number;
  pages: number;
}

export type UploadSource = "file" | "camera" | "url";
