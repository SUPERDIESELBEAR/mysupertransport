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

describe('the live roster', () => {
  itLive('includes exactly the drivers meeting all five conditions', () => {
    const [listed] = psql(
      `select count(*) from operators o left join onboarding_status s on s.operator_id=o.id
       where o.is_active and not coalesce(o.is_demo,false)`,
    );
    const [included] = psql(
      `select count(*) from operators o left join onboarding_status s on s.operator_id=o.id
       where ${FILTER_SQL}`,
    );
    expect(Number(listed)).toBe(60);
    expect(Number(included)).toBe(46);
  });

  itLive('no driver with a setting of his own falls outside the filter', () => {
    const [outside] = psql(
      `select count(*) from operators o left join onboarding_status s on s.operator_id=o.id
       where o.fuel_discount_passthrough_override is not null and not (${FILTER_SQL})`,
    );
    expect(Number(outside)).toBe(0);
  });

  itLive('Christopher Harris does not appear', () => {
    const rows = psql(
      `select (${FILTER_SQL}) from operators o
       join profiles p on p.user_id = o.user_id
       left join onboarding_status s on s.operator_id = o.id
       where btrim(p.first_name)='Christopher' and btrim(p.last_name)='Harris'`,
    );
    expect(rows).toEqual(['f']);
  });

  itLive('Daniel Vazquez Gonzalez and Jonathan Grant do not appear, despite holding units', () => {
    const rows = psql(
      `select btrim(p.first_name||' '||p.last_name)||'|'||(${FILTER_SQL})||'|'||coalesce(s.unit_number,'')
       from operators o join profiles p on p.user_id = o.user_id
       left join onboarding_status s on s.operator_id = o.id
       where btrim(p.first_name||' '||p.last_name) in ('Daniel Vazquez Gonzalez','Jonathan Grant')
       order by 1`,
    );
    expect(rows).toEqual(['Daniel Vazquez Gonzalez|f|271', 'Jonathan Grant|f|268']);
  });

  itLive('every active driver excluded from dispatch still appears', () => {
    const [total] = psql(
      `select count(*) from operators o left join onboarding_status s on s.operator_id=o.id
       where o.is_active and not coalesce(o.is_demo,false) and o.excluded_from_dispatch`,
    );
    const [shown] = psql(
      `select count(*) from operators o left join onboarding_status s on s.operator_id=o.id
       where o.excluded_from_dispatch and (${FILTER_SQL})`,
    );
    expect(Number(total)).toBe(11);
    expect(Number(shown)).toBe(11);
  });
});
