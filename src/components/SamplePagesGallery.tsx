import { useEffect, useState } from "react";
import { ImageIcon, X, ZoomIn } from "lucide-react";
import { signedPreviewUrls } from "@/lib/notes-store";

/**
 * "Preview Sample Pages" gallery — a horizontal card rail of uploaded page
 * screenshots. Tapping a page opens a full-screen zoom preview.
 */
export function SamplePagesGallery({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void signedPreviewUrls(paths).then((u) => {
      if (active) setUrls(u);
    });
    return () => {
      active = false;
    };
  }, [paths]);

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex]);

  if (paths.length === 0) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ImageIcon className="h-4 w-4 text-accent-amber" aria-hidden /> Preview Sample Pages
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Tap any page to zoom in before you buy.
      </p>

      <div className="-mx-5 mt-3 overflow-x-auto px-5">
        <div className="flex w-max gap-3">
          {(urls.length ? urls : paths).map((src, i) => (
            <button
              key={paths[i] ?? i}
              type="button"
              onClick={() => urls.length > 0 && setOpenIndex(i)}
              className="group relative h-52 w-40 shrink-0 overflow-hidden rounded-2xl bg-card ring-1 ring-border transition-transform active:scale-[0.98]"
              aria-label={`Open sample page ${i + 1} full screen`}
            >
              {urls.length > 0 ? (
                <img
                  src={src}
                  alt={`Sample page ${i + 1} of this note pack`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="block h-full w-full animate-pulse bg-muted" />
              )}
              <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-background/85 ring-1 ring-border">
                <ZoomIn className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          ))}
        </div>
      </div>

      {openIndex !== null && urls[openIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Sample page ${openIndex + 1}`}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur"
          onClick={() => setOpenIndex(null)}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Page {openIndex + 1} / {urls.length}
            </p>
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setOpenIndex(null)}
              className="grid h-9 w-9 place-items-center rounded-full bg-card ring-1 ring-border"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto px-4 pb-6">
            <img
              src={urls[openIndex]}
              alt={`Sample page ${openIndex + 1} full screen`}
              className="mx-auto h-auto w-full max-w-3xl rounded-2xl ring-1 ring-border"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </section>
  );
}
