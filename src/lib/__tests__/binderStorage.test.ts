import { describe, it, expect } from 'vitest';
import { resolveBinderStorage, resolvePathOnly, parseStorageUrl } from '../binderStorage';

const SIGN = (bucket: string, path: string) =>
  `https://qgx.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=abc`;

describe('resolveBinderStorage', () => {
  it('trusts the saved URL over a misleading fleet-documents/ path prefix', () => {
    // Delease Carter's row 4c7a0f92: path says fleet-documents, object is in inspection-documents
    const path = 'fleet-documents/driver/da4baf8e/periodic-dot-inspections/1783980146633.jpeg';
    const url = SIGN('inspection-documents', 'driver/da4baf8e/periodic-dot-inspections/1783980146633.jpeg');
    expect(resolveBinderStorage(url, path)).toEqual({
      bucket: 'inspection-documents',
      path: 'driver/da4baf8e/periodic-dot-inspections/1783980146633.jpeg',
    });
  });

  it('trusts an operator-documents URL over the same prefix', () => {
    const path = 'fleet-documents/abc/def.pdf';
    expect(resolveBinderStorage(SIGN('operator-documents', 'abc/def.pdf'), path)).toEqual({
      bucket: 'operator-documents',
      path: 'abc/def.pdf',
    });
  });

  it('strips the baked-in bucket prefix when there is no URL', () => {
    expect(resolveBinderStorage(null, 'fleet-documents/73fce0e0/truck_inspection/1.jpg')).toEqual({
      bucket: 'fleet-documents',
      path: '73fce0e0/truck_inspection/1.jpg',
    });
  });

  it('keeps a clean inspection path as-is', () => {
    expect(resolveBinderStorage(null, 'driver/da4baf8e/lease-agreement/1.pdf')).toEqual({
      bucket: 'inspection-documents',
      path: 'driver/da4baf8e/lease-agreement/1.pdf',
    });
  });

  it('keeps Vehicle Hub DOT uploads on fleet-documents with the full key', () => {
    const p = '1d141940-1ef1-4f33-b9da-57d184be99a0/dot/1789.jpg';
    expect(resolvePathOnly(p)).toEqual({ bucket: 'fleet-documents', path: p });
  });

  it('routes other operator-uuid paths to operator-documents', () => {
    const p = '1d141940-1ef1-4f33-b9da-57d184be99a0/registration/1789.pdf';
    expect(resolvePathOnly(p)).toEqual({ bucket: 'operator-documents', path: p });
  });

  it('routes applications/ paths to application-documents', () => {
    expect(resolvePathOnly('applications/x/cdl.png')).toEqual({
      bucket: 'application-documents',
      path: 'applications/x/cdl.png',
    });
  });

  it('returns null for non-storage URLs and empty input', () => {
    expect(parseStorageUrl('https://example.com/a.pdf')).toBeNull();
    expect(resolveBinderStorage(null, null)).toBeNull();
  });

  it('decodes percent-encoded object keys from a signed URL', () => {
    const url = SIGN('inspection-documents', 'driver/x/CDL%20(Back).png');
    expect(resolveBinderStorage(url, null)?.path).toBe('driver/x/CDL (Back).png');
  });
});
