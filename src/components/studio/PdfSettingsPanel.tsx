import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  FIT_DESCRIPTIONS,
  MARGIN_MM,
  QUALITY_DESCRIPTIONS,
  type ImageFit,
  type MarginSize,
  type Orientation,
  type PageNumberFormat,
  type PageNumberPosition,
  type PageSizeName,
  type PdfSettings,
  type QualityPreset,
  type TextAlignment,
} from "@/lib/pdf-meta";
import { AlertCircle } from "lucide-react";

interface PdfSettingsPanelProps {
  settings: PdfSettings;
  onChange: (patch: Partial<PdfSettings>) => void;
}

function OptionChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  columns = 3,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-3",
          columns === 4 && "grid-cols-4",
        )}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-[40px] rounded-md border px-2 py-2 text-xs font-medium transition-colors",
              value === option.value
                ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

function AlignmentPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TextAlignment;
  onChange: (v: TextAlignment) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-1" role="group" aria-label={label}>
        {(["left", "center", "right"] as const).map((align) => (
          <button
            key={align}
            type="button"
            aria-pressed={value === align}
            aria-label={`Align ${align}`}
            onClick={() => onChange(align)}
            className={cn(
              "min-h-[32px] min-w-[44px] rounded-md border px-2 py-1 text-xs capitalize",
              value === align
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/50",
            )}
          >
            {align}
          </button>
        ))}
      </div>
    </div>
  );
}

