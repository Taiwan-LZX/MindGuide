// ────────────────────────────────────────────────────────────────────────────
// pdf-renderer.ts — PDF page → image rendering via MuPDF (WASM)
//
// Why MuPDF?
//   • Pure WASM, zero native dependencies (unlike @napi-rs/canvas which needs
//     platform-specific binaries, or node-canvas which needs cairo/pango).
//   • Commercial-grade PDF engine (same family as SumatraPDF / Artifex).
//   • Renders at arbitrary DPI, outputs PNG or JPEG.
//   • Also exposes structured-text extraction (layout-aware) which we use as a
//     higher-quality text path than unpdf for complex layouts.
//
// This module is the bridge between a binary PDF and the z-ai VLM: we render
// each page to a JPEG (smaller than PNG → faster VLM upload) and hand it to
// the VLM with a structured prompt that asks for markdown back.
//
// Memory safety: MuPDF WASM runs in a fixed-size heap (~16MB default, bumped
// via initialised globals). Each Document/Pixmap must be explicitly dropped to
// avoid leaking WASM heap. We use try/finally around every render.
// ────────────────────────────────────────────────────────────────────────────

export interface RenderedPage {
  pageNumber: number; // 1-based
  /** JPEG bytes — ready for base64 encoding into a VLM image_url. */
  jpeg: Uint8Array;
  width: number;
  height: number;
  bytes: number;
}

export interface RenderOptions {
  /** Target DPI. 150 is a good balance (≈2x scale). Higher = better OCR but
   * bigger payload. Cap at 200 for VLM bandwidth. */
  dpi?: number;
  /** Output format. JPEG is ~5-10x smaller than PNG for photographic pages
   * and the VLM handles it identically. Use PNG only for pages that are
   * predominantly line art / diagrams. */
  format?: 'jpeg' | 'png';
  /** JPEG quality (1-100). 80 is visually lossless for text. */
  quality?: number;
  /** Hard cap on the longest edge in pixels. VLMs typically resize down to
   * ~1568px anyway, so rendering larger wastes bandwidth. */
  maxEdge?: number;
}

const DEFAULTS: Required<RenderOptions> = {
  dpi: 150,
  format: 'jpeg',
  quality: 80,
  maxEdge: 1568,
};

// ─── lazy MuPDF loader ──────────────────────────────────────────────────────
//
// MuPDF WASM is ~6MB. Loading it on every request would tank cold-start, so
// we cache the module on the global object. Bun/Node module cache already
// does this for `import`, but we go through dynamic import so the WASM
// compile cost is paid only when PDF rendering is actually needed (i.e. not
// on every chat / course generation request).
type MuPDFModule = typeof import('mupdf');
let _mupdfPromise: Promise<MuPDFModule> | null = null;

async function getMupdf(): Promise<MuPDFModule> {
  if (!_mupdfPromise) {
    _mupdfPromise = import('mupdf');
  }
  return _mupdfPromise;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Render a range of PDF pages to JPEG/PNG.
 *
 * @param bytes   PDF file bytes
 * @param pages   1-based page numbers to render (e.g. [1,2,3]). If empty,
 *                renders all pages (capped at `maxPages`).
 * @param opts    Render options
 * @param maxPages Safety cap to prevent runaway renders on huge PDFs.
 */
export async function renderPdfPages(
  bytes: ArrayBuffer | Uint8Array,
  pages: number[] = [],
  opts: RenderOptions = {},
  maxPages = 200
): Promise<RenderedPage[]> {
  const o = { ...DEFAULTS, ...opts };
  const mupdf = await getMupdf();

  // Defensive copy: MuPDF may transfer/detach the underlying ArrayBuffer when
  // the Document is dropped. If we pass the caller's buffer directly, a later
  // reuse of the same bytes (e.g. unpdf, or a second mupdf call) would hit a
  // detached buffer and throw. We copy into a JS-owned buffer so the caller's
  // bytes stay intact.
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const input = new Uint8Array(src.length);
  input.set(src);
  const doc = mupdf.Document.openDocument(input, 'application/pdf');
  const pageCount = doc.countPages();

  // Resolve target page list.
  let targets: number[];
  if (pages.length === 0) {
    targets = Array.from({ length: Math.min(pageCount, maxPages) }, (_, i) => i);
  } else {
    targets = pages
      .filter((p) => p >= 1 && p <= pageCount)
      .slice(0, maxPages)
      .map((p) => p - 1); // to 0-based for MuPDF
  }

  const out: RenderedPage[] = [];
  for (const idx of targets) {
    // mupdf type defs incomplete: Pixmap/Document expose `.drop()` at runtime
    // (per Artifex JS bindings) but the .d.ts only declares `destroy()`.
    let pixmap: any = null;
    try {
      const page = doc.loadPage(idx);
      const bounds = page.getBounds(); // [x0, y0, x1, y1] in PDF points (1/72")
      const ptW = bounds[2] - bounds[0];
      const ptH = bounds[3] - bounds[1];

      // scale = dpi / 72, but cap so longest edge ≤ maxEdge.
      const scale = Math.min(
        o.dpi / 72,
        o.maxEdge / Math.max(ptW, ptH)
      );
      // mupdf Matrix is a fixed 6-tuple; declare as tuple to satisfy toPixmap.
      const matrix: [number, number, number, number, number, number] = [scale, 0, 0, scale, 0, 0];
      pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);

      let imgBytes: Uint8Array;
      if (o.format === 'png') {
        imgBytes = pixmap.asPNG();
      } else {
        // Try JPEG first (5-10x smaller than PNG → faster VLM upload).
        // Fall back to PNG only if asJPEG is unavailable or throws.
        try {
          imgBytes = pixmap.asJPEG(o.quality);
        } catch {
          imgBytes = pixmap.asPNG();
        }
      }

      // ⚠️ Critical: MuPDF returns Uint8Array views backed by the WASM heap.
      // Once we call pixmap.drop() in the finally block, that ArrayBuffer is
      // detached and any subsequent access (e.g. btoa in toDataUrl) throws
      // "Cannot perform Construct on a detached ArrayBuffer".
      // Copy into a JS-owned buffer BEFORE dropping the pixmap.
      const w = pixmap.getWidth();
      const h = pixmap.getHeight();
      const safeBytes = new Uint8Array(imgBytes.length);
      safeBytes.set(imgBytes);

      out.push({
        pageNumber: idx + 1,
        jpeg: safeBytes,
        width: w,
        height: h,
        bytes: safeBytes.length,
      });
    } catch (err) {
      // A single bad page shouldn't kill the whole render.
      console.error(`[pdf-renderer] page ${idx + 1} render failed:`, err);
    } finally {
      // Explicit drop to free WASM heap. MuPDF objects expose `.drop()`.
      try {
        pixmap?.drop?.();
      } catch {
        /* noop */
      }
    }
  }

  // mupdf type defs incomplete: Document exposes `.drop()` at runtime.
  try {
    (doc as any).drop?.();
  } catch {
    /* noop */
  }

  return out;
}

