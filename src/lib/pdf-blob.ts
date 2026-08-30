/**
 * Convert a stored `data:application/pdf;base64,...` URL into a short-lived
 * `blob:` URL. Modern browsers (Chrome/Edge) refuse to render `data:` PDFs
 * inside an `<iframe>` and fall back to a "download" action instead. Blob
 * URLs render inline reliably.
 */
export function dataUrlToBlobUrl(dataUrl: string): string {
  try {
    if (!dataUrl.startsWith("data:")) return dataUrl;
    const [meta, b64] = dataUrl.split(",");
    if (!b64) return dataUrl;
    const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "application/pdf";
    const bin = atob(b64);
    const len = bin.length;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([buf], { type: mime }));
  } catch {
    return dataUrl;
  }
}