import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Grants-versus-policies parity guard.
 *
 * A policy decides *which rows* a role may touch. A GRANT decides whether the
 * role may touch the table at all. RLS without a GRANT is a locked door with a
 * very detailed access-control list taped to it: PostgREST returns
 * `42501 permission denied` before the policy is ever evaluated.
 *
 * The 2026-07-30 `faq` regression was exactly this: the policy was
 * `TO public` — which is `anon` AND `authenticated` — and a blanket
 * `REVOKE ... FROM anon` plus a missing `authenticated` grant left the table
 * unreachable for every visitor and every logged-in user.
 *
 * This is deliberately a separate file from `definer-search-path.test.ts`:
 * grant/policy parity and `search_path` pinning are unrelated concerns.
 */
const CUTOFF = "20260730180000";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** Policies whose predicate can only ever be satisfied by a signed-in user. */
const AUTH_SCOPED = /auth\.uid|is_staff|has_role|auth\.jwt/i;
/** Policies that exist only to document that service_role bypasses RLS. */
const SERVICE_ONLY = /auth\.role\(\)\s*=\s*'service_role'|current_user\s*=\s*'service_role'/i;

type Policy = {
  file: string;
  table: string;
  name: string;
  cmd: string;
  roles: string[];
  body: string;
};

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.match(/^\d+/)?.[0] ?? "0") >= CUTOFF)
    .sort();
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function bare(table: string): string {
  return table.replace(/^public\./i, "").replace(/"/g, "").toLowerCase();
}

/** Parses every `CREATE POLICY` in a migration. */
function policies(file: string, sql: string): Policy[] {
  const out: Policy[] = [];
  const re = /CREATE\s+POLICY\s+("?[^"\s]+"?|"[^"]+")\s+ON\s+([a-z0-9_."]+)([\s\S]*?);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const body = m[3];
    const cmd =
      body.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i)?.[1].toUpperCase() ??
      "ALL";
    const toClause = body.match(/\bTO\s+([a-z0-9_,\s"]+?)(?=\bUSING\b|\bWITH\b|$)/i)?.[1];
    const roles = toClause
      ? toClause
          .split(",")
          .map((r) => r.trim().replace(/"/g, "").toLowerCase())
          .filter(Boolean)
      : ["public"];
    out.push({
      file,
      table: bare(m[2]),
      name: m[1].replace(/"/g, ""),
      cmd,
      roles,
      body,
    });
  }
  return out;
}

/** Collects `table -> role -> privileges` from every GRANT across migrations. */
function grantIndex(files: string[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  // `[^;]` — a GRANT never spans a statement boundary. With `[\s\S]` the
  // engine backtracks across `GRANT EXECUTE ON FUNCTION f(uuid, text) TO ...`
  // (the parenthesised signature does not match the table pattern) and
  // swallows the NEXT table grant along with it, silently hiding it.
  const re = /GRANT\s+([^;]*?)\s+ON\s+(?:TABLE\s+)?([a-z0-9_."]+)\s+TO\s+([^;]+);/gi;

  for (const file of files) {
    const sql = stripComments(
      readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const privs = m[1].toUpperCase();
      if (/\b(USAGE|EXECUTE)\b/.test(privs)) continue;
      const table = bare(m[2]);
      if (table.includes("all tables")) continue;
      for (const rawRole of m[3].split(",")) {
        const role = rawRole.trim().replace(/"/g, "").toLowerCase();
        const key = `${table}::${role}`;
        const set = index.get(key) ?? new Set<string>();
        if (/\bALL\b/.test(privs)) {
          ["SELECT", "INSERT", "UPDATE", "DELETE"].forEach((p) => set.add(p));
        } else {
          ["SELECT", "INSERT", "UPDATE", "DELETE"].forEach((p) => {
            if (new RegExp(`\\b${p}\\b`).test(privs)) set.add(p);
          });
        }
        index.set(key, set);
      }
    }
  }
  return index;
}

function hasGrant(
  index: Map<string, Set<string>>,
  table: string,
  role: string,
  cmd: string,
): boolean {
  const set = index.get(`${table}::${role}`);
  if (!set) return false;
  if (cmd === "ALL") return set.size > 0;
  return set.has(cmd);
}

/**
 * Tables created before the cutoff already carry their grants in the DB.
 * Only `public` tables matter: `app_private` is deliberately grant-free and
 * reachable only from SECURITY DEFINER functions and service_role.
 */
function tablesCreatedInScope(files: string[]): Set<string> {
  const created = new Set<string>();
  for (const file of files) {
    const sql = stripComments(
      readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    );
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_."]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const name = bare(m[1]);
      if (name.includes(".")) continue; // non-public schema
      if (name.startsWith("_zz_")) continue; // throwaway audit probe
      if (new RegExp(`DROP\\s+TABLE[^;]*${name}`, "i").test(sql)) continue;
      created.add(name);
    }
  }
  return created;
}

describe("policy / grant parity", () => {
  const files = migrationFiles();
  const grants = grantIndex(files);
  const inScope = tablesCreatedInScope(files);
  const allPolicies = files.flatMap((f) =>
    policies(f, stripComments(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))),
  );

  it("finds migrations to lint", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("a policy admitting authenticated is backed by a matching grant", () => {
    const offenders: string[] = [];

    for (const p of allPolicies) {
      if (!inScope.has(p.table)) continue;
      const admitsAuthed =
        p.roles.includes("public") || p.roles.includes("authenticated");
      if (!admitsAuthed) continue;
      if (SERVICE_ONLY.test(p.body)) continue;
      if (!hasGrant(grants, p.table, "authenticated", p.cmd)) {
        offenders.push(
          `${p.file}: "${p.name}" on ${p.table} admits authenticated for ${p.cmd}` +
            ` but no GRANT ${p.cmd} ON public.${p.table} TO authenticated exists.` +
            (p.roles.includes("public")
              ? ` (TO public includes authenticated — name the role explicitly.)`
              : ""),
        );
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("a policy reachable by anon is backed by a matching grant", () => {
    const offenders: string[] = [];

    for (const p of allPolicies) {
      if (!inScope.has(p.table)) continue;
      const admitsAnon = p.roles.includes("public") || p.roles.includes("anon");
      if (!admitsAnon) continue;
      // A `TO public` policy whose predicate requires a session, or one that
      // only describes service_role access, is unreachable by anon by design.
      if (AUTH_SCOPED.test(p.body) || SERVICE_ONLY.test(p.body)) continue;
      if (!hasGrant(grants, p.table, "anon", p.cmd)) {
        offenders.push(
          `${p.file}: "${p.name}" on ${p.table} is anon-reachable for ${p.cmd}` +
            ` but anon holds no grant. Either scope the policy to authenticated,` +
            ` or serve the page from a SECURITY DEFINER RPC.`,
        );
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every table created in scope grants service_role", () => {
    const offenders: string[] = [];
    for (const table of inScope) {
      if (!grants.get(`${table}::service_role`)?.size) {
        offenders.push(`${table}: no GRANT ... TO service_role`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});