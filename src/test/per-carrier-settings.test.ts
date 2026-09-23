/**
 * DEMO CARRIER STAGE 4 PART 2a — settings are per carrier, and no column
 * default carries SUPERTRANSPORT's own values.
 *
 * - pei_cadence_settings is keyed by company_id (the boolean singleton key that
 *   allowed exactly one row in the whole system is retired);
 * - inspection_program_settings and fleet_settings have one row per carrier and
 *   the programme has an on/off switch;
 * - no column default names SUPERTRANSPORT, its USDOT/MC, its email domain,
 *   its 'ST' prefix, Pleasant Hill, or its FMCSA state.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const HAS_DB = !!process.env.PGHOST;

function psql(sql: string): string[] {
  const out = execFileSync('psql', ['-XAt', '-c', sql], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

describe.skipIf(!HAS_DB)('per-carrier settings (live)', () => {
  it('pei_cadence_settings is keyed by company_id', () => {
    const [def] = psql(`select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.pei_cadence_settings'::regclass and contype='p'`);
    expect(def).toBe('PRIMARY KEY (company_id)');
    expect(psql(`select count(*) from pg_constraint
      where conrelid='public.pei_cadence_settings'::regclass and conname='pei_cadence_settings_id_check'`)[0]).toBe('0');
  });

  it('one row per carrier for the inspection programme and fleet settings', () => {
    const rows = psql(`select indexrelid::regclass::text from pg_index
      where indisunique and indrelid in ('public.inspection_program_settings'::regclass,'public.fleet_settings'::regclass)
        and pg_get_indexdef(indexrelid) ~ '\\(company_id\\)$' order by 1`);
    expect(rows).toEqual(['fleet_settings_company_uniq', 'inspection_program_settings_company_uniq']);
  });

  it('the inspection programme has an on/off switch, on by default', () => {
    const [row] = psql(`select is_nullable||' '||column_default from information_schema.columns
      where table_schema='public' and table_name='inspection_program_settings' and column_name='programme_enabled'`);
    expect(row).toBe('NO true');
  });

  it('no column default carries SUPERTRANSPORT values', () => {
    const rows = psql(`select table_name||'.'||column_name||' = '||column_default
      from information_schema.columns where table_schema='public' and column_default is not null
       and (column_default ilike '%supertransport%' or column_default ilike '%2309365%'
         or column_default ilike '%788425%' or column_default ~ '''ST'''
         or column_default ilike '%pleasant hill%' or column_default = '''MO''::text')`);
    expect(rows).toEqual([]);
  });
});
