import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, X } from "lucide-react";
import { signedPreviewUrls } from "@/lib/notes-store";

/**
 * "Preview Sample Pages" modal — shows the 2–4 sample page screenshots an
 * admin uploaded for a note pack. It never opens the full PDF.
 */
export function SamplePagesModal({
  open,
  onClose,
  paths,
}: {
  open: boolean;
  onClose: () => void;
  paths: string[];
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || paths.length === 0) return;
    let active = true;
    setLoading(true);
    void signedPreviewUrls(paths)
      .then((u) => {
        if (active) setUrls(u);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, paths]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preview sample pages"
      className="fixed inset-0 z-[95] flex flex-col bg-background/95 backdrop-blur"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
          <ImageIcon className="h-4 w-4 text-accent-amber" aria-hidden /> Preview Sample Pages
        </p>
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-card ring-1 ring-border"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-8">
        {paths.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Sample preview pages coming soon.
          </p>
        ) : loading && urls.length === 0 ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {paths.map((p) => (
              <span key={p} className="block h-72 w-full animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : urls.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Sample preview pages coming soon.
          </p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {urls.map((src, i) => (
              <figure key={src} className="overflow-hidden rounded-2xl ring-1 ring-border">
                <img
                  src={src}
                  alt={`Sample page ${i + 1} of this note pack`}
                  loading="lazy"
                  className="h-auto w-full"
                />
                <figcaption className="bg-card px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Page {i + 1} / {urls.length}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