/**
 * Extract layout-aware structured text from a PDF using MuPDF's
 * toStructuredText. This preserves reading order and block structure better
 * than unpdf's naive y-coordinate join, especially for multi-column papers.
 *
 * Returns plain text (blocks joined by \n\n). For richer structure, use
 * `extractStructuredJson` which returns the JSON form with bbox info.
 */
export async function extractTextViaMupdf(
  bytes: ArrayBuffer | Uint8Array,
  maxPages = 500
): Promise<{ text: string; pageCount: number; pages: number[] }> {
  const mupdf = await getMupdf();
  // Defensive copy — see renderPdfPages for rationale.
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const input = new Uint8Array(src.length);
  input.set(src);
  const doc = mupdf.Document.openDocument(input, 'application/pdf');
  const pageCount = doc.countPages();
  const limit = Math.min(pageCount, maxPages);

  const pages: number[] = []; // char offset where each page begins
  let text = '';
  for (let i = 0; i < limit; i++) {
    pages.push(text.length);
    // mupdf type defs incomplete: Page/StructuredText expose `.drop()` at runtime.
    let page: any = null;
    let stext: any = null;
    try {
      page = doc.loadPage(i);
      stext = page.toStructuredText('preserve-whitespace');
      // asJSON returns an array of blocks; asText gives plain text.
      const pageText = (stext as any).asText?.() ?? '';
      if (pageText) {
        text += (text ? '\n\n' : '') + pageText;
      }
    } catch (err) {
      console.error(`[pdf-renderer] page ${i + 1} text extract failed:`, err);
    } finally {
      try {
        stext?.drop?.();
        page?.drop?.();
      } catch {
        /* noop */
      }
    }
  }
  // mupdf type defs incomplete: Document exposes `.drop()` at runtime.
  try {
    (doc as any).drop?.();
  } catch {
    /* noop */
  }
  return { text, pageCount, pages };
}

/**
 * Convert a Uint8Array of JPEG/PNG bytes to a base64 data URL suitable for
 * the z-ai VLM `image_url.url` field.
 */
export function toDataUrl(bytes: Uint8Array, mime = 'image/jpeg'): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * Heuristic: detect whether a PDF is likely scanned (image-only, no text layer).
 * Used to decide whether to invoke the VLM path automatically.
 *
 * Strategy: extract text from the first 3 pages via MuPDF. If average chars
 * per page < threshold, treat as scanned.
 */
export async function detectScannedPdf(
  bytes: ArrayBuffer | Uint8Array,
  threshold = 50,
  samplePages = 3
): Promise<{ scanned: boolean; avgCharsPerPage: number; pageCount: number }> {
  const mupdf = await getMupdf();
  // Defensive copy — see renderPdfPages for rationale. Critical: this function
  // is called BEFORE renderPdfPages in the high-precision path, so if we
  // detach the caller's buffer here, the subsequent render call fails with
  // "Cannot perform Construct on a detached ArrayBuffer".
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const input = new Uint8Array(src.length);
  input.set(src);
  const doc = mupdf.Document.openDocument(input, 'application/pdf');
  const pageCount = doc.countPages();
  const sample = Math.min(samplePages, pageCount);
  let totalChars = 0;
  for (let i = 0; i < sample; i++) {
    // mupdf type defs incomplete: Page/StructuredText expose `.drop()` at runtime.
    let page: any = null;
    let stext: any = null;
    try {
      page = doc.loadPage(i);
      stext = page.toStructuredText('preserve-whitespace');
      const t = (stext as any).asText?.() ?? '';
      totalChars += t.length;
    } catch {
      /* ignore */
    } finally {
      try {
        stext?.drop?.();
        page?.drop?.();
      } catch {
        /* noop */
      }
    }
  }
  // mupdf type defs incomplete: Document exposes `.drop()` at runtime.
  try {
    (doc as any).drop?.();
  } catch {
    /* noop */
  }
  const avg = sample > 0 ? totalChars / sample : 0;
  return { scanned: avg < threshold, avgCharsPerPage: avg, pageCount };
}
