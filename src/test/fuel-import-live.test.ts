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

/**
 * ABSENCE IS NOT DISAGREEMENT.
 *
 * A "matched_with_disagreement" flag says the file and the record CONTRADICT
 * each other. When the system side is empty there is nothing to contradict,
 * and a flag that fires on 291 of 297 rows buries the six that mean something.
 * Both RPCs must require a value on BOTH sides before flagging.
 */
describe("fuel disagreement flags require both sides to hold a value", () => {
  function fnBody(name: string): string {
    return psql(`
      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${name}'
    `).join("\n");
  }

  for (const fn of ["preview_fuel_import", "commit_fuel_import"]) {
    itLive(`${fn}: a null system unit number records matched, not a disagreement`, () => {
      const body = fnBody(fn);
      expect(body, `${fn} is missing`).toBeTruthy();
      // The unit branch must test the RESOLVED value for emptiness, not only
      // the CSV value.
      expect(
        body,
        `${fn} flags unit_no without checking the system side is present`,
      ).toMatch(/NULLIF\(btrim\(COALESCE\(v_res\.unit_number,''\)\), ''\) IS NOT NULL/);
    });

    itLive(`${fn}: a blank driver name on either side records matched`, () => {
      const body = fnBody(fn);
      expect(
        body,
        `${fn} flags driver_name without checking both sides are present`,
      ).toMatch(/NULLIF\(public\.fuel_normalize_name\(v_res\.driver_name\), ''\) IS NOT NULL/);
      expect(body).toMatch(/NULLIF\(public\.fuel_normalize_name\(r->>'driver_name'\), ''\) IS NOT NULL/);
    });
  }

  itLive("card resolution reads the unit number the Driver Status board reads", () => {
    // The board reads onboarding_status.unit_number and falls back to
    // operators.unit_number. The import must read the same place rather than
    // ask anyone to maintain a second copy.
    const body = fnBody("fuel_resolve_card");
    expect(body).toMatch(/onboarding_status/);
    expect(body).toMatch(/COALESCE\(NULLIF\(btrim\(os\.unit_number\), ''\), NULLIF\(btrim\(o\.unit_number\), ''\)\)/);
  });
});

/**
 * ACCEPTING A DISAGREEMENT MUST CHANGE NOTHING ELSE.
 *
 * A fuel file is a third party's report about what happened at a pump. If
 * accepting it could edit an equipment record, MultiService would become
 * authoritative over SUPERTRANSPORT's own data and the entire matching design
 * — the card is authoritative, the printed unit and name are confirmation only
 * — would be inverted. The assertion is therefore on the FUNCTION BODY: the
 * only table it writes is the acceptance table.
 */
describe("accept_fuel_disagreement", () => {
  const FORBIDDEN = [
    "operators",
    "onboarding_status",
    "profiles",
    "equipment_items",
    "equipment_assignments",
    // Not the transaction either: the row stays flagged in history.
    "fuel_transactions",
  ];

  function body(): string {
    return psql(`
      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'accept_fuel_disagreement'
    `).join("\n");
  }

  itLive("writes the acceptance and nothing else", () => {
    const src = body();
    expect(src, "accept_fuel_disagreement is missing").toBeTruthy();

    const writes = [...src.matchAll(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-z_]+)/gi,
    )].map((m) => m[1].toLowerCase());
    expect(writes, `writes: ${writes.join(", ")}`)
      .toEqual(["fuel_disagreement_acceptances"]);

    for (const table of FORBIDDEN) {
      expect(
        writes.includes(table),
        `accept_fuel_disagreement writes ${table}`,
      ).toBe(false);
    }
  });

  itLive("the four protections are in the body and on the grant", () => {
    const src = body();
    // 1. actor server-side, never a parameter.
    expect(src).toMatch(/current_profile_id\(\)/);
    expect(src).not.toMatch(/accept_fuel_disagreement\([^)]*actor/i);
    expect(src).toMatch(/Not authenticated/);
    // 2. management or owner, checked in the body.
    expect(src).toMatch(/has_role\(auth\.uid\(\), 'management'\)/);
    expect(src).toMatch(/has_role\(auth\.uid\(\), 'owner'\)/);
    // 3. definer with a pinned search_path.
    expect(src).toMatch(/SECURITY DEFINER/);
    expect(src).toMatch(/search_path TO 'public', 'extensions'/);
    // 4. refuse-only contract: the row, its flag, and the note.
    expect(src).toMatch(/Fuel transaction not found/);
    expect(src).toMatch(/matched_with_disagreement/);
    expect(src).toMatch(/A note is required/);

    const anon = psql(`
      select has_function_privilege('anon', p.oid, 'EXECUTE')::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'accept_fuel_disagreement'
    `);
    expect(anon).toEqual(["false"]);
  });

  itLive("an accepted row stays flagged: the acceptance table is append-only", () => {
    const trg = psql(`
      select t.tgname
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'fuel_disagreement_acceptances' and not t.tgisinternal
    `);
    expect(trg, "no append-only trigger").toContain(
      "fuel_disagreement_acceptances_append_only",
    );

    // Staff read it; no client role may write it directly either.
    const writable = psql(`
      select r || ' ' || priv
        from unnest(array['anon','authenticated']) r,
             unnest(array['INSERT','UPDATE','DELETE']) priv
       where has_table_privilege(r, 'public.fuel_disagreement_acceptances', priv)
    `);
    expect(writable, writable.join(", ")).toEqual([]);

    const [rls] = psql(`
      select c.relrowsecurity::text from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'fuel_disagreement_acceptances'
    `);
    expect(rls).toBe("true");
  });

  itLive("fuel_resolve_card is UNCHANGED — still card plus date window only", () => {
    const src = psql(`
      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fuel_resolve_card'
    `).join("\n");
    expect(src).toMatch(/ea\.assigned_at::date <= _on_date/);
    expect(src).toMatch(/ea\.returned_at IS NULL OR ea\.returned_at::date >= _on_date/);
    // No fallback matching on what the file printed.
    expect(src).not.toMatch(/driver_name\s*=/);
    expect(src).not.toMatch(/unit_no\b/);
  });
});
