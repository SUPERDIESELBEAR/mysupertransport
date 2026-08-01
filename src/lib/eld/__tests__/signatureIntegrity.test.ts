/**
 * The five malformed signatures Playwright case (k) fed to the renderer, plus
 * a genuinely blank canvas export. Case (k) proved the renderer survives them;
 * this proves they never reach it.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { validateSignatureImage } from '../signatureIntegrity';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngDataUrl(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  bytes.set(PNG_HEADER, 0);
  for (let i = PNG_HEADER.length; i < byteLength; i += 1) bytes[i] = i % 251;
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `data:image/png;base64,${btoa(bin)}`;
}

/** Stubs the decode path so the pixel pass runs under jsdom. */
function stubDecoder(alphaAt: (i: number) => number, w = 400, h = 160) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p += 1) data[p * 4 + 3] = alphaAt(p);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: w, height: h })));
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected ${tag}`);
    return {
      width: 0, height: 0,
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data, width: w, height: h }),
      }),
    } as unknown as HTMLElement;
  }) as typeof document.createElement);
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('validateSignatureImage — structural refusals', () => {
  it.each([
    ['empty string', ''],
    ['not a data url', 'https://example.com/signature.png'],
    ['wrong mime', 'data:image/jpeg;base64,AAAA'],
    ['undecodable base64', 'data:image/png;base64,!!!!not base64!!!!'],
    ['png prefix, no magic bytes', `data:image/png;base64,${btoa('x'.repeat(900))}`],
    ['1x1 transparent placeholder', pngDataUrl(70)],
  ])('refuses %s', async (_label, input) => {
    const result = await validateSignatureImage(input);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('never throws, whatever it is handed', async () => {
    await expect(validateSignatureImage(undefined)).resolves.toMatchObject({ ok: false });
    await expect(validateSignatureImage(null)).resolves.toMatchObject({ ok: false });
  });
});

describe('validateSignatureImage — the ink check', () => {
  it('accepts a stroked signature in pixel mode', async () => {
    // ~5% of the canvas marked: a name, not a speck.
    stubDecoder((p) => (p % 20 === 0 ? 255 : 0));
    const result = await validateSignatureImage(pngDataUrl(4096));
    expect(result).toMatchObject({ ok: true, mode: 'pixel' });
    expect(result.ink_pixels).toBeGreaterThan(120);
  });

  it('refuses a blank canvas export that is structurally a perfect PNG', async () => {
    stubDecoder(() => 0);
    const result = await validateSignatureImage(pngDataUrl(4096));
    expect(result).toMatchObject({ ok: false, mode: 'pixel', ink_pixels: 0 });
  });

  it('refuses antialiasing halo below the alpha threshold', async () => {
    stubDecoder(() => 8);
    const result = await validateSignatureImage(pngDataUrl(4096));
    expect(result.ok).toBe(false);
  });

  it('refuses a single dense speck that clears the absolute count', async () => {
    // 200 pixels of ink on a 400x160 canvas: over MIN_INK_PIXELS, under the
    // fraction. Both floors have to hold, which is why there are two.
    stubDecoder((p) => (p < 200 ? 255 : 0));
    const result = await validateSignatureImage(pngDataUrl(4096));
    expect(result).toMatchObject({ ok: false, mode: 'pixel' });
    expect(result.ink_pixels).toBe(200);
  });
});

describe('validateSignatureImage — structural mode', () => {
  it('accepts, and SAYS structural, where the platform cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const result = await validateSignatureImage(pngDataUrl(4096));
    expect(result).toMatchObject({ ok: true, mode: 'structural', reason: 'no_image_decoder' });
  });

  it('refuses corrupt bytes rather than downgrading to structural', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('corrupt'); }));
    const result = await validateSignatureImage(pngDataUrl(4096));
    expect(result).toMatchObject({ ok: false, reason: 'decode_failed' });
  });
});

describe('the digest', () => {
  it('is stable for the same bytes and differs for different bytes', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const a = await validateSignatureImage(pngDataUrl(4096));
    const b = await validateSignatureImage(pngDataUrl(4096));
    const c = await validateSignatureImage(pngDataUrl(4097));
    expect(a.digest).toBe(b.digest);
    expect(a.digest).not.toBe(c.digest);
    expect(a.digest).toHaveLength(64);
  });
});
