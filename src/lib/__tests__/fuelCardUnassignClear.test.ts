import { describe, expect, it } from 'vitest';
import { shouldClearRecordedSerial } from '@/lib/equipmentSync';

/**
 * EVIDENCE (2026-09-12). The owner moved Ali Mohamed from fuel card 212 to 224.
 * The unassign of 212 ran at 23:38:32 and the assignment of 224 at 23:39:41 —
 * the unassign came FIRST, so the blind clear wiped an already-stale value and
 * 224 was written afterwards. The recorded number survived by ordering alone;
 * the reverse order would have left him with no card on file and his fuel
 * unmatched on the next import.
 */
describe('clearing the recorded fuel card on unassign', () => {
  it('clears when the unassigned card is the one on file', () => {
    expect(shouldClearRecordedSerial('212', '212')).toBe(true);
  });

  it('leaves a newer recorded card alone when an older one is unassigned', () => {
    expect(shouldClearRecordedSerial('224', '212')).toBe(false);
  });

  it('ignores formatting differences rather than treating them as a different card', () => {
    expect(shouldClearRecordedSerial(' 212-a ', '212A')).toBe(true);
  });

  it('does nothing when no card is recorded', () => {
    expect(shouldClearRecordedSerial(null, '212')).toBe(false);
    expect(shouldClearRecordedSerial('', '212')).toBe(false);
  });

  it('does nothing when the unassigned item has no serial', () => {
    expect(shouldClearRecordedSerial('212', null)).toBe(false);
  });
});
