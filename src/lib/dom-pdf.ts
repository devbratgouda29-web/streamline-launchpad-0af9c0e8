/**
 * 1:1 DOM snapshot → multi-page A4 PDF.
 *
 * Captures each rendered dashboard section straight from the live DOM with
 * html2canvas-pro (oklch-aware fork) and stitches the bitmaps into one A4
 * document — one page per section. What is on screen is what is exported.
 */
export async function exportSectionsToPdf(
  elements: HTMLElement[],
  filename = "grand-performance-report.pdf",
) {
  if (!elements.length) return;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Render each section at A4-ish document width so the export is legible
  // regardless of the viewport the dashboard is being viewed on.
  const CAPTURE_W = 794;

  /**
   * Every <img> is rasterised once to a compact JPEG/PNG data URL up front so
   * html2canvas never issues a (potentially 30s-hanging) network request per
   * clone. This is the single biggest export-latency win.
   */
  const inlined = new Map<string, string>();
  const toDataUrl = (img: HTMLImageElement): string | null => {
    const cached = inlined.get(img.src);
    if (cached) return cached;
    if (!img.complete || !img.naturalWidth) return null;
    try {
      const max = 560;
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/png");
      inlined.set(img.src, url);
      return url;
    } catch {
      return null;
    }
  };

  const capture = (el: HTMLElement, scale: number) =>
    html2canvas(el, {
      backgroundColor: "#000000",
      scale,
      useCORS: false,
      allowTaint: true,
      imageTimeout: 2000,
      removeContainer: true,
      logging: false,
      width: CAPTURE_W,
      windowWidth: CAPTURE_W,
      // Match the capture window to the actual content height so trailing
      // empty viewport space is never rasterised into extra blank pages.
      height: Math.ceil(el.getBoundingClientRect().height),
      windowHeight: Math.ceil(el.getBoundingClientRect().height),
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      onclone: (doc: Document) => {
        const clone = doc.querySelector<HTMLElement>(
          `[data-report-section="${el.dataset.reportSection}"]`,
        );
        if (!clone) return;
        // Swap every image for its pre-rasterised data URL so the clone needs
        // zero network fetches (no CORS stalls, no 30s image timeouts).
        clone.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
          const url = inlined.get(img.src);
          if (url) {
            img.src = url;
            img.removeAttribute("crossorigin");
            img.removeAttribute("srcset");
            img.loading = "eager";
          }
        });
        // Widen the section and every constraining ancestor (the app shell
        // caps content at max-w-md) so the export renders at document width.
        let node: HTMLElement | null = clone;
        while (node && node !== doc.body) {
          node.style.width = `${CAPTURE_W}px`;
          node.style.maxWidth = `${CAPTURE_W}px`;
          node.style.minWidth = `${CAPTURE_W}px`;
          node = node.parentElement;
        }
        doc.body.style.width = `${CAPTURE_W}px`;
        doc.documentElement.style.margin = "0";
        doc.documentElement.style.padding = "0";
        doc.body.style.margin = "0";
        doc.body.style.padding = "0";
        clone.style.margin = "0";
        // Drop empty/hidden wrapper nodes so they can't inflate the capture.
        clone.querySelectorAll<HTMLElement>("div,p,section,ul,li,span").forEach((n) => {
          if (n.childElementCount === 0 && !n.textContent?.trim()) {
            const cs = doc.defaultView?.getComputedStyle(n);
            const decorative =
              !!cs &&
              (cs.backgroundImage !== "none" ||
                cs.borderTopWidth !== "0px" ||
                cs.borderBottomWidth !== "0px" ||
                cs.position === "absolute");
            if (!decorative) n.remove();
          }
        });
        // html2canvas flattens layered/vignette gradients into an opaque wash,
        // so drop them in the clone and repaint a crisp distressed edge frame.
        clone.querySelectorAll<HTMLElement>("[data-grunge]").forEach((g) => g.remove());
        clone.style.background = "#000000";
        const edge = doc.createElement("div");
        edge.style.cssText = [
          "position:absolute",
          "inset:14px",
          "pointer-events:none",
          "z-index:7",
          "border:1px solid rgba(212,175,55,0.22)",
          "border-radius:4px",
        ].join(";");
        clone.appendChild(edge);
      },
    });

  /** Last row index that still contains non-black pixels (blank-tail trim). */
  const contentHeight = (canvas: HTMLCanvasElement): number => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas.height;
    try {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let y = canvas.height - 1; y >= 0; y--) {
        const row = y * canvas.width * 4;
        for (let x = 0; x < canvas.width; x++) {
          const p = row + x * 4;
          if (data[p]! > 12 || data[p + 1]! > 12 || data[p + 2]! > 12) {
            return Math.min(canvas.height, y + 2);
          }
        }
      }
      return 0;
    } catch {
      return canvas.height;
    }
  };

  // Wait (briefly) for every image to be decodable, then inline it as a data
  // URL. Cap the wait at 4s per image so a single slow asset can't stall the
  // whole export.
  await Promise.all(
    elements.flatMap((el) =>
      Array.from(el.querySelectorAll("img")).map(
        (img) =>
          new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              toDataUrl(img);
              resolve();
            };
            const timer = setTimeout(() => resolve(), 4000);
            if (img.complete && img.naturalWidth > 0) {
              void (img.decode?.() ?? Promise.resolve()).then(finish, finish);
              return;
            }
            img.addEventListener(
              "load",
              () => {
                void (img.decode?.() ?? Promise.resolve()).then(finish, finish);
              },
              { once: true },
            );
            img.addEventListener("error", finish, { once: true });
          }),
      ),
    ),
  );


  let rendered = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = await capture(el, 2);
    } catch (err) {
      console.error("PDF section capture failed, retrying at lower scale", err);
      try {
        canvas = await capture(el, 1);
      } catch (err2) {
        console.error("PDF section capture failed permanently", err2);
      }
    }

    // Every section always claims its own page, even if its bitmap failed —
    // page count must stay deterministic (3 pages for the grand report).
    if (rendered > 0) pdf.addPage();
    rendered++;
    pdf.setFillColor(0, 0, 0);
    pdf.rect(0, 0, pageW, pageH, "F");
    if (!canvas) continue;

    // Sections flagged as single-page (the five-tier mastery ladder) are
    // scaled as a whole to fit one A4 page instead of being sliced, so the
    // component keeps its native full-size layout on screen.
    if (el.classList.contains("pdf-page-five-tier")) {
      const usable = Math.max(1, contentHeight(canvas));
      const fit = Math.min(pageW / canvas.width, pageH / usable);
      const w = canvas.width * fit;
      const h = usable * fit;
      const page = document.createElement("canvas");
      page.width = canvas.width;
      page.height = usable;
      const pctx = page.getContext("2d");
      if (pctx) {
        pctx.fillStyle = "#000000";
        pctx.fillRect(0, 0, page.width, page.height);
        pctx.drawImage(canvas, 0, 0, canvas.width, usable, 0, 0, canvas.width, usable);
        pdf.addImage(
          page.toDataURL("image/jpeg", 0.85),
          "JPEG",
          (pageW - w) / 2,
          0,
          w,
          h,
          undefined,
          "FAST",
        );
      }
      continue;
    }

    // Full-width, aspect-ratio-locked draw: never shrink a section to fit.
    // Sections taller than one page (e.g. a long revision log) are sliced and
    // continued on the next page instead of being scaled down.
    const scaleRatio = pageW / canvas.width;
    const sliceHpx = Math.floor(pageH / scaleRatio);
    // Ignore any trailing all-black band so a few overflow pixels can't spawn
    // a near-empty extra page.
    const usableH = Math.max(1, contentHeight(canvas));
    let offset = 0;
    let first = true;
    while (offset < usableH) {
      const hpx = Math.min(sliceHpx, usableH - offset);
      // A sliver of leftover content isn't worth a whole page.
      if (!first && hpx < sliceHpx * 0.04) break;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = hpx;
      const ctx = slice.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, hpx, 0, 0, canvas.width, hpx);

      if (!first) {
        pdf.addPage();
        pdf.setFillColor(0, 0, 0);
        pdf.rect(0, 0, pageW, pageH, "F");
      }
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.85),
        "JPEG",
        0,
        0,
        pageW,
        hpx * scaleRatio,
        undefined,
        "FAST",
      );
      first = false;
      offset += hpx;
    }
  }

  pdf.save(filename);
}

