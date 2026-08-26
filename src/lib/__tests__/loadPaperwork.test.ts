import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_PAPERWORK, evaluateLoadPaperwork } from '@/lib/loadPaperwork';

const doc = (document_type: string, photo_label?: string) => ({ document_type, photo_label });
const exc = (document_type: string, status: string) => ({ document_type, status });

describe('evaluateLoadPaperwork — standard', () => {
  it('is complete with a POD, and lists the missing BOL as expected', () => {
    const r = evaluateLoadPaperwork('standard', [doc('pod')], []);
    expect(r.complete).toBe(true);
    expect(r.outstandingRequired).toEqual([]);
    expect(r.outstandingExpected.map(x => x.documentType)).toEqual(['bol']);
  });

  it('is incomplete without a POD', () => {
    const r = evaluateLoadPaperwork('standard', [doc('bol')], []);
    expect(r.complete).toBe(false);
    expect(r.outstandingRequired.map(x => x.documentType)).toEqual(['pod']);
  });

  it('counts a document whose is_verified is false', () => {
    const r = evaluateLoadPaperwork('standard', [{ ...doc('pod'), is_verified: false } as never], []);
    expect(r.complete).toBe(true);
  });
});

describe('evaluateLoadPaperwork — per_ton', () => {
  it('is incomplete when the scale ticket is absent', () => {
    const r = evaluateLoadPaperwork('per_ton', [doc('pod')], []);
    expect(r.complete).toBe(false);
    expect(r.outstandingRequired.map(x => x.documentType)).toEqual(['scale_ticket']);
  });
});

describe('evaluateLoadPaperwork — loadout', () => {
  const sets = [doc('loadout_pickup_inspection', 'Front'), doc('loadout_delivery_inspection', 'Front')];

  it('is incomplete when no photo is labelled Rear Doors Open', () => {
    const r = evaluateLoadPaperwork('loadout', sets, []);
    expect(r.complete).toBe(false);
    expect(r.outstandingRequired.map(x => x.label)).toEqual(['Roof check — rear doors open']);
  });

  it('matches the roof check after trimming and case-folding', () => {
    const r = evaluateLoadPaperwork(
      'loadout',
      [...sets, doc('loadout_pickup_inspection', 'rear doors open ')],
      [],
    );
    expect(r.complete).toBe(true);
  });

  it('never requires bol or pod', () => {
    const types = DEFAULT_LOAD_PAPERWORK.loadout.map(x => x.documentType);
    expect(types).not.toContain('bol');
    expect(types).not.toContain('pod');
  });
});

describe('exception status matrix', () => {
  it('approved satisfies', () => {
    const r = evaluateLoadPaperwork('standard', [], [exc('pod', 'approved')]);
    expect(r.complete).toBe(true);
    expect(r.satisfied.find(s => s.requirement.documentType === 'pod')?.satisfiedBy)
      .toBe('exception_approved');
  });

  it('resolved satisfies', () => {
    const r = evaluateLoadPaperwork('standard', [], [exc('pod', 'resolved')]);
    expect(r.complete).toBe(true);
    expect(r.satisfied.find(s => s.requirement.documentType === 'pod')?.satisfiedBy)
      .toBe('exception_resolved');
  });

  it('pending does not satisfy, and is reported separately', () => {
    const r = evaluateLoadPaperwork('standard', [], [exc('pod', 'pending')]);
    expect(r.complete).toBe(false);
    expect(r.pendingExceptions.map(x => x.documentType)).toEqual(['pod']);
  });

  it('denied does not satisfy and is not pending', () => {
    const r = evaluateLoadPaperwork('standard', [], [exc('pod', 'denied')]);
    expect(r.complete).toBe(false);
    expect(r.pendingExceptions).toEqual([]);
  });
});

describe('photo label coupling', () => {
  it('the roof-check label is offered verbatim by the uploader suggestions', async () => {
    const { PHOTO_LABEL_SUGGESTIONS } = await import('@/lib/loadDocuments');
    const all = Object.values(PHOTO_LABEL_SUGGESTIONS).flat() as string[];
    expect(all).toContain('Rear Doors Open');
  });
});
