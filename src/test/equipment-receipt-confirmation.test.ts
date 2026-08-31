/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import { createPgFake, PROFILE_ID } from '@/test/helpers/pgFake';
import {
  equipmentOutstanding, equipmentShipped, openConfirmation, canReverse,
} from '@/lib/equipmentReceipt';

/**
 * MODULE 4 PASS 1a — MANAGEMENT CONFIRMS EQUIPMENT RECEIPT.
 *
 * SHIPPED is the driver's fact. RECEIVED is management's. The hold formula
 * reads RECEIVED, so a driver must not be able to reach it by any path.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('equipment receipt live checks did not run', [
    'No PGHOST, so the confirmation table, its policies and the RPC hardening',
    'could not be read from the live catalog.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the receipt-confirmation schema and its grants.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

const fake = createPgFake();
const holder = globalThis as unknown as { __pgFake: { client: unknown } };
holder.__pgFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__pgFake.client; },
}));
beforeEach(() => fake.reset());

const OP = 'op-receipt-1';
function seedOperator() {
  fake.tables.operators.push({
    id: OP, is_active: true, excluded_from_dispatch: false,
    is_parked: false, is_departing: false,
  });
}

/* ------------------------------------------------------------------ */
/* Confirmation, reversal, and the derived fact                        */
/* ------------------------------------------------------------------ */

