# Notebook PDF Studio

Turn your images into a professional PDF — combine, edit, organize, and convert,
all locally in your browser. Built mobile-first for students who want their
notes, assignments, and scans looking clean.

## Features

- **Upload or capture** — drag & drop, file picker, or camera capture on mobile
  (JPG, JPEG, PNG, WEBP, GIF, BMP; up to 25 MB per image)
- **Document Scanner & Perspective Deskew** — auto-detect notebook page corners or manually drag 4 corner pins with live homography warp to un-skew and flatten angled mobile photos
- **CamScanner-Style Magic Filters** —
  - *Magic Color*: Whitens yellowish paper and boosts ink contrast
  - *B&W Clean Threshold*: Clean binary monochrome thresholding for pencil/pen scans
  - *Shadow / Glare Fix*: Equalizes uneven room lighting and removes phone/hand shadows
- **Edit each page** — rotate, flip, crop (Free/1:1/4:3/16:9/A4), brightness,
  contrast, saturation, grayscale, sharpen, blur, reset
- **PDF ⇄ Word (.docx) Converter** — 
  - *PDF to Word*: Extract text, headings, and formatting into editable Microsoft Word (`.docx`) files with OCR fallback for scanned PDFs
  - *Word to PDF*: Parse `.docx` styles, tables, lists, and images into clean PDF documents
  - *PDF Page Import*: Import any multi-page PDF directly into the Studio workspace for editing, cropping, deskewing, and reordering
- **OCR & Text Extraction** — client-side OCR via `tesseract.js` (WASM/local), extract notes per page or batch all pages, edit extracted text, copy to clipboard, or export to Markdown (`.md`) & Text (`.txt`)
- **Searchable PDF Generation** — embed an invisible selectable OCR text layer directly into generated PDFs for searching (`Ctrl+F`), text selection, and copy-paste in PDF readers
- **Real PDF generation** — A4/A3/A5/Letter/Legal/Custom page sizes, portrait /
  landscape / auto orientation, margins, contain/cover/original/fit-to-page,
  four quality presets, custom background color
- **Finishing touches** — page numbers (position + format), header & footer
  text with alignment, PDF metadata (title/author/subject/keywords), custom
  filename
- **Preview** — page-by-page preview of the actual generated PDF (pdf.js),
  with zoom controls
- **Share or download** — Web Share API where supported, download fallback
  everywhere
- **Persistence** — your PDF settings, view mode, and theme choice are saved
  locally
- **Dark mode** — follows your system preference by default; manual override
- **Responsive & accessible** — 320 px+ layouts, 44 px touch targets,
  keyboard shortcuts (Ctrl/Cmd+O to add, Delete to remove selected),
  ARIA-labelled controls

## Technologies

- React 19 + TypeScript + Vite (frontend)
- Tailwind CSS v4 + shadcn/ui components (notebook theme)
- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation & invisible OCR text embedding
- [tesseract.js](https://github.com/naptha/tesseract.js) — in-browser OCR engine
- [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) — PDF preview
- Convex Auth — lightweight sign-in for the studio workspace
- Lucide icons, Sonner toasts, Framer Motion (subtle motion only)

## Installation

```bash
bun install
```

Run the development server (the platform hosts it for you; locally):

```bash
bun dev
```

## Usage

1. Open the app and sign in (email code or guest).
2. Add images or take photos in the Studio.
3. Tap a thumbnail to edit (rotate/crop/adjust), or use the card buttons.
4. Drag thumbnails to set page order — the PDF follows exactly this order.
5. Configure the PDF settings panel (page size, quality, page numbers…).
6. Hit **Convert & Download PDF**, or **Preview PDF** first.
7. Download or share the generated file.

## Supported Browsers

- Chrome / Edge (desktop & Android)
- Firefox
- Safari (macOS & iOS)
- Any modern browser with Canvas and File API support

## Privacy

Your images are processed **entirely in your browser** — nothing is uploaded
to a server for conversion. Editing, reordering, and PDF generation all run
locally. Files are never persisted by the app; closing the tab clears the
workspace. Only your theme/settings/view preferences are stored in
`localStorage`.

## PWA

A web app manifest is included (`public/manifest.webmanifest`) with 192/512 px
icons, standalone display, and theme colors — so the app can be installed to
your home screen / desktop where the browser supports it.

## Project Structure

```
├── index.html                 # shell: fonts, meta, no-FOUC theme script
├── public/
│   ├── manifest.webmanifest   # PWA manifest
│   ├── logo.svg
│   ├── icon-192.png / icon-512.png
├── src/
│   ├── components/
│   │   ├── studio/            # UploadZone, ImageCard, ImageEditorDialog,
│   │   │                      # PdfSettingsPanel, ConvertDialog, PreviewDialog
│   │   └── ui/                # shadcn/ui primitives
│   ├── hooks/                 # use-theme, use-auth, use-mobile
│   ├── lib/
│   │   ├── images.ts          # validation, thumbnails, render pipeline
│   │   ├── pdf.ts             # jsPDF assembly
│   │   ├── pdf-meta.ts        # page sizes, quality presets, settings model
│   │   └── theme.ts           # theme resolution/persistence
│   ├── pages/
│   │   ├── Landing.tsx        # public marketing page
│   │   ├── Studio.tsx         # the authenticated workspace
│   │   └── ...
│   └── types/studio.ts        # StudioImage model
└── LICENSE
```

## Future Improvements

- OCR text extraction (Tesseract.js, WASM, local)
- Document scanner mode with perspective correction
- Batch/multi-PDF mode and PDF merge/split
- Recent projects (opt-in, local only)

## License

[MIT](./LICENSE)
