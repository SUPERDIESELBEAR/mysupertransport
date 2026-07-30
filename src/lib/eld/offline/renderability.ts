/**
 * Cached bytes are not the same as renderable bytes.
 *
 * Chrome cannot decode HEIC, so an Android driver would otherwise see a broken
 * image icon on a packet the chip reports Ready. Every image is probed by
 * actually attempting a decode — never by trusting the MIME type.
 */

/**
 * An undecodable format can reject slowly or inconsistently rather than
 * immediately, so an unbounded probe can stall hydration for a whole window.
 * A timeout is treated as not renderable: the named-card fallback is correct
 * and honest either way.
 */
export const PROBE_TIMEOUT_MS = 2000;

export const DISPLAY_MIME = 'image/jpeg';
const DISPLAY_MAX_EDGE = 2400;
const DISPLAY_QUALITY = 0.85;

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, ms);
    promise.then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } },
    );
  });
}

async function decode(blob: Blob): Promise<{ width: number; height: number; source: CanvasImageSource } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    } catch {
      return null;
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth) return null;
    return { width: img.naturalWidth, height: img.naturalHeight, source: img };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ProbeResult {
  renderable: boolean;
  display_bytes: ArrayBuffer | null;
  display_mime: string | null;
}

const NOT_RENDERABLE: ProbeResult = { renderable: false, display_bytes: null, display_mime: null };

/**
 * Probe one file. Images get an offscreen decode attempt bounded by
 * PROBE_TIMEOUT_MS; on success the pixels are re-encoded to JPEG for display
 * while the original bytes are retained separately as the record.
 */
export async function probeRenderability(bytes: ArrayBuffer, mime: string): Promise<ProbeResult> {
  // PDFs render through the browser's own viewer, not a canvas decode.
  if (isPdfMime(mime)) return { renderable: true, display_bytes: null, display_mime: null };
  if (!isImageMime(mime)) return NOT_RENDERABLE;

  const blob = new Blob([bytes], { type: mime });
  const decoded = await withTimeout(decode(blob), PROBE_TIMEOUT_MS);
  if (!decoded || !decoded.width || !decoded.height) return NOT_RENDERABLE;

  const converted = await withTimeout(toJpeg(decoded), PROBE_TIMEOUT_MS);
  if (!converted) {
    // It decoded, so it will render from the original bytes; the JPEG copy is
    // an optimisation, not a requirement.
    return { renderable: true, display_bytes: null, display_mime: null };
  }
  return { renderable: true, display_bytes: converted, display_mime: DISPLAY_MIME };
}

async function toJpeg(decoded: { width: number; height: number; source: CanvasImageSource }): Promise<ArrayBuffer | null> {
  const scale = Math.min(1, DISPLAY_MAX_EDGE / Math.max(decoded.width, decoded.height));
  const w = Math.max(1, Math.round(decoded.width * scale));
  const h = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(decoded.source, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, DISPLAY_MIME, DISPLAY_QUALITY);
  });
  if (!blob) return null;
  return blob.arrayBuffer();
}