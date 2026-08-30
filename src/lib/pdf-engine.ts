/**
 * Shared pdf.js engine loader.
 *
 * pdfjs-dist touches browser globals (DOMMatrix, etc.) at module scope, so it
 * must never be imported statically — that crashes SSR. Everything goes
 * through this single lazy loader so the library + worker chunk is fetched
 * once per session and reused by every consumer (reader, thumbnails, upload
 * page-count probing).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLibPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPdfjs(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("pdfjs unavailable on server"));
  }
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

/**
 * Warm the PDF engine in the background (idle time) so the first open of a
 * note is instant instead of paying the chunk download + worker boot cost.
 * Safe to call many times — it de-dupes on the shared promise.
 */
export function prefetchPdfEngine() {
  if (typeof window === "undefined" || pdfjsLibPromise) return;
  const run = () => {
    void loadPdfjs().catch(() => {
      // Warm-up is best-effort; real failures surface at actual open time.
    });
  };
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 4000 });
  else window.setTimeout(run, 1200);
}
