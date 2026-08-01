/**
 * Does this signature image actually contain a signature?
 *
 * `renderRodsDay` embeds whatever data URL it is handed and, when the bytes
 * are unusable, silently emits a PDF with a blank signature line. In isolation
 * that is correct — a renderer should not decide policy — but the artifact it
 * produces is a §395.8 record that looks certified and carries no driver
 * certification.
 *
 * So the check lives here and is applied at the commit edge, which is the one
 * place that knows a missing signature is disqualifying rather than cosmetic.
 * The renderer keeps its current behaviour.
 *
 * No Supabase, no Dexie: this runs before anything is written, offline.
 */

export type SignatureValidationMode = 'pixel' | 'structural';

export interface SignatureValidation {
  ok: boolean;
  /**
   * `pixel` — the image decoded and the ink check ran.
   * `structural` — the environment offers no `createImageBitmap` or 2D
   * context (some in-app webviews), so shape and size were checked and the
   * ink check did NOT run. Named rather than a boolean flag so the record
   * says which check backed the certification.
   */
  mode: SignatureValidationMode;
  reason?: string;
  ink_pixels?: number;
  ink_fraction?: number;
  byte_length: number;
  /** SHA-256 of the data URL, hex. Binds this result to those exact bytes. */
  digest: string;
  checked_at: string;
}

const PNG_PREFIX = 'data:image/png;base64,';
/** A 1x1 transparent PNG is ~70 bytes. Anything at or under this is not ink. */
const MIN_BYTES = 512;
/** Absolute floor: fewer marked pixels than this is a stray tap, not a name. */
const MIN_INK_PIXELS = 120;
/** And it has to be visible relative to the canvas, not one dense speck. */
const MIN_INK_FRACTION = 0.0008;
/** Below this alpha a pixel is antialiasing halo, not a stroke. */
const ALPHA_THRESHOLD = 16;

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasPngMagic(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}

function fail(reason: string, byteLength: number, digest: string): SignatureValidation {
  return {
    ok: false,
    mode: 'structural',
    reason,
    byte_length: byteLength,
    digest,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Three steps. 1 and 2 always run; 3 runs wherever the platform can decode.
 * Never throws — a validator that throws would be indistinguishable from the
 * certification failing for an unrelated reason.
 */
export async function validateSignatureImage(
  dataUrl: string | null | undefined,
): Promise<SignatureValidation> {
  const url = typeof dataUrl === 'string' ? dataUrl : '';
  const digest = url ? await sha256Hex(url).catch(() => '') : '';

  // 1. Shape.
  if (!url) return fail('empty', 0, digest);
  if (!url.startsWith(PNG_PREFIX)) return fail('not_a_png_data_url', url.length, digest);

  const b64 = url.slice(PNG_PREFIX.length);
  const bytes = decodeBase64(b64);
  if (!bytes) return fail('base64_undecodable', 0, digest);
  if (!hasPngMagic(bytes)) return fail('png_magic_missing', bytes.byteLength, digest);
  if (bytes.byteLength < MIN_BYTES) return fail('too_small_to_be_a_signature', bytes.byteLength, digest);

  // 2/3. Decode and count ink. Where the platform cannot decode, say so in the
  // record rather than pretending the ink check passed.
  const canDecode = typeof createImageBitmap === 'function'
    && typeof document !== 'undefined'
    && typeof document.createElement === 'function';
  if (!canDecode) {
    return {
      ok: true,
      mode: 'structural',
      reason: 'no_image_decoder',
      byte_length: bytes.byteLength,
      digest,
      checked_at: new Date().toISOString(),
    };
  }

  try {
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const blob = new Blob([buf], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        ok: true,
        mode: 'structural',
        reason: 'no_2d_context',
        byte_length: bytes.byteLength,
        digest,
        checked_at: new Date().toISOString(),
      };
    }
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > ALPHA_THRESHOLD) ink += 1;
    }
    const total = Math.max(1, canvas.width * canvas.height);
    const fraction = ink / total;
    const enough = ink >= MIN_INK_PIXELS && fraction >= MIN_INK_FRACTION;
    return {
      ok: enough,
      mode: 'pixel',
      reason: enough ? undefined : 'blank_or_near_blank',
      ink_pixels: ink,
      ink_fraction: Number(fraction.toFixed(6)),
      byte_length: bytes.byteLength,
      digest,
      checked_at: new Date().toISOString(),
    };
  } catch {
    // Decode threw on bytes that passed the PNG header check: the image is
    // corrupt, which is a refusal, not a downgrade to structural.
    return fail('decode_failed', bytes.byteLength, digest);
  }
}

/** The driver-facing refusal. One message, one instruction. */
export const SIGNATURE_INVALID_MESSAGE =
  "Your signature didn't save. Please sign again.";
