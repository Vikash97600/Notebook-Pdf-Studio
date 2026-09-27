import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Camera,
  Edit3,
  FileDown,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { Link } from "react-router";

const FEATURES = [
  {
    icon: Camera,
    title: "Add & capture",
    body: "Upload photos or snap pages with your camera, right from your phone.",
  },
  {
    icon: Edit3,
    title: "Edit each page",
    body: "Rotate, crop, and fine-tune brightness, contrast and more.",
  },
  {
    icon: ArrowRight,
    title: "Organize pages",
    body: "Drag thumbnails into the perfect order before you convert.",
  },
  {
    icon: FileDown,
    title: "Real PDF output",
    body: "Choose page size, margins, quality — get a true PDF you can share.",
  },
] as const;

const FAQS = [
  {
    q: "Are my images uploaded anywhere?",
    a: "No. Everything runs in your browser: editing, reordering, and the PDF generation itself. Nothing is sent to a server.",
  },
  {
    q: "What formats can I add?",
    a: "JPG, JPEG, PNG, WEBP, GIF and BMP images up to 25 MB each.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes — the studio is built mobile-first, with camera capture, touch-friendly editing, and a bottom action bar.",
  },
  {
    q: "Can I add page numbers or a name?",
    a: "Yes. Turn on page numbers and add header/footer text like a course name or your name in PDF settings.",
  },
] as const;

export default function Landing() {
  const { isDark, toggle } = useTheme();

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileDown className="size-4" />
            </span>
            <span className="font-semibold">Notebook PDF Studio</span>
          </div>
          <div className="flex items-center gap-1.5">
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
            <Button asChild variant="ghost" size="sm" className="min-h-[36px]">
              <Link to="/auth?returnTo=%2Fstudio">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="min-h-[36px]">
              <Link to="/auth?returnTo=%2Fstudio">Open Studio</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="margin-line relative">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <p className="hand-note text-sm">
              ~ for students, notes → PDF the easy way ~
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Turn your images into a{" "}
              <span className="ink-underline">clean PDF</span>
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              Combine, edit, organize and convert your images into a professional
              PDF — directly in your browser. Nothing is uploaded, ever.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="min-h-[48px]">
                <Link to="/auth?returnTo=%2Fstudio">
                  Start converting
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-[48px]">
                <Link to="/auth?returnTo=%2Fstudio">
                  <Camera className="size-4" />
                  Take a photo instead
                </Link>
              </Button>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-chart-4" />
              Your files are processed locally in your browser.
            </div>
          </div>

          {/* Notebook mock */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="tape ruled-paper rounded-xl border bg-card p-5 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes.pdf
                </span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  8 pages
                </span>
              </div>
              <div className="space-y-2">
                {["Lecture 1 — Photosynthesis", "Lecture 2 — Cell structure", "Diagram — Leaf anatomy", "Summary sheet"].map(
                  (row, i) => (
                    <div
                      key={row}
                      className="flex items-center gap-2 rounded-md border bg-background/60 px-3 py-2"
                    >
                      <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="truncate text-xs">{row}</span>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div className="h-1.5 w-3/4 rounded-full bg-primary" />
                </div>
                <span className="hand-note text-[11px]">~ done!</span>
              </div>
            </div>
            <p className="hand-note mt-3 text-center text-xs">
              your notes, but tidier ↓
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="ruled-paper border-y">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Everything a student needs
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow + privacy */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">How it works</h2>
            <ol className="mt-6 space-y-3">
              {[
                "Add images or take photos of your notes",
                "Rotate, crop, and enhance each page",
                "Drag to reorder — the PDF follows your order",
                "Configure page size, quality, page numbers",
                "Convert, preview, then download or share",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="dashed-frame rounded-xl bg-card p-6">
            <h2 className="text-2xl font-bold">Privacy first</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your images are processed locally in your browser. They are not
              uploaded to any server for normal PDF conversion — the PDF is built
              on your device, from your files.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Lock className="size-4 text-primary" />
              <span>Local processing, no accounts needed for files, ever.</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-sidebar/50">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl font-bold sm:text-3xl">Questions students ask</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map(({ q, a }) => (
              <details
                key={q}
                className="group rounded-lg border bg-card px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90">
                    ›
                  </span>
                  {q}
                </summary>
                <p className="mt-2 pl-6 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to hand in something{" "}
            <span className="ink-underline">spotless</span>?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Open the studio, add your pages, and walk away with a PDF.
          </p>
          <Button asChild size="lg" className="mt-6 min-h-[48px]">
            <Link to="/auth?returnTo=%2Fstudio">
              Open Notebook PDF Studio
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:flex-row">
          <span>Notebook PDF Studio — images to PDF, locally.</span>
          <span>v1.0.0 · Runs entirely in your browser</span>
        </div>
      </footer>
    </div>
  );
}
