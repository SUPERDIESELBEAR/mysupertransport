import { extractPdfTextLayerDeno } from '../_shared/pdfTextLayerDeno.ts';

const GUARD_PHRASE = 'SUPERDRIVE RUNTIME TEXT LAYER GUARD U6683409';

// A tiny one-page PDF with a real embedded text layer. This is intentionally
// binary input, not a prebuilt fixture layer: it exercises the same Deno pdfjs
// import path that the deployed ingest function uses before verbatim adoption.
const GUARD_PDF_BASE64 =
  'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNzYgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3MjAgVGQgKFNVUEVSRFJJVkUgUlVOVElNRSBURVhUIExBWUVSIEdVQVJEIFU2NjgzNDA5KSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI0NyAwMDAwMCBuIAowMDAwMDAwMzE3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDQyCiUlRU9GCg==';

function decodeBase64(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

Deno.test('runtime PDF text-layer extraction returns real text from binary PDF input', async () => {
  const layer = await extractPdfTextLayerDeno(decodeBase64(GUARD_PDF_BASE64));

  if (!layer.available) {
    throw new Error('Expected the Deno ingest extractor to return an available text layer.');
  }
  if (layer.pageCount !== 1) throw new Error(`Expected one page, got ${layer.pageCount}.`);
  if (!layer.text.includes(GUARD_PHRASE)) {
    throw new Error(`Expected extracted text to include ${JSON.stringify(GUARD_PHRASE)}, got ${JSON.stringify(layer.text)}.`);
  }
});