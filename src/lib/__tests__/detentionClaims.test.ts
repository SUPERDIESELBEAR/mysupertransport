import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_UID, PROFILE_ID, createPgFake } from '@/test/helpers/pgFake';
import { isoToNaive, naiveToIso } from '@/lib/carrierTimezone';

/**
 * The detention claim record, driven through the real save path.
 *
 * Reader fixtures here are never authored: every row read back was written by
 * the same functions Load Detail calls, against a fake that enforces the
 * profiles foreign key and mirrors the stamping trigger from the checked-in
 * SQL's own text.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __pgFake: { client: unknown } };
holder.__pgFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__pgFake.client; },
}));

// The carrier zone must win over the machine's. Karachi is +05:00 with no DST,
// so any browser-local conversion shows up as a ten-hour error.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Asia/Karachi'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

beforeEach(() => fake.reset());

const REPORTED = '2026-08-27T09:30';

async function lib() {
  return import('@/lib/detentionClaims');
}

async function raise(stopId: string | null = 'stop-a') {
  const { raiseDetentionClaim } = await lib();
  return raiseDetentionClaim({
    loadId: 'load-1', loadStopId: stopId, driverReportedAt: REPORTED,
  });
}

describe('raising a claim', () => {
  it('reads back with the actor stamped to the PROFILE id', async () => {
    const row = await raise();
    expect(row.load_id).toBe('load-1');
    expect(row.load_stop_id).toBe('stop-a');
    expect(row.status).toBe('open');
    expect(row.created_by).toBe(PROFILE_ID);
    expect(row.updated_by).toBe(PROFILE_ID);
    expect(row.reported_to).toBe(PROFILE_ID);
    expect(row.created_by).not.toBe(AUTH_UID);
  });

  it('sends no actor column from the client', async () => {
    await raise();
    // Only the trigger may set these; the insert payload carried none of them.
    expect(fake.tables.detention_claims).toHaveLength(1);
    expect(fake.tables.detention_claims[0].notified_by).toBeNull();
  });

  it('round-trips the reported time through the carrier timezone helpers', async () => {
    const row = await raise();
    expect(row.driver_reported_at).toBe(naiveToIso(REPORTED));
    expect(isoToNaive(row.driver_reported_at)).toBe(REPORTED);
  });
});

describe('status', () => {
  it('advances through each transition', async () => {
    const { advanceDetentionClaimStatus, fetchDetentionClaims } = await lib();
    const row = await raise();
    await advanceDetentionClaimStatus({ claimId: row.id, from: 'open', to: 'notified' });
    await advanceDetentionClaimStatus({ claimId: row.id, from: 'notified', to: 'in_discussion' });
    await advanceDetentionClaimStatus({
      claimId: row.id, from: 'in_discussion', to: 'resolved_revision',
    });
    const [claim] = await fetchDetentionClaims('load-1');
    expect(claim.status).toBe('resolved_revision');
    expect(claim.updated_by).toBe(PROFILE_ID);
  });

  it('terminal statuses are terminal', async () => {
    const { advanceDetentionClaimStatus, nextDetentionStatuses } = await lib();
    const row = await raise();
    await advanceDetentionClaimStatus({ claimId: row.id, from: 'open', to: 'abandoned' });
    expect(nextDetentionStatuses('abandoned')).toEqual([]);
    await expect(advanceDetentionClaimStatus({
      claimId: row.id, from: 'abandoned', to: 'notified',
    })).rejects.toThrow(/cannot be moved/i);
  });

  it("'abandoned' is reachable from every live status", async () => {
    const { nextDetentionStatuses } = await lib();
    (['open', 'notified', 'in_discussion'] as const).forEach(s => {
      expect(nextDetentionStatuses(s)).toContain('abandoned');
    });
  });

  it("note and charge are optional and do not block 'resolved_revision'", async () => {
    const { advanceDetentionClaimStatus, fetchDetentionClaims } = await lib();
    const row = await raise();
    await advanceDetentionClaimStatus({ claimId: row.id, from: 'open', to: 'notified' });
    await advanceDetentionClaimStatus({
      claimId: row.id, from: 'notified', to: 'resolved_revision',
    });
    const [claim] = await fetchDetentionClaims('load-1');
    expect(claim.status).toBe('resolved_revision');
    expect(claim.resolution_note).toBeUndefined();
    expect(claim.resulting_charge_id).toBeNull();
  });

  it('links the resulting charge by hand when one is given', async () => {
    const { advanceDetentionClaimStatus, fetchDetentionClaims } = await lib();
    fake.tables.load_charges.push({
      id: 'charge-1', load_id: 'load-1', charge_type: 'detention', amount: 250,
    });
    const row = await raise();
    await advanceDetentionClaimStatus({ claimId: row.id, from: 'open', to: 'notified' });
    await advanceDetentionClaimStatus({
      claimId: row.id, from: 'notified', to: 'resolved_revision', resultingChargeId: 'charge-1',
    });
    const [claim] = await fetchDetentionClaims('load-1');
    expect(claim.resulting_charge_id).toBe('charge-1');
  });
});

describe('broker notification', () => {
  it('stamps notified_by from the profile when the time is recorded', async () => {
    const { recordDetentionNotification, fetchDetentionClaims } = await lib();
    const row = await raise();
    await recordDetentionNotification({
      claimId: row.id, brokerNotifiedAt: '2026-08-27T11:00', method: 'email',
    });
    const [claim] = await fetchDetentionClaims('load-1');
    expect(claim.broker_notified_at).toBe(naiveToIso('2026-08-27T11:00'));
    expect(claim.notification_method).toBe('email');
    expect(claim.notified_by).toBe(PROFILE_ID);
  });

  it('clearing the time clears the actor and the method', async () => {
    const { recordDetentionNotification, fetchDetentionClaims } = await lib();
    const row = await raise();
    await recordDetentionNotification({
      claimId: row.id, brokerNotifiedAt: '2026-08-27T11:00', method: 'email',
    });
    await recordDetentionNotification({ claimId: row.id, brokerNotifiedAt: '', method: '' });
    const [claim] = await fetchDetentionClaims('load-1');
    expect(claim.broker_notified_at).toBeNull();
    expect(claim.notified_by).toBeNull();
    expect(claim.notification_method).toBeNull();
  });
});

describe('claim age', () => {
  it('computes whole days from driver_reported_at', async () => {
    const { detentionClaimAgeDays } = await lib();
    const claim = { driver_reported_at: naiveToIso(REPORTED), status: 'open' as const };
    const now = new Date(new Date(claim.driver_reported_at).getTime() + 3 * 86_400_000);
    expect(detentionClaimAgeDays(claim, now)).toBe(3);
  });

  it('is absent for terminal statuses', async () => {
    const { detentionClaimAgeDays } = await lib();
    const at = naiveToIso(REPORTED);
    const later = new Date(new Date(at).getTime() + 9 * 86_400_000);
    (['resolved_revision', 'denied', 'abandoned'] as const).forEach(status => {
      expect(detentionClaimAgeDays({ driver_reported_at: at, status }, later)).toBeNull();
    });
  });
});
