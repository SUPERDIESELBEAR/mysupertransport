/**
 * Home-card wording for outstanding paperwork.
 *
 * Presentation only. The predicate and the slot definitions are the subject of
 * their own suites; what is asserted here is that the driver's FIRST screen
 * shows a count for guided loadout photos and still NAMES ordinary documents.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_PAPERWORK, evaluateLoadPaperwork } from '@/lib/loadPaperwork';
import { summarizeOutstandingPaperwork } from '@/lib/paperworkSummary';
import { LOADOUT_SLOTS, LOADOUT_STAGES, optionalLoadoutSlots, requiredLoadoutSlots } from '@/lib/loadoutSlots';

describe('summarizeOutstandingPaperwork', () => {
  it('collapses a loadout with nothing captured to one count per stage', () => {
    const status = evaluateLoadPaperwork('loadout', [], []);
    const lines = summarizeOutstandingPaperwork(status.outstandingRequired);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      `Pickup inspection — ${requiredLoadoutSlots('pickup').length} photos still needed`,
    );
    expect(lines[1]).toBe(
      `Delivery inspection — ${requiredLoadoutSlots('delivery').length} photos still needed`,
    );

    // Not an item list: no individual slot title survives into the summary.
    const joined = lines.join(' · ');
    for (const stage of LOADOUT_STAGES) {
      for (const slot of LOADOUT_SLOTS[stage]) {
        expect(joined).not.toContain(slot.title);
      }
    }
  });

  it('never counts optional slots', () => {
    const optional = LOADOUT_STAGES.flatMap(s => optionalLoadoutSlots(s));
    expect(optional.length).toBeGreaterThan(0); // otherwise the assertion is vacuous

    const status = evaluateLoadPaperwork('loadout', [], []);
    const lines = summarizeOutstandingPaperwork(status.outstandingRequired);

    const total = LOADOUT_STAGES.reduce((n, s) => n + requiredLoadoutSlots(s).length, 0);
    const counted = lines
      .map(l => Number(/— (\d+) photo/.exec(l)?.[1] ?? 0))
      .reduce((a, b) => a + b, 0);

    expect(counted).toBe(total);
    expect(counted).toBeLessThan(
      total + optional.length,
    );
    expect(DEFAULT_LOAD_PAPERWORK.loadout).toHaveLength(total);
  });

  it('counts down as photos are captured, and singularises at one', () => {
    const required = requiredLoadoutSlots('pickup');
    const docs = required.slice(0, required.length - 1).map(slot => ({
      document_type: 'loadout_pickup_inspection',
      photo_label: slot.photoLabel,
    }));
    const status = evaluateLoadPaperwork('loadout', docs, []);
    const lines = summarizeOutstandingPaperwork(status.outstandingRequired);

    expect(lines[0]).toBe('Pickup inspection — 1 photo still needed');
  });

  it('still names the documents on a non-loadout load', () => {
    const status = evaluateLoadPaperwork('per_ton', [], []);
    const lines = summarizeOutstandingPaperwork(status.outstandingRequired);

    expect(lines).toEqual(['Proof of delivery', 'Scale ticket']);
  });

  it('returns nothing when nothing is outstanding', () => {
    expect(summarizeOutstandingPaperwork([])).toEqual([]);
    expect(summarizeOutstandingPaperwork(null)).toEqual([]);
  });
});
