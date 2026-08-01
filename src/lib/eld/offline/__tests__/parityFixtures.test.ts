/**
 * Pass B §5 — client/server validation parity fixtures for `certify_rods_day`.
 *
 * Each fixture states one provocation twice: what the on-screen checklist
 * (`validateRodsDay`) does with it, and what SQLSTATE the database raises for
 * it. The pair is the point. A drift in either direction is a defect:
 *
 *   client fails, server accepts  → the driver is blocked by a rule the record
 *                                   does not actually have (except where the
 *                                   asymmetry is deliberate — fixture 17).
 *   client passes, server refuses → the driver taps Certify and gets an opaque
 *                                   database error with nothing highlighted.
 *
 * ONLY codes observed verbatim in `PostgrestError.code` over PostgREST are
 * asserted here — the seeded driver-session run of 2026-07-31 recorded in
 * docs/database-security-conventions.md §5a: P0010–P0015, P0020–P0023, P0030,
 * P0031, plus 42501 for `purge_rods_day`; the 2026-08-01 run that closed
 * the record_source bypass: P0019, P0045, P0046; and the 2026-08-01 23:5x run
 * that provoked the placeholder-name guard from a real driver session: P0032.
 * A code read out of a function body
 * but never seen on the wire is not evidence; that assumption is what produced
 * P0022's wrong attribution earlier.
 *
 * Conditions that are real and reachable but have no wire observation yet are
 * listed in UNOBSERVED_REACHABLE below, with the provocation each one needs.
 * They are absent for want of evidence, not because they do not matter.
 */
import { describe, it, expect } from 'vitest';
import { validateRodsDay, PLACEHOLDER_LEGAL_NAMES } from '@/lib/eld/rodsValidation';
import { newLocalRodsDay, type RodsDay, type RodsEvent } from '@/lib/eld/rodsTypes';
import { REJECTION_SQLSTATES, isRejectionSqlState } from '../queue/types';

/**
 * The wire-observed set. Anything asserted by a fixture must be in here, and
 * every member must be exercised by at least one fixture — both directions are
 * checked at the bottom of this file.
 */
const OBSERVED_CODES = [
  'P0010', 'P0011', 'P0012', 'P0013', 'P0014', 'P0015',
  'P0019',
  'P0020', 'P0021', 'P0022', 'P0023',
  'P0030', 'P0031', 'P0032',
  'P0045', 'P0046',
  '42501',
] as const;
type ObservedCode = (typeof OBSERVED_CODES)[number];

/**
 * Reachable through the app, never yet seen on the wire. Each entry names the
 * provocation that would close the gap. The next person to run a seeded driver
 * session should provoke these, record the codes in
 * docs/database-security-conventions.md §5a, then move them into
 * OBSERVED_CODES with a fixture each.
 *
 * Excluded from the fixtures for want of an observation — NOT because they are
 * unimportant. P0016–P0018 are the whole of the amendment change-record guard,
 * and they are the only untested part of certify_rods_day.
 */
const UNOBSERVED_REACHABLE: Readonly<Record<string, string>> = {
  P0016:
    'Amend a certified day (creates a row with supersedes_day_id), clear '
    + 'amendment_reason on the draft, then call certify_rods_day.',
  P0017:
    'Amend a certified day, keep amendment_reason, and call certify_rods_day '
    + 'with p_changes = [] (or with one entry whose field_path is blank).',
  P0018:
    'Certify an ordinary keyed draft (supersedes_day_id null) while passing a '
    + 'non-empty p_changes array.',
};

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const OTHER_OPERATOR = '22222222-2222-4222-8222-222222222222';
const LOG_DATE = '2026-07-15';

/** A header with every one of the 12 required fields filled in. */
function completeHeader(): Partial<RodsDay> {
  return {
    carrier_name: 'SUPERTRANSPORT LLC',
    carrier_usdot: '1234567',
    carrier_mc: 'MC-987654',
    main_office_address: '100 Main St, Springfield, MO',
    truck_number: '104',
    home_terminal_address: '100 Main St, Springfield, MO',
    home_terminal_timezone: 'America/Chicago',
    from_location: 'Springfield, MO',
    to_location: 'Tulsa, OK',
    co_driver_name: 'None',
    shipping_document_no: 'BOL-55120',
    total_miles_driving_today: 412,
  };
}

