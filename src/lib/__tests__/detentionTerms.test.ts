import { describe, expect, it } from 'vitest';
import { resolveMigrationFunctions } from '@/test/helpers/migrationFunctions';
import {
  DETENTION_CLOCK_START_LABELS,
  freeTimeLabel,
  hasAnyDetentionTerms,
  needsNotificationPrompt,
  notificationLabel,
  readDetentionTerms,
  EMPTY_DETENTION_TERMS,
} from '@/lib/detentionTerms';

/**
 * NULL means NOT STATED. The tests below exist to keep a convention from
 * becoming a contract term: nothing in this module may invent two hours of
 * free time, and nothing may collapse "not stated" into "not required".
 */

const openClaim = { broker_notified_at: null, status: 'open' };

describe('detention terms reader', () => {
  it('reads a fully stated set of terms', () => {
    const t = readDetentionTerms({
      detention_free_time_minutes: 90,
      detention_rate_per_hour: 55,
      detention_daily_cap: 440,
      detention_clock_start: 'gate_checkin',
      detention_notification_required: true,
      detention_terms_note: 'Must call dispatch desk before departing.',
    });
    expect(t.freeTimeMinutes).toBe(90);
    expect(t.ratePerHour).toBe(55);
    expect(t.dailyCap).toBe(440);
    expect(t.clockStart).toBe('gate_checkin');
    expect(t.notificationRequired).toBe(true);
    expect(hasAnyDetentionTerms(t)).toBe(true);
  });

  it('reads an empty load as no terms stated, with no defaults invented', () => {
    const t = readDetentionTerms({});
    expect(t).toEqual(EMPTY_DETENTION_TERMS);
    expect(hasAnyDetentionTerms(t)).toBe(false);
    expect(t.freeTimeMinutes).toBeNull();
  });

  it('keeps an explicit false distinct from not stated', () => {
    expect(readDetentionTerms({ detention_notification_required: false })
      .notificationRequired).toBe(false);
    expect(readDetentionTerms({ detention_notification_required: null })
      .notificationRequired).toBeNull();
    expect(hasAnyDetentionTerms(readDetentionTerms({
      detention_notification_required: false,
    }))).toBe(true);
  });

  it('says free time in minutes and never rounds it into a convention', () => {
    expect(freeTimeLabel(90)).toBe('90 minutes (1 hour 30 min)');
    expect(freeTimeLabel(120)).toBe('120 minutes (2 hours)');
    expect(freeTimeLabel(45)).toBe('45 minutes');
    expect(freeTimeLabel(null)).toBeNull();
  });

  it('renders the clock start in plain words, not the enum key', () => {
    expect(DETENTION_CLOCK_START_LABELS.appointment)
      .toBe('Clock starts at the scheduled appointment');
    expect(Object.values(DETENTION_CLOCK_START_LABELS).join(' ')).not.toMatch(/gate_checkin/);
  });

  it('labels the notification tri-state distinctly', () => {
    expect(notificationLabel(true)).toMatch(/must be notified/i);
    expect(notificationLabel(false)).toMatch(/no notification required/i);
    expect(notificationLabel(null)).toBeNull();
  });
});

describe('notification prompt (Part C)', () => {
  const required = readDetentionTerms({ detention_notification_required: true });

  it('appears when notification is required and the open claim has none recorded', () => {
    expect(needsNotificationPrompt(required, openClaim)).toBe(true);
  });

  it('is silent once a notification is recorded', () => {
    expect(needsNotificationPrompt(required, {
      broker_notified_at: '2026-08-27T15:00:00.000Z', status: 'notified',
    })).toBe(false);
  });

  it('is silent when the requirement is not stated', () => {
    expect(needsNotificationPrompt(readDetentionTerms({}), openClaim)).toBe(false);
  });

  it('is silent when the terms explicitly do not require notification', () => {
    expect(needsNotificationPrompt(
      readDetentionTerms({ detention_notification_required: false }), openClaim,
    )).toBe(false);
  });

  it('is silent on a claim that is already finished', () => {
    ['resolved_revision', 'denied', 'abandoned'].forEach(status => {
      expect(needsNotificationPrompt(required, { broker_notified_at: null, status })).toBe(false);
    });
  });
});

describe('operator write surface', () => {
  it('does not grant operators any detention terms column', () => {
    const resolved = Array.from(resolveMigrationFunctions().values())
      .find(f => f.name === 'public.enforce_loads_operator_update');
    const body = resolved?.block ?? '';
    expect(body).not.toBe('');
    const allowed = /allowed\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/.exec(body)?.[1] ?? '';
    expect(allowed).not.toBe('');
    expect(allowed).not.toMatch(/detention/);
    // The allow-list is fixed by an earlier pass and must not have grown here.
    expect(allowed.match(/'/g)?.length).toBe(10);
  });
});
