import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { hashFile, describeDuplicate, StaleBinderDocumentError } from '../binderUpload';

describe('hashFile', () => {
  it('gives the same digest for identical bytes under different file names', async () => {
    const a = new File(['scanned-inspection-bytes'], 'scan.png', { type: 'image/png' });
    const b = new File(['scanned-inspection-bytes'], 'renamed-copy.png', { type: 'image/png' });
    expect(await hashFile(a)).toBe(await hashFile(b));
  });

  it('gives a different digest for different bytes', async () => {
    const a = new File(['inspection-A'], 'a.png');
    const b = new File(['inspection-B'], 'a.png');
    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });

  it('returns a 64-character hex digest', async () => {
    const h = await hashFile(new File(['x'], 'a.png'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});


describe('describeDuplicate', () => {
  it('names the uploader and says it is this slot', () => {
    const s = describeDuplicate({
      id: '1', name: 'Periodic DOT Inspections', uploaded_at: '2026-07-13T22:02:28Z',
      uploaded_by: 'u', uploader_name: 'Kenneth Reed', sameSlot: true,
    });
    expect(s).toContain('in this slot');
    expect(s).toContain('by Kenneth Reed');
  });

  it('names the other slot when the same file sits elsewhere', () => {
    const s = describeDuplicate({
      id: '1', name: 'Lease Agreement (ICA)', uploaded_at: null,
      uploaded_by: null, uploader_name: null, sameSlot: false,
    });
    expect(s).toContain('under "Lease Agreement (ICA)"');
  });
});

describe('StaleBinderDocumentError', () => {
  it('carries a plain-language message', () => {
    expect(new StaleBinderDocumentError().message).toContain('replaced by someone else');
  });
});