/** All PDF output configuration, grouped into labelled fieldsets. */
export function PdfSettingsPanel({ settings, onChange }: PdfSettingsPanelProps) {
  const customInvalid =
    settings.pageSize === "Custom" &&
    (settings.customSize.widthMm < 10 || settings.customSize.heightMm < 10);

  return (
    <div className="space-y-6">
      <OptionChipGroup<PageSizeName>
        label="Page size"
        value={settings.pageSize}
        options={[
          { value: "A4", label: "A4" },
          { value: "Letter", label: "Letter" },
          { value: "A3", label: "A3" },
          { value: "A5", label: "A5" },
          { value: "Legal", label: "Legal" },
          { value: "Custom", label: "Custom" },
        ]}
        onChange={(v) => onChange({ pageSize: v })}
        columns={3}
      />

      {settings.pageSize === "Custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="custom-width">Width (mm)</Label>
            <Input
              id="custom-width"
              type="number"
              min={10}
              max={2000}
              value={settings.customSize.widthMm}
              onChange={(e) =>
                onChange({
                  customSize: {
                    ...settings.customSize,
                    widthMm: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-height">Height (mm)</Label>
            <Input
              id="custom-height"
              type="number"
              min={10}
              max={2000}
              value={settings.customSize.heightMm}
              onChange={(e) =>
                onChange({
                  customSize: {
                    ...settings.customSize,
                    heightMm: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </div>
          {customInvalid && (
            <p className="col-span-2 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              Minimum size is 10 × 10 mm.
            </p>
          )}
        </div>
      )}

      <OptionChipGroup<Orientation>
        label="Orientation"
        value={settings.orientation}
        options={[
          { value: "auto", label: "Auto" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ]}
        onChange={(v) => onChange({ orientation: v })}
        columns={3}
        hint="Auto picks portrait or landscape based on each image's shape."
      />

      <OptionChipGroup<MarginSize>
        label="Margins"
        value={settings.margin}
        options={[
          { value: "none", label: "None" },
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ]}
        onChange={(v) => onChange({ margin: v })}
        columns={4}
        hint={`Current: ${MARGIN_MM[settings.margin]} mm each side`}
      />

      <OptionChipGroup<ImageFit>
        label="Image fit"
        value={settings.fit}
        options={[
          { value: "contain", label: "Contain" },
          { value: "cover", label: "Cover" },
          { value: "original", label: "Original" },
          { value: "fitToPage", label: "Fit to page" },
        ]}
        onChange={(v) => onChange({ fit: v })}
        columns={2}
        hint={FIT_DESCRIPTIONS[settings.fit]}
      />

      <OptionChipGroup<QualityPreset>
        label="Image quality"
        value={settings.quality}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "maximum", label: "Maximum" },
        ]}
        onChange={(v) => onChange({ quality: v })}
        columns={4}
        hint={QUALITY_DESCRIPTIONS[settings.quality]}
      />

      {/* Background */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Page background</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["white", "White"],
              ["black", "Black"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={settings.background === value}
              onClick={() => onChange({ background: value })}
              className={cn(
                "flex min-h-[40px] items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs font-medium",
                settings.background === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/50",
              )}
            >
              {value === "custom" && (
                <input
                  type="color"
                  aria-label="Custom background color"
                  value={settings.backgroundColor}
                  onChange={(e) =>
                    onChange({ backgroundColor: e.target.value, background: "custom" })
                  }
                  className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Page numbers */}
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Page numbers</legend>
        <div className="flex items-center justify-between">
          <Label htmlFor="page-numbers-toggle">Show page numbers</Label>
          <Switch
            id="page-numbers-toggle"
            checked={settings.pageNumbers}
            onCheckedChange={(checked) => onChange({ pageNumbers: checked })}
          />
        </div>
        {settings.pageNumbers && (
          <>
            <OptionChipGroup<PageNumberPosition>
              label="Position"
              value={settings.pageNumberPosition}
              options={[
                { value: "bottom-left", label: "Bottom left" },
                { value: "bottom-center", label: "Bottom center" },
                { value: "bottom-right", label: "Bottom right" },
              ]}
              onChange={(v) => onChange({ pageNumberPosition: v })}
              columns={3}
            />
            <OptionChipGroup<PageNumberFormat>
              label="Format"
              value={settings.pageNumberFormat}
              options={[
                { value: "n", label: "1" },
                { value: "page-n", label: "Page 1" },
                { value: "n-total", label: "1 / N" },
                { value: "page-n-of-total", label: "Page 1 of N" },
              ]}
              onChange={(v) => onChange({ pageNumberFormat: v })}
              columns={2}
            />
          </>
        )}
      </fieldset>

      {/* Header & footer */}
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Header &amp; footer</legend>
        <div className="space-y-1.5">
          <Label htmlFor="header-text">Header text</Label>
          <Input
            id="header-text"
            value={settings.headerText}
            onChange={(e) => onChange({ headerText: e.target.value })}
            placeholder="e.g. College Documents"
            maxLength={80}
          />
        </div>
        <AlignmentPicker
          label="Header alignment"
          value={settings.headerAlignment}
          onChange={(v) => onChange({ headerAlignment: v })}
        />
        <div className="space-y-1.5">
          <Label htmlFor="footer-text">Footer text</Label>
          <Input
            id="footer-text"
            value={settings.footerText}
            onChange={(e) => onChange({ footerText: e.target.value })}
            placeholder="e.g. your name"
            maxLength={80}
          />
        </div>
        <AlignmentPicker
          label="Footer alignment"
          value={settings.footerAlignment}
          onChange={(v) => onChange({ footerAlignment: v })}
        />
      </fieldset>

      {/* Metadata */}
      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">PDF metadata</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta-title">Title</Label>
            <Input
              id="meta-title"
              value={settings.title}
              onChange={(e) => onChange({ title: e.target.value })}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-author">Author</Label>
            <Input
              id="meta-author"
              value={settings.author}
              onChange={(e) => onChange({ author: e.target.value })}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-subject">Subject</Label>
            <Input
              id="meta-subject"
              value={settings.subject}
              onChange={(e) => onChange({ subject: e.target.value })}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-keywords">Keywords</Label>
            <Input
              id="meta-keywords"
              value={settings.keywords}
              onChange={(e) => onChange({ keywords: e.target.value })}
              maxLength={120}
            />
          </div>
        </div>
      </fieldset>

      {/* Filename */}
      <div className="space-y-1.5">
        <Label htmlFor="pdf-filename">File name</Label>
        <div className="flex items-center gap-2">
          <Input
            id="pdf-filename"
            value={settings.fileName}
            onChange={(e) => onChange({ fileName: sanitize(e.target.value) })}
            placeholder="notebook-to-pdf"
            maxLength={120}
          />
          <span className="text-sm text-muted-foreground">.pdf</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Invalid characters are stripped automatically.
        </p>
      </div>
    </div>
  );
}

/** Filename-safe character stripping used live in the input. */
function sanitize(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "");
}
