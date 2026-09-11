/**
 * WHO THE FUEL DISCOUNT EXCEPTIONS LIST SHOWS — asserted against live data.
 *
 * The filter exists so applicants and unfinished onboarding records stop
 * appearing on a pay screen. The risk it carries is the opposite one: silently
 * removing a working driver, or hiding a setting that is still in force. Both
 * are asserted here, and the named cases are the real rows the decision was
 * made from.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import { isSetUpDriver, selectExceptionListRows, type DriverSetupStatus } from '@/lib/fuel/setupDriverFilter';
import { resolveDiscountPassthrough } from '@/lib/fuel/discountPassthrough';

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('passthroughDriverList.test.ts LIVE CHECKS DID NOT RUN', [
    'No PGHOST, so the included/excluded counts could not be checked against',
    'the fleet the screen actually reads.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live roster could not be read',
  details: ['The filter is only meaningful against the drivers that exist.'],
});

const psql = (sql: string): string[] =>
  execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);

const FILTER_SQL = `o.is_active and not coalesce(o.is_demo,false)
  and coalesce(s.fully_onboarded,false)
  and s.go_live_date is not null and s.insurance_added_date is not null`;

const setUp = (over: Partial<DriverSetupStatus> = {}): DriverSetupStatus => ({
  isActive: true, isDemo: false, fullyOnboarded: true,
  goLiveDate: '2026-05-06', insuranceAddedDate: '2026-05-06', ...over,
});

describe('the five conditions', () => {
  it('all five, or the driver is not set up', () => {
    expect(isSetUpDriver(setUp())).toBe(true);
    expect(isSetUpDriver(setUp({ isActive: false }))).toBe(false);
    expect(isSetUpDriver(setUp({ isDemo: true }))).toBe(false);
    expect(isSetUpDriver(setUp({ fullyOnboarded: false }))).toBe(false);
    expect(isSetUpDriver(setUp({ goLiveDate: null }))).toBe(false);
    expect(isSetUpDriver(setUp({ insuranceAddedDate: null }))).toBe(false);
    expect(isSetUpDriver(undefined)).toBe(false);
  });

  it('being off dispatch is deliberately not one of them', () => {
    // the field is not read at all; a driver off dispatch still has a pay arrangement
    expect(isSetUpDriver({ ...setUp(), ...({ excludedFromDispatch: true } as object) })).toBe(true);
  });
});

describe('a setting that exists is never hidden', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];
  const status = new Map<string, DriverSetupStatus>([
    ['a', setUp()], ['b', setUp({ fullyOnboarded: false })],
  ]);

  it('drops an unonboarded driver with no setting', () => {
    expect(selectExceptionListRows(rows, status, () => false).map(r => r.id)).toEqual(['a']);
  });

  it('keeps an unonboarded driver who has one, marked', () => {
    const out = selectExceptionListRows(rows, status, id => id === 'b');
    expect(out.map(r => r.id)).toEqual(['a', 'b']);
    expect(out.find(r => r.id === 'b')!.offList).toBe(true);
    expect(out.find(r => r.id === 'a')!.offList).toBe(false);
  });
});

describe('the engine is untouched by the display filter', () => {
  it('resolves the same for a filtered-out driver as for a listed one', () => {
    for (const company of [true, false]) {
      for (const override of [null, true, false] as (boolean | null)[]) {
        expect(resolveDiscountPassthrough(override, company))
          .toBe(override == null ? company : override);
      }
    }
  });
});

/**
 * WHY THE FILTER EXISTS — evidence, not an assertion.
 *
 * Christopher Harris, as he stood on 2026-09-11: active but on hold with the
 * reason "Lost communication", not fully onboarded, no go-live date, no
 * insurance date, zero loads, zero fuel transactions, no unit. He was the row
 * the owner pointed at when he asked why applicants were on a pay screen.
 *
 * His absence is NOT asserted. If he finishes onboarding — the outcome the
 * business wants — he should appear, and no test should fail for it. The same
 * goes for Daniel Vazquez Gonzalez and Jonathan Grant, who held units 271 and
 * 268 while unonboarded: the invariant below is that a unit never grants
 * inclusion, over whoever holds one today.
 */
