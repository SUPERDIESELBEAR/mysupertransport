import { describe, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';

/**
 * MODULE 7 — BILLING & INVOICING, PASS 4: PAYMENTS, FACTORING LIFECYCLE AND
 * REMITTANCE INGEST.
 *
 * Read from the live catalog, not from the migration: a migration records an
 * intention, the catalog records the outcome, and the two have diverged before.
 */

const HAS_DB = Boolean(process.env.PGHOST);
if (!HAS_DB) {
  skipBanner('payment schema checks did not run', [
    'No PGHOST, so the remittance table, the three writers and the payment',
    'immutability behaviour could not be read from the live catalog.',
  ]);
}
const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the live catalog could not be read',
  details: ['Only this file asserts the Module 7 Pass 4 payment surface.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

/** The three functions a client may call. Everything else is service_role only. */
const CLIENT_WRITERS = [
  'record_factoring_remittance',
  'record_invoice_payment',
  'close_short_paid_invoice',
];

function fnRow(name: string) {
  const row = psql(`SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
      || '|' || coalesce(array_to_string(p.proacl, ' '), '') || '|' || p.prosrc
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='${name}'`).join('\n');
  const [secdef, config, acl] = row.split('|');
  return { secdef, config, acl, whole: row };
}

// ---------------------------------------------------------------------------

describe('payments — the remittance is a header with lines', () => {
  itLive('factoring_remittances exists and carries the check itself', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='factoring_remittances' ORDER BY 1`);
    for (const c of ['reference', 'remittance_date', 'net_amount', 'source',
      'company_id', 'created_by', 'created_at']) {
      expect(cols, c).toContain(c);
    }
  });

  itLive('a payment points at the check that funded it, and the link is optional', () => {
    const col = psql(`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments' AND column_name='remittance_id'`).join('');
    // Optional because a DIRECT broker payment arrives with no remittance at all.
    expect(col).toBe('YES');
  });

  itLive('payments records how the money arrived', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments' ORDER BY 1`);
    for (const c of ['gross_amount', 'fee_amount', 'net_deposited', 'method',
      'source', 'received_at', 'invoice_id', 'reference', 'remittance_id']) {
      expect(cols, c).toContain(c);
    }
  });

  /**
   * Smart Freight holds no reserve — confirmed with the owner and confirmed by
   * arithmetic on every row of check 764176: net is gross less fee, full stop.
   * An always-zero column reads as "not yet tracked", which is a lie.
   */
  itLive('there is no reserve_amount column, because there is no reserve', () => {
    const cols = psql(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments'`);
    expect(cols).not.toContain('reserve_amount');
  });
});

describe('payments — the four protections, asserted rather than described', () => {
  for (const name of CLIENT_WRITERS) {
    itLive(`${name} is definer, pinned, gated, and closed to anon and PUBLIC`, () => {
      const { secdef, config, acl, whole } = fnRow(name);
      expect(secdef).toBe('true');
      expect(config).toContain('search_path=public, extensions');
      expect(acl).toContain('authenticated=X');
      expect(acl).not.toContain('anon=X');
      expect(acl).not.toMatch(/(^|\s)=X/);
      expect(whole).toContain("has_role(auth.uid(), 'management'");
      expect(whole).toContain("has_role(auth.uid(), 'owner'");
      expect(whole).toContain('current_profile_id()');
    });
  }

  itLive('nothing else in the payment surface is reachable from a browser', () => {
    // authorize_below_threshold_payment is Module 4's settlement gate, not part
    // of this surface, so it is named out rather than silently swept in.
    const rows = psql(`SELECT proname || '|' || coalesce(array_to_string(proacl, ' '), '')
      FROM pg_proc WHERE pronamespace='public'::regnamespace
        AND proname <> 'authorize_below_threshold_payment'
        AND (proname LIKE '%remittance%' OR proname LIKE '%payment%'
             OR proname = 'normalize_invoice_number') ORDER BY 1`);
    expect(rows.length).toBeGreaterThan(CLIENT_WRITERS.length);
    for (const row of rows) {
      const [name, acl] = row.split('|');
      if (CLIENT_WRITERS.includes(name)) continue;
      expect(acl, name).not.toContain('authenticated=X');
      expect(acl, name).not.toContain('anon=X');
      expect(acl, name).not.toMatch(/(^|\s)=X/);
    }
  });
});

describe('payments — the fee is recorded, never derived', () => {
  /**
   * dispatch_settlement_rates.factoring_pct and the factor's actual fee are the
   * same real-world rate serving two roles. If Smart Freight ever charges
   * something other than 2% on a line, the recorded fact must win.
   */
  itLive('no writer reads the dispatch factoring rate', () => {
    for (const name of [...CLIENT_WRITERS, 'post_invoice_payment_internal']) {
      const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
        AND proname='${name}'`).join('\n');
      expect(src, name).not.toContain('factoring_pct');
      expect(src, name).not.toContain('dispatch_settlement_rates');
    }
  });

  itLive('the recorded fee is documented as a fact off the statement', () => {
    const comment = psql(`SELECT col_description('public.payments'::regclass,
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.payments'::regclass
        AND attname='fee_amount'))`).join(' ');
    expect(comment).toContain('NEVER recomputed');
  });
});

describe('payments — matching is on the invoice number', () => {
  itLive('normalize_invoice_number keeps the digits and nothing else', () => {
    // It cannot be CALLED from here: no client role, and not the sandbox role
    // either — which is the guarantee asserted above. So the rule is read off
    // the definition, and the three renderings are exercised in
    // src/lib/__tests__/remittance.test.ts against the same rule in TypeScript.
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='normalize_invoice_number'`).join(' ').replace(/\s+/g, ' ');
    expect(src).toContain("regexp_replace");
    expect(src).toContain("'\\D'");
    expect(src).toContain("'g'");
  });

  itLive('the writer matches on the invoice number and not on the load number', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='record_factoring_remittance'`).join('\n');
    expect(src).toContain('normalize_invoice_number');
    expect(src).not.toContain('load_number');
    expect(src.toLowerCase()).toContain('unmatched');
  });
});

describe('payments — a short pay closes only with a reason', () => {
  itLive('close_short_paid_invoice refuses an empty reason and records the actor', () => {
    const src = psql(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='close_short_paid_invoice'`).join('\n');
    expect(src).toContain('short_paid');
    expect(src).toMatch(/btrim\(coalesce\(p_reason|length\(btrim\(p_reason/);
    expect(src).toContain('current_profile_id()');
  });
});
