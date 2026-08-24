import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * CALLER-EVALUATED FUNCTION REACHABILITY — LIVE CATALOG.
 *
 * A column DEFAULT and an RLS policy expression both evaluate in the CALLER's
 * context, not the table owner's. So a function used in either must be
 * executable by every role that can write the table — otherwise the table can
 * only fail, and the failure is invisible to both a table-grant check and an
 * RLS check.
 *
 * On 2026-08-24 parser_diagnostics.created_by defaulted to
 * public.current_profile_id() and its insert policy compared against the same
 * call, while EXECUTE had been revoked from `authenticated` four days earlier.
 * Three correct fixes above this layer (a missing reader, a policy mismatch,
 * mixed row shapes) all failed to fix the write, because the insert died with
 * 42501 before any of them could matter.
 *
 * Reads pg_attrdef / pg_policy / has_function_privilege at call time. A
 * checked-in snapshot would have the same weakness as reading migration text.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("caller-evaluated-functions.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST in the environment, so the catalog could not be read. Nothing",
    "else in the suite can see a column default whose function the inserting",
    "role cannot execute: a green run without this file is not evidence.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live catalog could not be read",
  details: ["Only this check sees a default the caller cannot evaluate."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Roles that reach the Data API as themselves. service_role bypasses RLS. */
const ROLES = "('anon'),('authenticated')";

describe("caller-evaluated functions are executable by the roles that write", () => {
  itLive("no column default calls a function its inserting role cannot execute", () => {
    const offenders = psql(`
      with roles(r) as (values ${ROLES}),
      defs as (
        select c.relname as tbl,
               a.attname  as col,
               pg_get_expr(d.adbin, d.adrelid) as def
          from pg_attrdef d
          join pg_class c on c.oid = d.adrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
         where n.nspname = 'public'
      ),
      fns as (
        select p.oid, p.proname
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
      )
      select d.tbl || '.' || d.col || ' default calls ' || f.proname
             || ' which ' || r.r || ' cannot execute'
        from defs d
        join fns f on d.def ~ ('(^|[^a-z_])' || f.proname || '\\(')
        cross join roles r
       where has_table_privilege(r.r, 'public.' || quote_ident(d.tbl), 'INSERT')
         and not has_function_privilege(r.r, f.oid, 'EXECUTE')
       order by 1
    `);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  itLive("no RLS policy calls a function the role it applies to cannot execute", () => {
    const offenders = psql(`
      with pol as (
        select schemaname, tablename, policyname, cmd,
               coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr,
               unnest(coalesce(roles, '{public}'::name[])) as role_name
          from pg_policies where schemaname = 'public'
      ),
      fns as (
        select p.oid, p.proname
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
      )
      select p.tablename || ' / ' || p.policyname || ' calls ' || f.proname
             || ' which ' || p.role_name || ' cannot execute'
        from pol p
        join fns f on p.expr ~ ('(^|[^a-z_])' || f.proname || '\\(')
       where p.role_name in ('anon', 'authenticated')
         and not has_function_privilege(p.role_name::text, f.oid, 'EXECUTE')
       order by 1
    `);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  itLive("current_profile_id stays revoked and the diagnostics RPC replaces it", () => {
    const rows = psql(`
      select has_function_privilege('authenticated', 'public.current_profile_id()', 'EXECUTE')::text
      union all
      select has_function_privilege('authenticated', 'public.log_parser_diagnostics(jsonb)', 'EXECUTE')::text
      union all
      select has_table_privilege('authenticated', 'public.parser_diagnostics', 'INSERT')::text
    `);
    // revoked helper, granted RPC, no direct client insert.
    expect(rows).toEqual(["false", "true", "false"]);
  });
});
