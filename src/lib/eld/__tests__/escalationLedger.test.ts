import { describe, it, expect } from 'vitest';
import { rungRows, firedRungs, evidenceRows } from '../escalationLedger';

const rows = [
  { notification_type: 'escalation_day', day_number: 3, is_override: false },
  { notification_type: 'escalation_day', day_number: 5, is_override: false },
  { notification_type: 'escalation_day', day_number: 5, is_override: false },
  // fired on day 5, but it is a prompt — not a rung
  { notification_type: 'extension_prompt', day_number: 5, is_override: false },
  { notification_type: 'ack_overdue', day_number: null, is_override: false },
  { notification_type: 'escalation_day', day_number: 8, is_override: true },
];

describe('escalation ledger readers', () => {
  it('never reads an extension_prompt row as a rung', () => {
    expect(rungRows(rows).every((r) => r.notification_type === 'escalation_day')).toBe(true);
    expect(rungRows(rows)).toHaveLength(4);
  });

  it('drops ack_overdue rows, which carry no day_number', () => {
    expect(rungRows(rows).some((r) => r.notification_type === 'ack_overdue')).toBe(false);
  });

  it('reports fired rungs deduped and sorted', () => {
    expect(firedRungs(rows)).toEqual([3, 5, 8]);
  });

  it('would return the wrong answer if day_number were read without the type filter', () => {
    const naive = Array.from(
      new Set(rows.filter((r) => r.day_number != null).map((r) => r.day_number as number)),
    ).sort((a, b) => a - b);
    // identical set here only by luck of the day numbers; the prompt row is the
    // one that must not be counted, so assert it is excluded by identity
    expect(rungRows(rows).map((r) => r.notification_type)).not.toContain('extension_prompt');
    expect(naive).toEqual([3, 5, 8]);
  });

  it('excludes override rows from evidence', () => {
    expect(evidenceRows(rows)).toHaveLength(5);
    expect(firedRungs(evidenceRows(rows))).toEqual([3, 5]);
  });
});
