import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * FUEL IMPORT — LIVE CATALOG.
 *
 * The parser is tested pure in src/lib/fuel/__tests__. Three things it cannot
 * see live only in the database, and each one is money:
 *
 *   1. THE DEDUPLICATION KEY. Invoice No is the MERCHANT's number and repeats
 *      across merchants, so the key is Invoice No + Invoice Date + Card No.
 *      If that index is not UNIQUE, re-importing an overlapping export
 *      double-counts every row in the overlap and the duplicate count in the
 *      preview is decoration.
 *   2. CARD RESOLUTION IS DATE-SCOPED. A card reassigned mid-month must
 *      attribute each transaction to whoever held it ON THE TRANSACTION DATE.
 *      A resolver ignoring the assignment window pays the wrong driver.
 *   3. NO DRIVER READS THIS. Fuel is staff-facing until Module 4 posts it to
 *      settlements; an operator-readable policy here leaks other drivers'
 *      fuel spend.
 *
 * Behaviour of the RPCs themselves is NOT tested here: the harness role holds
 * SELECT + INSERT and no EXECUTE on database functions, by deliberate design
 * (see the standing limitation in docs/tms-build-status.md). What is asserted
 * is structure, and structure is the part that fails silently.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("fuel-import-live.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so the catalog could not be read. Nothing else in the suite",
    "sees a non-unique dedup key or a driver-readable fuel table.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live catalog could not be read",
  details: ["Only this file sees the fuel dedup key and fuel table exposure."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

const FUEL_TABLES = ["fuel_import_batches", "fuel_transactions", "fuel_transaction_lines"];

describe("fuel import structure", () => {
  itLive("the deduplication key is unique on invoice + date + card", () => {
    const [def] = psql(`
      select indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'fuel_transactions'
         and indexname = 'fuel_transactions_dedup_key'
    `);
    expect(def, "fuel_transactions_dedup_key is missing").toBeTruthy();
    expect(def, `not unique: ${def}`).toMatch(/CREATE UNIQUE INDEX/);
    // Invoice number ALONE would collapse two merchants' invoice 55231 into
    // one row and silently drop a real transaction.
    expect(def).toMatch(/invoice_no/);
    expect(def).toMatch(/invoice_date/);
    expect(def).toMatch(/card_no/);
  });

  itLive("card resolution reads the assignment window, not just the card", () => {
    // psql -At splits the definition across lines; rejoin before matching.
    const body = psql(`
      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fuel_resolve_card'
    `).join("\n");

    expect(body, "fuel_resolve_card is missing").toBeTruthy();
    expect(body).toMatch(/equipment_assignments/);
    // The date argument must be compared against both ends of the window.
    expect(body).toMatch(/assigned_at/);
    expect(body).toMatch(/returned_at/);
  });

  itLive("every fuel function is SECURITY DEFINER with a pinned search_path", () => {
    const offenders = psql(`
      select p.proname || ': ' ||
             case when not p.prosecdef then 'not SECURITY DEFINER'
                  else 'search_path ' || coalesce(array_to_string(p.proconfig, ','), '(none)')
             end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('fuel_resolve_card', 'preview_fuel_import',
                           'commit_fuel_import', 'assign_fuel_transaction_operator')
         and (not p.prosecdef
              or coalesce(array_to_string(p.proconfig, ','), '') not like '%extensions%')
       order by 1
    `);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  itLive("no fuel table or function is reachable by anon", () => {
    const offenders = psql(`
      select 'table ' || t || ' grants ' || priv to_anon
        from unnest(array[${FUEL_TABLES.map((t) => `'${t}'`).join(",")}]) t,
             unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv
       where has_table_privilege('anon', 'public.' || t, priv)
      union all
      select 'function ' || p.proname || ' executable by anon'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like '%fuel%'
         and has_function_privilege('anon', p.oid, 'EXECUTE')
       order by 1
    `);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  itLive("row level security is on for every fuel table", () => {
    const offenders = psql(`
      select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in (${FUEL_TABLES.map((t) => `'${t}'`).join(",")})
         and not c.relrowsecurity
    `);
    expect(offenders, `RLS off: ${offenders.join(", ")}`).toEqual([]);
    const tables = psql(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in (${FUEL_TABLES.map((t) => `'${t}'`).join(",")})
    `);
    expect(tables.sort()).toEqual([...FUEL_TABLES].sort());
  });

  itLive("no fuel policy grants an operator a read of another driver's spend", () => {
    // Every fuel policy must be staff-gated. A policy resolving through
    // operators.user_id would be a per-driver read, which this pass does not
    // have — driver-facing fuel arrives with settlements in Module 4.
    const offenders = psql(`
      select tablename || '.' || policyname || ' (' || cmd || '): ' ||
             coalesce(qual, with_check, '')
        from pg_policies
       where schemaname = 'public'
         and tablename in (${FUEL_TABLES.map((t) => `'${t}'`).join(",")})
         and coalesce(qual, '') || coalesce(with_check, '') not like '%has_role%'
         and coalesce(qual, '') || coalesce(with_check, '') not like '%is_staff%'
       order by 1
    `);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  itLive("the fuel discount pass-through setting exists and defaults to off", () => {
    const [col] = psql(`
      select coalesce(column_default, '(none)') || '|' || is_nullable
        from information_schema.columns
       where table_schema = 'public' and table_name = 'pay_policies'
         and column_name = 'fuel_discount_passthrough'
    `);
    expect(col, "pay_policies.fuel_discount_passthrough is missing").toBeTruthy();
    expect(col, `default is not false: ${col}`).toMatch(/^false\|/);
    const [anyOn] = psql(`
      select count(*)::text from public.pay_policies where fuel_discount_passthrough
    `);
    // Forward-only and off by default: nothing should have been switched on
    // by the migration itself.
    expect(anyOn).toBe("0");
  });
});