describe('the live roster', () => {
  interface LiveRow {
    id: string; name: string;
    isActive: boolean; isDemo: boolean; fullyOnboarded: boolean;
    goLiveDate: string | null; insuranceAddedDate: string | null;
    excludedFromDispatch: boolean; unitNumber: string | null;
    hasOverride: boolean; listedBySql: boolean;
  }

  const bool = (v: string) => v === 't' || v === 'true';
  const nul = (v: string) => (v === '' ? null : v);

  const liveRows = (): LiveRow[] =>
    psql(
      `select o.id
        ||'\u0001'||btrim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,''))
        ||'\u0001'||o.is_active
        ||'\u0001'||coalesce(o.is_demo,false)
        ||'\u0001'||coalesce(s.fully_onboarded,false)
        ||'\u0001'||coalesce(s.go_live_date::text,'')
        ||'\u0001'||coalesce(s.insurance_added_date::text,'')
        ||'\u0001'||coalesce(o.excluded_from_dispatch,false)
        ||'\u0001'||coalesce(s.unit_number,'')
        ||'\u0001'||(o.fuel_discount_passthrough_override is not null)
        ||'\u0001'||(${FILTER_SQL})
       from operators o
       left join profiles p on p.user_id = o.user_id
       left join onboarding_status s on s.operator_id = o.id
       where o.is_active and not coalesce(o.is_demo,false)`,
    ).map(line => {
      const c = line.split('\u0001');
      return {
        id: c[0], name: c[1],
        isActive: bool(c[2]), isDemo: bool(c[3]), fullyOnboarded: bool(c[4]),
        goLiveDate: nul(c[5]), insuranceAddedDate: nul(c[6]),
        excludedFromDispatch: bool(c[7]), unitNumber: nul(c[8]),
        hasOverride: bool(c[9]), listedBySql: bool(c[10]),
      };
    });

  const listed = (r: LiveRow) => isSetUpDriver(r);

  itLive('every listed driver meets all five conditions', () => {
    const failures = liveRows().filter(listed).filter(
      r => !r.isActive || r.isDemo || !r.fullyOnboarded || !r.goLiveDate || !r.insuranceAddedDate,
    );
    expect(failures.map(r => r.name)).toEqual([]);
  });

  itLive('every driver meeting all five conditions is listed — no difference either way', () => {
    const rows = liveRows();
    expect(rows.filter(r => listed(r) && !r.listedBySql).map(r => r.name)).toEqual([]);
    expect(rows.filter(r => !listed(r) && r.listedBySql).map(r => r.name)).toEqual([]);
    // the roster is non-empty, so the two empty differences are not vacuous
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(listed).length).toBeGreaterThan(0);
  });

  itLive('being off dispatch never removes a driver who is otherwise set up', () => {
    const offDispatch = liveRows().filter(r => r.excludedFromDispatch);
    const wronglyDropped = offDispatch.filter(
      r => isSetUpDriver({ ...r, excludedFromDispatch: false } as DriverSetupStatus) && !listed(r),
    );
    expect(wronglyDropped.map(r => r.name)).toEqual([]);
  });

  itLive('holding a unit never grants inclusion', () => {
    const admittedOnAUnit = liveRows().filter(
      r => Boolean(r.unitNumber) && listed(r)
        && !(r.fullyOnboarded && r.goLiveDate && r.insuranceAddedDate),
    );
    expect(admittedOnAUnit.map(r => `${r.name} (unit ${r.unitNumber})`)).toEqual([]);
  });

  itLive('a driver carrying a setting of his own is never dropped by the filter', () => {
    const rows = liveRows();
    const withSetting = rows.filter(r => r.hasOverride);
    const shown = selectExceptionListRows(
      rows.map(r => ({ id: r.id })),
      new Map(rows.map(r => [r.id, r as DriverSetupStatus])),
      id => rows.find(r => r.id === id)!.hasOverride,
    );
    const shownIds = new Set(shown.map(r => r.id));
    expect(withSetting.filter(r => !shownIds.has(r.id)).map(r => r.name)).toEqual([]);
  });
});