function day(overrides: Partial<RodsDay> = {}): RodsDay {
  return newLocalRodsDay({
    id: '33333333-3333-4333-8333-333333333333',
    operator_id: OPERATOR,
    log_date: LOG_DATE,
    overrides: { ...completeHeader(), ...overrides },
  });
}

let seq = 0;
function ev(
  start: number,
  end: number | null,
  overrides: Partial<RodsEvent> = {},
): RodsEvent {
  seq += 1;
  return {
    id: `ev-${seq}`,
    rods_day_id: '33333333-3333-4333-8333-333333333333',
    start_minute: start,
    end_minute: end,
    duty_status: 1,
    city: 'Springfield',
    state: 'MO',
    remarks: null,
    is_short_period: false,
    ...overrides,
  };
}

/** A clean, certifiable 24 hours. */
function fullDayEvents(): RodsEvent[] {
  return [
    ev(0, 360, { duty_status: 2 }),
    ev(360, 420, { duty_status: 4 }),
    ev(420, 1020, { duty_status: 3 }),
    ev(1020, 1440, { duty_status: 1 }),
  ];
}

/**
 * Call context the server has and the screen does not: the token, whether the
 * row exists, who owns it, and what is already certified for the date.
 */
interface CallContext {
  token: string | null;
  dayExists: boolean;
  callerOperatorId: string;
  /** Token already recorded against a DIFFERENT rods_days row. */
  tokenBoundToOtherDay: boolean;
  /** Another CERTIFIED row already holds (operator_id, log_date). */
  duplicateCertifiedDate: boolean;
  legalName: string;
}

function ctx(overrides: Partial<CallContext> = {}): CallContext {
  return {
    token: 'tok-0001',
    dayExists: true,
    callerOperatorId: OPERATOR,
    tokenBoundToOtherDay: false,
    duplicateCertifiedDate: false,
    legalName: 'Flint Alexander',
    ...overrides,
  };
}

/**
 * The guard order inside `certify_rods_day`, transcribed.
 *
 * This is a MODEL, not evidence. Its job is to fail loudly when the SQL is
 * reordered or a condition is retargeted: each fixture carries the code that
 * was observed on the wire as an independent literal, and this function has to
 * agree with it. Two sources, one assertion — a silent drift needs both to be
 * wrong the same way.
 *
 * Guard order, per the 8-arg definition in
 * supabase/migrations/20260801155213_*.sql:
 *   token → row → owner → token/day binding → draft → legal name →
 *   amendment change record → record_source must be 'keyed' (P0019) →
 *   completeness → gap → overlap → 1440 → header →
 *   unique (operator_id, log_date) on certified rows.
 */
function serverGuardOutcome(
  d: RodsDay,
  events: RodsEvent[],
  c: CallContext,
): ObservedCode | null {
  if (!c.token) return 'P0010';
  if (!c.dayExists) return 'P0011';
  if (c.callerOperatorId !== d.operator_id) return 'P0012';
  if (c.tokenBoundToOtherDay) return 'P0013';
  if (d.status !== 'draft') return 'P0014';
  if (c.legalName.trim() === '') return 'P0015';

  // 395.8 requires the driver's name. Non-empty is not the same as real: the
  // codebase's own `|| 'Driver'` fallback clears P0015 and would certify a
  // false entry. Refused in the database, immediately after the empty check.
  if (PLACEHOLDER_LEGAL_NAMES.includes(c.legalName.trim().toLowerCase())) return 'P0032';

  // Layer A of the record_source bypass fix: this function certifies keyed
  // days and nothing else. The content block below is no longer conditional.
  if (d.record_source !== 'keyed') return 'P0019';

  {
    const incomplete = events.filter(
      (e) => e.end_minute === null || e.duty_status === null
        || (e.city ?? '').trim() === '' || (e.state ?? '').trim() === '',
    );
    if (incomplete.length > 0) return 'P0020';

    let cursor = 0;
    for (const e of [...events].sort((a, b) => a.start_minute - b.start_minute)) {
      if (e.start_minute > cursor) return 'P0021';
      if (e.start_minute < cursor) return 'P0022';
      cursor = e.end_minute as number;
    }
    if (cursor !== 1440) return 'P0023';

    const missing =
      (d.total_miles_driving_today ?? -1) < 0
      || ([
        'truck_number', 'carrier_name', 'carrier_usdot', 'carrier_mc',
        'main_office_address', 'home_terminal_address', 'home_terminal_timezone',
        'from_location', 'to_location', 'co_driver_name', 'shipping_document_no',
      ] as const).some((k) => ((d[k] as string | null) ?? '').trim() === '');
    if (missing) return 'P0030';
  }

  if (c.duplicateCertifiedDate) return 'P0031';
  return null;
}

