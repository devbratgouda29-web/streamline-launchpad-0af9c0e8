import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, Download } from "lucide-react";

// pdfjs-dist references browser globals (DOMMatrix, etc.) at module scope,
// so it MUST NOT be imported statically — that crashes SSR. We dynamically
// import it (and its worker URL) inside a client-only effect.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLibPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (typeof window === "undefined") return Promise.reject(new Error("pdfjs unavailable on server"));
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const [lib, workerMod] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lib as any).GlobalWorkerOptions.workerSrc = (workerMod as any).default;
      return lib;
    })();
  }
  return pdfjsLibPromise;
}


type Props = {
  /**
   * PDF source. Accepts:
   *   - A `blob:`, `data:`, or absolute `http(s):` URL string
   *   - A raw `ArrayBuffer` / typed array of the PDF bytes
   */
  src: string | ArrayBuffer | Uint8Array;
  /** Optional file name — used for the download fallback link. */
  name?: string;
  /** Tailwind classes controlling the outer container height. */
  className?: string;
  /** When true, hides the internal Prev / page / Next bar. */
  hideControls?: boolean;
  /** Controlled page (1-based). Overrides internal state when provided. */
  page?: number;
  /** Called with the total page count once the PDF loads. */
  onNumPages?: (n: number) => void;
  /** Called when the user changes page via the internal controls. */
  onPageChange?: (page: number) => void;
};


/**
 * Normalize any accepted `src` value into a pdf.js `getDocument` parameter
 * object. pdf.js v6 requires an object with `url`, `data`, or `range` — a
 * bare string / undefined / mistyped payload throws
 * "getDocument - expected either 'data', 'range', or 'url' parameter."
 */
