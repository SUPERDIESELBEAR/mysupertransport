import { describe, it, vi, expect } from 'vitest';
const { convertForDisplay } = await import('/dev-server/src/lib/eld/offline/renderability.ts');
describe('d', () => { it('x', async () => {
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 100, height: 50 }));
  const orig = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = orig(tag);
    if (tag === 'canvas') {
      (el as any).getContext = () => ({ drawImage: () => undefined });
      (el as any).toBlob = (cb: any) => cb(new Blob([new Uint8Array([1,2,3,4])], { type: 'image/jpeg' }));
    }
    return el;
  }) as never);
  const out = await convertForDisplay(new ArrayBuffer(8), 'image/jpeg');
  console.log('out', out && out.byteLength, typeof Blob.prototype.arrayBuffer);
  expect(1).toBe(1);
});});