interface Fixture {
  n: number;
  name: string;
  day: RodsDay;
  events: RodsEvent[];
  ctx: CallContext;
  /** Checklist ids expected NOT to be in the 'pass' state. */
  clientBlocks: string[];
  /** Observed SQLSTATE, or null when the server accepts the write. */
  code: ObservedCode | null;
  /** Set when the model above cannot express the provocation. */
  modelled?: false;
  note?: string;
}

const FIXTURES: Fixture[] = [
  {
    n: 1,
    name: 'no certification token',
    day: day(), events: fullDayEvents(), ctx: ctx({ token: null }),
    clientBlocks: [],
    code: 'P0010',
    note: 'Invisible to the checklist: the token is minted at tap time, not a field on the form.',
  },
  {
    n: 2,
    name: 'log row does not exist',
    day: day(), events: fullDayEvents(), ctx: ctx({ dayExists: false }),
    clientBlocks: [],
    code: 'P0011',
  },
  {
    n: 3,
    name: 'caller is not the log owner',
    day: day(), events: fullDayEvents(), ctx: ctx({ callerOperatorId: OTHER_OPERATOR }),
    clientBlocks: [],
    code: 'P0012',
  },
  {
    n: 4,
    name: 'token already bound to another log',
    day: day(), events: fullDayEvents(), ctx: ctx({ tokenBoundToOtherDay: true }),
    clientBlocks: [],
    code: 'P0013',
    note: 'Same token against the SAME day is an idempotent replay, not this.',
  },
  {
    n: 5,
    name: 'log is already certified',
    day: day({ status: 'certified', locked: true }), events: fullDayEvents(), ctx: ctx(),
    clientBlocks: [],
    code: 'P0014',
    note: 'The editor never offers Certify on a certified day; reachable only by a queued replay under a fresh token.',
  },
  {
    n: 6,
    name: 'typed legal name blank',
    day: day(), events: fullDayEvents(), ctx: ctx({ legalName: '' }),
    clientBlocks: ['legal_name'],
    code: 'P0015',
  },
  {
    n: 7,
    name: 'a segment has no end time',
    day: day(),
    events: [ev(0, 360, { duty_status: 2 }), ev(360, null), ev(420, 1440, { duty_status: 3 })],
    ctx: ctx(),
    clientBlocks: ['all_segments_complete', 'no_gaps', 'sums_to_1440'],
    code: 'P0020',
    note: 'Coverage reads pending, not fail, while a segment is unfinished — it still blocks.',
  },
  {
    n: 8,
    name: 'a segment has no city',
    day: day(),
    events: [ev(0, 720, { city: '  ' }), ev(720, 1440, { duty_status: 3 })],
    ctx: ctx(),
    clientBlocks: ['all_segments_complete', 'no_gaps', 'sums_to_1440'],
    code: 'P0020',
  },
  {
    n: 9,
    name: 'gap in the middle of the day',
    day: day(),
    events: [ev(0, 360, { duty_status: 2 }), ev(420, 1440, { duty_status: 3 })],
    ctx: ctx(),
    clientBlocks: ['no_gaps', 'sums_to_1440'],
    code: 'P0021',
  },
  {
    n: 10,
    name: 'two segments overlap',
    day: day(),
    events: [ev(0, 700, { duty_status: 2 }), ev(600, 1440, { duty_status: 3 })],
    ctx: ctx(),
    clientBlocks: ['no_overlaps', 'sums_to_1440'],
    code: 'P0022',
    note: 'Overlap is judged before coverage on both sides; the gap branch is start > cursor, so an overlap can never be reported as P0021.',
  },
  {
    n: 11,
    name: 'day ends short of midnight',
    day: day(),
    events: [ev(0, 720, { duty_status: 2 }), ev(720, 1400, { duty_status: 3 })],
    ctx: ctx(),
    clientBlocks: ['no_gaps', 'sums_to_1440'],
    code: 'P0023',
    note: 'Parity of outcome, not of wording: the screen calls a trailing shortfall a gap, the server calls it unaccounted minutes.',
  },
  {
    n: 12,
    name: 'no duty-status entries at all',
    day: day(), events: [], ctx: ctx(),
    clientBlocks: ['has_segments', 'all_segments_complete', 'no_gaps', 'sums_to_1440'],
    code: 'P0023',
    note: 'The server has no "empty log" condition — zero events reaches the 1440 check with cursor 0.',
  },
  {
    n: 13,
    name: 'carrier name missing from the header',
    day: day({ carrier_name: '   ' }), events: fullDayEvents(), ctx: ctx(),
    clientBlocks: ['header_complete'],
    code: 'P0030',
  },
  {
    n: 14,
    name: 'total miles driving today missing',
    day: day({ total_miles_driving_today: null }), events: fullDayEvents(), ctx: ctx(),
    clientBlocks: ['header_complete'],
    code: 'P0030',
    note: 'Distinct from total_mileage_today — see fixture 17b.',
  },
  {
    n: 15,
    name: 'a certified log already exists for the date',
    day: day(), events: fullDayEvents(), ctx: ctx({ duplicateCertifiedDate: true }),
    clientBlocks: [],
    code: 'P0031',
    note: 'Raised from the unique_violation handler, after every content guard has passed.',
  },
  {
    n: 16,
    name: 'purge_rods_day called without a storage owner',
    day: day(), events: fullDayEvents(), ctx: ctx(),
    clientBlocks: [],
    code: '42501',
    modelled: false,
    note: 'Not a certification path: the only non-P0 code in the observed set, raised by purge_rods_day when the caller is not the service role. Kept here because the runner routes it through the same classifier.',
  },
  {
    n: 17,
    name: 'certify_rods_day refuses a log that is not keyed',
    day: day({
      record_source: 'eld_document',
      source_document_path: `${OPERATOR}/${LOG_DATE}/eld-log.pdf`,
      carrier_name: null, carrier_usdot: null, carrier_mc: null,
      main_office_address: null, truck_number: null,
      home_terminal_address: null, home_terminal_timezone: null,
      from_location: null, to_location: null,
      co_driver_name: null, shipping_document_no: null,
      total_miles_driving_today: null,
    }),
    events: [],
    ctx: ctx(),
    clientBlocks: [
      'has_segments', 'all_segments_complete', 'no_gaps', 'sums_to_1440', 'header_complete',
    ],
    code: 'P0019',
    note:
      'WAS THE BYPASS. Until 2026-08-01 the server skipped the whole segment and header block '
      + 'for record_source = eld_document and ACCEPTED this write. Demonstrated live: a keyed '
      + 'draft with a 60-minute gap was refused P0021, the driver flipped record_source over '
      + 'PostgREST, and the same log then certified with the gap intact and every header field '
      + 'null. It is now refused outright — uploaded documents are filed already-certified by '
      + 'create_eld_document_day and never pass through here.',
  },
  {
    n: 18,
    name: 'record_source changed after the log was filed',
    day: day(), events: fullDayEvents(), ctx: ctx(),
    clientBlocks: [],
    code: 'P0045',
    modelled: false,
    note:
      'Layer B. Not a certify path: raised by the enforce_rods_day_lock trigger on a plain '
      + 'PostgREST UPDATE of record_source, before the lock test and with no rods.privileged '
      + 'exemption. Observed as the demo driver on an unlocked draft they own.',
  },
  {
    n: 19,
    name: 'ELD-document row filed with no source document',
    day: day({ record_source: 'eld_document', source_document_path: null }),
    events: fullDayEvents(), ctx: ctx(),
    clientBlocks: [],
    code: 'P0046',
    modelled: false,
    note:
      'Layer C. Raised by enforce_rods_day_source_document on INSERT or UPDATE, so a row cannot '
      + 'claim document provenance with no document behind it. Observed on a driver INSERT.',
  },
  {
    n: 20,
    name: 'certification legal name is a placeholder, not a name',
    day: day(), events: fullDayEvents(), ctx: ctx({ legalName: 'Driver' }),
    clientBlocks: ['legal_name'],
    code: 'P0032',
    note:
      'Observed over the wire 2026-08-01 from a real driver session against a seeded keyed '
      + 'draft: PostgrestError.code "P0032", message '
      + '\'rods_placeholder_legal_name: "Driver" is not a driver name. A record of duty status '
      + "must be certified in the driver's own legal name.'. A whitespace-only name on the same "
      + 'day returned P0015, and "Marcus Mueller" certified — so the two name guards are '
      + 'distinct conditions and neither shadows the other.',
  },
];

