// ─── Color Extraction ──────────────────────────────────────────────────────
// Extract a "dominant vibrant" color from an image File for use as the project
// accent. Runs entirely client-side on a <canvas>.
//
// Algorithm:
//   1. Downscale the image to ≤96px (speed; color distribution is stable).
//   2. Walk pixels, skip transparent / near-white / near-black / near-gray
//      (we want a *hue*, not a shade of gray).
//   3. Quantize each surviving pixel to 5 bits/channel and bucket it.
//   4. Score each bucket = population × (saturation + 0.25). The saturation
//      bias favors vivid colors over muddy browns even if the muddy bucket is
//      slightly larger — this is what makes a blue sky beat a beige building.
//   5. Return the winning bucket's averaged RGB as the accent.
//
// This is deliberately simple (no k-means). For UI accent extraction it is
// fast (~1ms for a 96² image), deterministic, and good enough — the goal is a
// pleasing representative hue, not a perceptually-exact palette.

export interface ExtractedColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  /** Relative luminance (0–1), used to pick a readable foreground. */
  luminance: number;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('read-failed'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode-failed'));
    img.src = src;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// sRGB → relative luminance (WCAG). Good enough to decide fg contrast.
function relLuminance(r: number, g: number, b: number): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export async function extractDominantColor(file: File): Promise<ExtractedColor | null> {
  let dataUrl: string;
  try {
    dataUrl = await readFileAsDataURL(file);
  } catch {
    return null;
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return null;
  }

  const max = 96;
  const scale = Math.min(max / img.width, max / img.height, 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted canvas (shouldn't happen for local files)
  }
  const { data } = imageData;

  interface Bucket {
    count: number;
    sumR: number;
    sumG: number;
    sumB: number;
  }
  const buckets = new Map<number, Bucket>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 125) continue;
    if (r > 235 && g > 235 && b > 235) continue; // near-white
    if (r < 25 && g < 25 && b < 25) continue; // near-black
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn < 18) continue; // near-gray — no hue

    // 5-bit per channel quantization → at most 32768 keys, far fewer in
    // practice. Collapses near-duplicate colors into one bucket so the vote
    // isn't split across 10 subtly-different blues.
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const prev = buckets.get(key);
    if (prev) {
      prev.count++;
      prev.sumR += r;
      prev.sumG += g;
      prev.sumB += b;
    } else {
      buckets.set(key, { count: 1, sumR: r, sumG: g, sumB: b });
    }
  }

  if (buckets.size === 0) return null;

  let bestR = 0;
  let bestG = 0;
  let bestB = 0;
  let bestScore = -1;

  for (const bk of buckets.values()) {
    const ar = bk.sumR / bk.count;
    const ag = bk.sumG / bk.count;
    const ab = bk.sumB / bk.count;
    const mx = Math.max(ar, ag, ab);
    const mn = Math.min(ar, ag, ab);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    // Population × (saturation + floor). The 0.25 floor keeps a large but
    // slightly-muted bucket competitive with a tiny vivid one.
    const score = bk.count * (sat + 0.25);
    if (score > bestScore) {
      bestScore = score;
      bestR = Math.round(ar);
      bestG = Math.round(ag);
      bestB = Math.round(ab);
    }
  }

  return {
    hex: rgbToHex(bestR, bestG, bestB),
    r: bestR,
    g: bestG,
    b: bestB,
    luminance: relLuminance(bestR, bestG, bestB),
  };
}

/** Pick black or white text for a bg color, per WCAG contrast. */
export function readableForeground(r: number, g: number, b: number): string {
  return relLuminance(r, g, b) > 0.45 ? '#0a0a0a' : '#fafafa';
}