function toGetDocumentParams(
  src: string | ArrayBuffer | Uint8Array,
): { url: string } | { data: Uint8Array } {
  if (typeof src === "string") {
    // data: URLs are supported by pdf.js but some Chromium builds refuse to
    // fetch them inside workers — decode to bytes for maximum compatibility.
    if (src.startsWith("data:")) {
      const commaIdx = src.indexOf(",");
      const meta = src.slice(0, commaIdx);
      const payload = src.slice(commaIdx + 1);
      const isBase64 = /;base64/i.test(meta);
      if (isBase64) {
        const bin = atob(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { data: bytes };
      }
      const text = decodeURIComponent(payload);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      return { data: bytes };
    }
    return { url: src };
  }
  if (src instanceof Uint8Array) return { data: src };
  // ArrayBuffer — wrap in a fresh Uint8Array so pdf.js doesn't detach the
  // caller's buffer when the worker transfers it.
  return { data: new Uint8Array(src.slice(0)) };
}

/**
 * Inline, mobile-safe PDF viewer.
 *
 * Uses pdf.js to render each page to a <canvas>. Works on iOS Safari,
 * Android Chrome, and desktop browsers where <object>/<iframe>/<embed> for
 * PDFs is unreliable or blocked. Falls back to a download button on parse
 * failure.
 */
export function PdfViewer({ src, name, className, hideControls, page: pageProp, onNumPages, onPageChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageInner, setPageInner] = useState(1);
  const page = pageProp ?? pageInner;
  const setPage = (updater: number | ((p: number) => number)) => {
    setPageInner((prev) => {
      const base = pageProp ?? prev;
      const next = typeof updater === "function" ? (updater as (p: number) => number)(base) : updater;
      onPageChange?.(next);
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docRef = useRef<any>(null);


  // Load document.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let task: any = null;
    setLoading(true);
    setError(null);
    setNumPages(0);
    setPage(1);
    loadPdfjs()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((lib: any) => {
        if (cancelled) return;
        task = lib.getDocument(toGetDocumentParams(src));
        return task.promise;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((doc: any) => {
        if (cancelled || !doc) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        onNumPages?.(doc.numPages);
        setLoading(false);
      })

      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load PDF");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      try { task?.destroy?.(); } catch { /* ignore */ }
      try { docRef.current?.destroy?.(); } catch { /* ignore */ }
      docRef.current = null;
    };
  }, [src]);


  // Render current page.
  useEffect(() => {
    if (!docRef.current || !numPages) return;
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        const doc = docRef.current;
        const pageObj = await doc.getPage(page);
        if (cancelled) return;
        const containerWidth = container.clientWidth || 320;
        const unscaled = pageObj.getViewport({ scale: 1 });
        // Scale so the page fits container width; cap DPR at 2 for perf.
        const scale = containerWidth / unscaled.width;
        const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
        const viewport = pageObj.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D not available");
        ctx.scale(dpr, dpr);

        await pageObj.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        // Swap in.
        container.replaceChildren(canvas);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render page");
      }
    })();

    return () => { cancelled = true; };
  }, [page, numPages]);

  if (loading) {
    return (
      <div className={"flex items-center justify-center gap-2 bg-neutral-900/40 px-4 py-12 text-sm text-white/70 " + (className ?? "h-48")}>
        <Loader2 className="h-4 w-4 animate-spin" /> Preparing document…
      </div>
    );
  }

  if (error || !numPages) {
    // Only offer a download link when we have a URL string — binary buffers
    // aren't directly linkable and would double-encode as `[object …]`.
    const downloadHref = typeof src === "string" ? src : undefined;
    return (
      <div className={"flex flex-col items-center justify-center gap-3 bg-neutral-900/40 px-4 py-8 text-center text-sm text-white/80 " + (className ?? "h-48")}>
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <p>Couldn't render this PDF inline{error ? `: ${error}` : ""}.</p>
        {downloadHref && (
          <a
            href={downloadHref}
            download={name}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-amber-200"
          >
            <Download className="h-3 w-3" /> Open / download
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={"flex flex-col bg-neutral-900 " + (className ?? "")}>
      <PinchZoomStage className="flex-1 overflow-hidden bg-white">
        <div
          ref={containerRef}
          className="h-full w-full overflow-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        />
      </PinchZoomStage>
      {!hideControls && (
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/60 px-3 py-2 text-[11px] font-semibold text-white/80">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <span className="tabular-nums">Page {page} / {numPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 disabled:opacity-40"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * PinchZoomStage — wraps children in a CSS-transform container that
 * responds to two-finger pinch gestures. Ensures pinch-to-zoom scales
 * the PDF canvas rather than triggering the tablet browser's page zoom.
 *
 * One finger: passes through to child (native scrolling still works).
 * Two fingers: pinch-scales AND pans the wrapper.
 */
function PinchZoomStage({ children, className }: { children: React.ReactNode; className?: string }) {
  const MIN = 1;
  const MAX = 5;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<null | {
    startDist: number;
    startScale: number;
    startTx: number;
    startTy: number;
    startCenter: { x: number; y: number };
  }>(null);

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function centroid(a: { x: number; y: number }, b: { x: number; y: number }) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      const [p1, p2] = Array.from(pointers.current.values());
      gesture.current = {
        startDist: Math.max(1, dist(p1, p2)),
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startCenter: centroid(p1, p2),
      };
    }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && gesture.current) {
      const [p1, p2] = Array.from(pointers.current.values()).slice(0, 2);
      const d = Math.max(1, dist(p1, p2));
      const ratio = d / gesture.current.startDist;
      const newScale = Math.max(MIN, Math.min(MAX, gesture.current.startScale * ratio));
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const startLocal = {
        x: gesture.current.startCenter.x - rect.left,
        y: gesture.current.startCenter.y - rect.top,
      };
      const now = centroid(p1, p2);
      const nowLocal = { x: now.x - rect.left, y: now.y - rect.top };
      const panDx = nowLocal.x - startLocal.x;
      const panDy = nowLocal.y - startLocal.y;
      const sr = newScale / gesture.current.startScale;
      setScale(newScale);
      setTx(gesture.current.startTx - (startLocal.x - gesture.current.startTx) * (sr - 1) + panDx);
      setTy(gesture.current.startTy - (startLocal.y - gesture.current.startTy) * (sr - 1) + panDy);
    }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0 && scale <= 1.01) {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  };

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ touchAction: scale > 1.01 || pointers.current.size >= 2 ? "none" : "pan-y" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "0 0",
          transition: gesture.current ? "none" : "transform 120ms ease-out",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}


