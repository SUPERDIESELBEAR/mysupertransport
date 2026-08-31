import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_PAPERWORK, evaluateLoadPaperwork } from '@/lib/loadPaperwork';
import { requiredLoadoutSlots } from '@/lib/loadoutSlots';


const doc = (document_type: string, photo_label?: string) => ({ document_type, photo_label });
const exc = (document_type: string, status: string, photo_label?: string | null) =>
  ({ document_type, status, photo_label: photo_label ?? null });

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
  const every = (type: string, stage: 'pickup' | 'delivery') =>
    requiredLoadoutSlots(stage).map(s => doc(type, s.photoLabel));
  const full = [
    ...every('loadout_pickup_inspection', 'pickup'),
    ...every('loadout_delivery_inspection', 'delivery'),
  ];

  it('is incomplete when no photo is labelled Rear Doors Open', () => {
    const r = evaluateLoadPaperwork(
      'loadout',
      full.filter(d => d.photo_label !== 'Rear Doors Open'),
      [],
    );
    expect(r.complete).toBe(false);
    expect(r.outstandingRequired.map(x => x.photoLabel)).toEqual(['Rear Doors Open']);
  });

  it('matches the roof check after trimming and case-folding', () => {
    const r = evaluateLoadPaperwork(
      'loadout',
      [
        ...full.filter(d => d.photo_label !== 'Rear Doors Open'),
        doc('loadout_pickup_inspection', 'rear doors open '),
      ],
      [],
    );
    expect(r.complete).toBe(true);
  });

  it('is complete only once every required slot is captured', () => {
    expect(evaluateLoadPaperwork('loadout', full, []).complete).toBe(true);
    expect(evaluateLoadPaperwork('loadout', full.slice(1), []).complete).toBe(false);
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

describe('exceptions are scoped to a photo label on loadout', () => {
  const pickupLabels = requiredLoadoutSlots('pickup').map(s => s.photoLabel);

  it('an approved Front exception satisfies only the Front requirement', () => {
    const r = evaluateLoadPaperwork(
      'loadout', [], [exc('loadout_pickup_inspection', 'approved', 'Front')],
    );
    const stillOut = r.outstandingRequired
      .filter(x => x.documentType === 'loadout_pickup_inspection')
      .map(x => x.photoLabel);
    expect(stillOut).toEqual(pickupLabels.filter(l => l !== 'Front'));
    expect(stillOut).toHaveLength(pickupLabels.length - 1);
    expect(r.satisfied.map(s => s.requirement.photoLabel)).toEqual(['Front']);
  });

  it('an approved exception with no photo label satisfies nothing', () => {
    const r = evaluateLoadPaperwork(
      'loadout', [], [exc('loadout_pickup_inspection', 'approved', null)],
    );
    expect(r.satisfied).toEqual([]);
    expect(r.complete).toBe(false);
  });

  it('matches the label after trimming and case-folding', () => {
    const r = evaluateLoadPaperwork(
      'loadout', [], [exc('loadout_pickup_inspection', 'approved', ' front ')],
    );
    expect(r.satisfied.map(s => s.requirement.photoLabel)).toEqual(['Front']);
  });

  it('a pending scoped exception is reported only against its own slot', () => {
    const r = evaluateLoadPaperwork(
      'loadout', [], [exc('loadout_pickup_inspection', 'pending', 'Front')],
    );
    expect(r.pendingExceptions.map(x => x.photoLabel)).toEqual(['Front']);
  });
});