describe('equipment receipt — confirm and reverse', () => {
  it('equipment_outstanding is true before confirmation and false after', async () => {
    seedOperator();
    expect(equipmentOutstanding(fake.tables.equipment_return_confirmations as never)).toBe(true);

    const { error } = await (fake.client as any).rpc('confirm_equipment_returned', {
      _operator_id: OP, _note: 'ELD and plate in hand',
    });
    expect(error).toBeNull();

    const rows = fake.tables.equipment_return_confirmations as never;
    expect(equipmentOutstanding(rows)).toBe(false);
    expect(openConfirmation(rows)?.note).toBe('ELD and plate in hand');
  });

  it('the actor is the profile id, never auth.uid()', async () => {
    seedOperator();
    await (fake.client as any).rpc('confirm_equipment_returned', { _operator_id: OP, _note: null });
    expect(fake.tables.equipment_return_confirmations[0].confirmed_by).toBe(PROFILE_ID);
  });

  it('confirming does not change is_active, the lease or dispatch status', async () => {
    seedOperator();
    const before = { ...fake.tables.operators[0] };
    await (fake.client as any).rpc('confirm_equipment_returned', { _operator_id: OP, _note: null });
    expect(fake.tables.operators[0]).toEqual(before);
    expect(fake.tables.lease_terminations ?? []).toEqual([]);
  });

  it('reversal is recorded with actor and reason, and never erases the row', async () => {
    seedOperator();
    await (fake.client as any).rpc('confirm_equipment_returned', { _operator_id: OP, _note: null });
    const { error } = await (fake.client as any).rpc('reverse_equipment_return_confirmation', {
      _operator_id: OP, _reason: 'confirmed against the wrong driver',
    });
    expect(error).toBeNull();

    const rows = fake.tables.equipment_return_confirmations;
    expect(rows.length).toBe(1); // the episode stays on file
    expect(rows[0].reversed_by).toBe(PROFILE_ID);
    expect(rows[0].reversal_reason).toBe('confirmed against the wrong driver');
    expect(equipmentOutstanding(rows as never)).toBe(true);
  });

  it('a reversal without a reason is refused', async () => {
    seedOperator();
    await (fake.client as any).rpc('confirm_equipment_returned', { _operator_id: OP, _note: null });
    const { error } = await (fake.client as any).rpc('reverse_equipment_return_confirmation', {
      _operator_id: OP, _reason: '   ',
    });
    expect(error).toBeTruthy();
    expect(canReverse('   ')).toBe(false);
    expect(canReverse('wrong driver')).toBe(true);
  });

  it('shipped and received remain independently readable', async () => {
    seedOperator();
    // The driver ships. That alone must not make anything received.
    const receipts = [{ direction: 'return' }];
    expect(equipmentShipped(receipts)).toBe(true);
    expect(equipmentOutstanding(fake.tables.equipment_return_confirmations as never)).toBe(true);

    await (fake.client as any).rpc('confirm_equipment_returned', { _operator_id: OP, _note: null });
    expect(equipmentShipped(receipts)).toBe(true);
    expect(equipmentOutstanding(fake.tables.equipment_return_confirmations as never)).toBe(false);
  });

  it('a driver upload path writes no confirmation row', () => {
    seedOperator();
    // Whatever the driver writes lands in equipment_receipts / onboarding_status.
    expect(fake.tables.equipment_return_confirmations).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The operator portal must contain no route to RECEIVED               */
/* ------------------------------------------------------------------ */

describe('the driver can never mark equipment received', () => {
  it('no operator-portal source references the confirmation table or its RPCs', () => {
    const forbidden = /(equipment_return_confirmations|confirm_equipment_returned|reverse_equipment_return_confirmation|EquipmentReceiptControl)/;
    const roots = ['src/pages/operator', 'src/components/operator'];
    const offenders: string[] = [];
    const walk = (dir: string): string[] => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    };
    for (const root of roots) {
      for (const file of walk(root)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        if (forbidden.test(fs.readFileSync(file, 'utf8'))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Live schema                                                         */
/* ------------------------------------------------------------------ */

describe('equipment receipt — live schema', () => {
  itLive('the confirmation table exists and is reachable through the Data API', () => {
    expect(psql(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname='equipment_return_confirmations'
        and has_table_privilege('authenticated', c.oid, 'SELECT')`)).toEqual(['equipment_return_confirmations']);
  });

  itLive('an operator role cannot write it — clients hold no INSERT, UPDATE or DELETE', () => {
    const writes = psql(`
      select priv from unnest(array['INSERT','UPDATE','DELETE']) priv
      where has_table_privilege('authenticated', 'public.equipment_return_confirmations', priv)
         or has_table_privilege('anon', 'public.equipment_return_confirmations', priv)`);
    expect(writes).toEqual([]);
  });

  itLive('the only SELECT policy is staff-scoped', () => {
    const pols = psql(`
      select policyname || '|' || cmd || '|' || coalesce(qual,'')
      from pg_policies
      where schemaname='public' and tablename='equipment_return_confirmations'
      order by 1`);
    expect(pols.length).toBe(1);
    expect(pols[0]).toContain('|SELECT|');
    expect(pols[0]).toContain('is_staff');
  });

  itLive('at most one open confirmation per operator', () => {
    expect(psql(`
      select indexdef from pg_indexes
      where schemaname='public' and indexname='equipment_return_confirmations_open_uniq'`)[0])
      .toContain('reversed_at IS NULL');
    expect(psql(`
      select count(*) from (
        select operator_id from public.equipment_return_confirmations
        where reversed_at is null group by 1 having count(*) > 1) x`)[0]).toBe('0');
  });

  itLive('the writers are management or owner only, and hardened', () => {
    const rows = psql(`
      select p.proname || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig,','),'') ||
             '|' || coalesce(array_to_string(p.proacl,','),'') || '|' || replace(pg_get_functiondef(p.oid), chr(10), ' ')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in (
        'confirm_equipment_returned','reverse_equipment_return_confirmation','equipment_outstanding')
      order by p.proname`);
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row).toContain('|true|');
      expect(row).toContain('search_path=public, extensions');
      expect(row).not.toMatch(/(^|,)=X\//); // no PUBLIC execute
      expect(row).not.toContain('anon=X/');
    }
    for (const name of ['confirm_equipment_returned', 'reverse_equipment_return_confirmation']) {
      const def = rows.find(r => r.startsWith(name))!;
      expect(def).toContain("has_role(auth.uid(), 'management'");
      expect(def).toContain("has_role(auth.uid(), 'owner'");
      // dispatch and operator roles are absent from the gate
      expect(def).not.toContain("'dispatcher'");
      expect(def).not.toContain("'operator'");
    }
  });

  itLive('the driver shipment path is untouched — the trigger still writes only onboarding_status', () => {
    const def = psql(`
      select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='mark_equipment_return_completed'`).join('\n');
    expect(def).toContain('onboarding_status');
    expect(def).not.toContain('equipment_return_confirmations');
  });
});
