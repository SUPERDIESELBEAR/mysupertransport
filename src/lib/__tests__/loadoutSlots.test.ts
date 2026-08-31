import { describe, expect, it } from 'vitest';
import {
  LOADOUT_SLOTS, LOADOUT_STAGES, LOADOUT_STAGE_DOCUMENT_TYPE, requiredLoadoutSlots,
} from '@/lib/loadoutSlots';
import { DEFAULT_LOAD_PAPERWORK, evaluateLoadPaperwork } from '@/lib/loadPaperwork';

describe('loadout slots are the single source of truth', () => {
  it('the predicate carries exactly the required slots, in slot order', () => {
    const expected = LOADOUT_STAGES.flatMap(stage =>
      requiredLoadoutSlots(stage).map(s => ({
        documentType: LOADOUT_STAGE_DOCUMENT_TYPE[stage],
        photoLabel: s.photoLabel,
      })),
    );
    const actual = DEFAULT_LOAD_PAPERWORK.loadout.map(r => ({
      documentType: r.documentType,
      photoLabel: r.photoLabel,
    }));
    expect(actual).toEqual(expected);
  });

  it('every loadout requirement is pinned to a slot label — no unlabelled catch-all', () => {
    expect(DEFAULT_LOAD_PAPERWORK.loadout.every(r => !!r.photoLabel)).toBe(true);
  });

  it('the roof check stores the exact legacy label, so no backfill is needed', () => {
    const roof = LOADOUT_SLOTS.pickup.find(s => s.key === 'pickup_roof_check');
    expect(roof?.photoLabel).toBe('Rear Doors Open');
  });

  it('the roof check instruction says what to look for and never says climb', () => {
    const roof = LOADOUT_SLOTS.pickup.find(s => s.key === 'pickup_roof_check');
    expect(roof?.instruction).toMatch(/daylight/i);
    expect(LOADOUT_STAGES.flatMap(s => LOADOUT_SLOTS[s]).some(s => /climb on|get on top|on the roof/i.test(s.instruction)))
      .toBe(false);
  });

  it('every slot carries an instruction', () => {
    LOADOUT_STAGES.forEach(stage => {
      LOADOUT_SLOTS[stage].forEach(s => expect(s.instruction.trim().length).toBeGreaterThan(0));
    });
  });

  it('delivery has no roof check and no inspection sticker', () => {
    const labels = LOADOUT_SLOTS.delivery.map(s => s.photoLabel);
    expect(labels).not.toContain('Rear Doors Open');
    expect(labels).not.toContain('Annual Inspection Sticker');
    expect(LOADOUT_SLOTS.delivery.some(s => s.kind === 'sticker')).toBe(false);
  });

  it('delivery requires location signage; pickup does not', () => {
    expect(LOADOUT_SLOTS.delivery.map(s => s.photoLabel)).toContain('Delivery Location Signage');
    expect(LOADOUT_SLOTS.pickup.map(s => s.photoLabel)).not.toContain('Delivery Location Signage');
  });

  it('damage is optional and repeatable on both stages', () => {
    LOADOUT_STAGES.forEach(stage => {
      const d = LOADOUT_SLOTS[stage].find(s => s.kind === 'damage');
      expect(d?.required).toBe(false);
      expect(d?.repeatable).toBe(true);
    });
  });

  it('required slots hold the paperwork, not the driver — they only affect completeness', () => {
    const none = evaluateLoadPaperwork('loadout', [], []);
    expect(none.complete).toBe(false);
    // Nothing in the predicate expresses a block; it reports outstanding work only.
    expect(none.outstandingRequired.length).toBe(DEFAULT_LOAD_PAPERWORK.loadout.length);
    expect(none.outstandingExpected).toEqual([]);
  });

  it('pins the exact required slot set per stage — Loadout Trailer Guide v2.0', () => {
    expect(requiredLoadoutSlots('pickup').map(s => s.photoLabel)).toEqual([
      'Front', 'Driver Side', 'Passenger Side', 'Rear Doors Closed', 'Rear Doors Open',
      'Trailer Number Plate', 'VIN Plate', 'Tires and Wheels', 'Annual Inspection Sticker',
    ]);
    expect(requiredLoadoutSlots('delivery').map(s => s.photoLabel)).toEqual([
      'Front', 'Driver Side', 'Passenger Side', 'Rear Doors Closed',
      'Trailer Number Plate', 'VIN Plate', 'Tires and Wheels', 'Delivery Location Signage',
    ]);
    expect(requiredLoadoutSlots('pickup')).toHaveLength(9);
    expect(requiredLoadoutSlots('delivery')).toHaveLength(8);
  });

  it('the sticker slot is satisfied by any of the three answers being on file', () => {
    const withAnswer = evaluateLoadPaperwork(
      'loadout',
      [{ document_type: 'loadout_pickup_inspection', photo_label: 'Annual Inspection Sticker' }],
      [],
    );
    expect(withAnswer.satisfied.some(s => s.requirement.photoLabel === 'Annual Inspection Sticker')).toBe(true);
  });
});
