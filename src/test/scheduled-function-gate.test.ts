import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceLabel } from '@/components/dispatch/loadDetail/StatusHistoryCard';

/**
 * 2026-09-24: the five scheduled functions that had no caller check now refuse
 * anyone without x-cron-secret (or the service role). notify-pwa-install also
 * admits a signed-in staff session, for its three staff buttons.
 */
const CRON_ONLY = [
  'send-birthday-anniversary',
  'cron-cert-reminders',
  'send-unread-message-reminders',
  'pei-auto-cadence',
];

const src = (fn: string) => readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');

describe('scheduled functions refuse unauthenticated callers', () => {
  it.each(CRON_ONLY)('%s gates on isCronCaller before any work', fn => {
    const s = src(fn);
    const gate = s.indexOf('if (!isCronCaller(req)) return forbidden(corsHeaders);');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(s.indexOf('createClient(', s.indexOf('Deno.serve')));
  });

  it('notify-pwa-install admits cron OR staff only', () => {
    const s = src('notify-pwa-install');
    expect(s).toContain('isCronCaller(req)');
    expect(s).toContain('getClaims(token)');
    expect(s).toMatch(/STAFF_ROLES = \['onboarding_staff', 'dispatcher', 'management', 'owner'\]/);
    expect(s).not.toMatch(/'operator'/);
  });
});

describe('status history source labels', () => {
  it('labels a missing source plainly and never guesses one', () => {
    expect(sourceLabel(null)).toBe('recorded without a source');
    expect(sourceLabel('staff_screen')).toBe('Staff screen');
    expect(sourceLabel('driver_app')).toBe('Driver app');
    expect(sourceLabel('system')).toBe('System');
  });
});