describe('certify_rods_day — client/server parity fixtures', () => {
  it.each(FIXTURES.map((f) => [f.n, f.name, f] as const))(
    'fixture %i — %s',
    (_n, _name, f) => {
      const validation = validateRodsDay(f.day, f.events, f.ctx.legalName);
      const blocked = validation.checks
        .filter((c) => c.state !== 'pass')
        .map((c) => c.id)
        .sort();
      expect(blocked).toEqual([...f.clientBlocks].sort());
      expect(validation.canCertify).toBe(f.clientBlocks.length === 0);

      if (f.modelled !== false) {
        expect(serverGuardOutcome(f.day, f.events, f.ctx)).toBe(f.code);
      }

      if (f.code !== null) {
        expect(OBSERVED_CODES).toContain(f.code);
        // 42501 is a Postgres-defined class, not a queue rejection code.
        if (f.code.startsWith('P0')) {
          expect(isRejectionSqlState(f.code)).toBe(true);
          expect(REJECTION_SQLSTATES[f.code]).toBeTruthy();
        }
      }
    },
  );

  it('fixture 17b — total_mileage_today is optional on BOTH sides', () => {
    // The odometer reading is not a §395.8 required field. Neither the
    // checklist nor the header guard looks at it, and an unavailable reading
    // must never make a log uncertifiable. This locks that in from both ends
    // so a well-meaning addition to either list gets caught here.
    const d = day({ total_mileage_today: null });
    const v = validateRodsDay(d, fullDayEvents(), 'Flint Alexander');
    expect(v.canCertify).toBe(true);
    expect(serverGuardOutcome(d, fullDayEvents(), ctx())).toBeNull();
  });

  it('every observed code is exercised by a fixture', () => {
    const asserted = new Set(FIXTURES.map((f) => f.code).filter((c): c is ObservedCode => !!c));
    const unexercised = OBSERVED_CODES.filter((c) => !asserted.has(c));
    expect(unexercised).toEqual([]);
  });

  it('no fixture asserts a code that was never observed on the wire', () => {
    const strays = FIXTURES
      .map((f) => f.code)
      .filter((c): c is ObservedCode => !!c && !OBSERVED_CODES.includes(c));
    expect(strays).toEqual([]);
  });

  it('fixture numbers are 1..19 with no duplicates', () => {
    expect(FIXTURES.map((f) => f.n)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('unobserved-but-reachable codes are registered and still unasserted', () => {
    for (const [code, recipe] of Object.entries(UNOBSERVED_REACHABLE)) {
      // Real conditions: they must be known to the queue classifier even
      // though no fixture can assert them yet.
      expect(isRejectionSqlState(code)).toBe(true);
      expect(recipe.length).toBeGreaterThan(20);
      expect(OBSERVED_CODES).not.toContain(code);
    }
  });
});
