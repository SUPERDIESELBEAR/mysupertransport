import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { callersOf } from "@/test/helpers/repoLiterals";

/**
 * FUNCTION REACHABILITY — does anything CALL it?
 *
 * Every other guard in this project asks whether something is CORRECT. None
 * asked whether anything calls it, and every one of the eleven recorded
 * "correct implementation with no caller" instances was found by accident —
 * because someone tried to enter tonnage, because a PDF header was blank,
 * because the owner went looking for a feature three times. Not one was found
 * by a test.
 *
 * The cost is not theoretical. `get_pei_requests_needing_action` had NO CALLER
 * AT ALL, which is precisely why nobody reviewed it while it leaked applicant
 * data for four months. A privileged function nobody calls is a function nobody
 * reads.
 *
 * SCOPE: functions in `public` that a CLIENT ROLE (`anon` or `authenticated`)
 * holds EXECUTE on. Those are the ones reachable from outside the database, so
 * those are the ones whose lack of a caller is a security question and not
 * merely tidiness. Service-role-only helpers are out of scope by design —
 * `eld_cron_status` and `grant_parity_report` are both uncalled-but-privileged
 * in the service-role sense and are recorded in the sweep, not here.
 *
 * THIS GUARD IS EXPECTED TO BE RED. It ships with real findings in it. Green is
 * reached by CALLING or REVOKING each one — never by allowlisting a finding.
 * See docs/tms-build-status.md, pass "reachability guards".
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("function-reachability.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so pg_proc / pg_trigger / pg_policies could not be read.",
    "The repository half of this guard is meaningless on its own: without",
    "the catalog there is no list of functions to look for callers OF.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live function catalog could not be read",
  details: ["Only this check can see a function that exists but is called by nothing."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-F", "|", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * ALLOWLIST — every entry carries a WRITTEN REASON.
 *
 * A bare list of names is a place to hide things. Adding an entry here forces
 * someone to write down why the function is uncalled AND why that is
 * acceptable, in the same shape as KNOWN_ANON_EXECUTABLE_ENTRIES.
 *
 * A reason must start with:
 *   AWAITING — built ahead of its consumer. NAME the module that will call it
 *              and what will call it.
 *   INTERNAL — called by something this guard cannot see, and say what:
 *              a cron job in a schema the harness role cannot read, an
 *              external webhook, a migration-time backfill.
 *   SUPERSEDED — the capability is live, but through a DIFFERENT named
 *              mechanism, so this function is unreachable BY DESIGN. NAME the
 *              mechanism. Added 2026-09-10 for the two role writers; it is not
 *              a softer synonym for ORPHANED, because an entry only qualifies
 *              once the replacement path has been found and written down.
 *
 * "UNREACHABLE BUT WANTED" and "ORPHANED" are NOT valid reasons. Those are the
 * findings. A guard that ships green by allowlisting its own findings is
 * worthless.
 *
 * Seeded 2026-09-10 from the reachability sweep with ZERO entries: the sweep
 * classified exactly one function as LEGITIMATE (`grant_parity_report`, called
 * by grant-parity-live.test.ts) and that one is service-role-only, so it falls
 * outside this guard's scope. Everything else the sweep found was ORPHANED or
 * UNREACHABLE BUT WANTED and stays out.
 *
 * This list may only SHRINK.
 */
type NoCallerEntry = {
  /** Bare function name as pg_proc renders `proname`. */
  readonly name: string;
  /** Starts with `AWAITING `, `INTERNAL ` or `SUPERSEDED ` — enforced below. */
  readonly reason: string;
};

const KNOWN_NO_CALLER_ENTRIES: readonly NoCallerEntry[] = [
  {
    name: "assign_user_role",
    reason:
      "SUPERSEDED — role assignment is live, but runs through service_role edge " +
      "functions using the admin client, not through this client-side writer: " +
      "invite-staff (index.ts:243), invite-operator (:133), invite-truck-owner " +
      "(:109), get-staff-list (:426), bootstrap-admin (:85), provision-test-driver, " +
      "provision-demo-driver. Verified 2026-09-10 by the uncalled-function sweep. " +
      "KEPT rather than dropped because it is the only place the 'owner role " +
      "cannot be assigned through the application' refusal is written down; see " +
      "the owner-invariant OPEN QUESTION in docs/tms-build-status.md.",
  },
  {
    name: "remove_user_role",
    reason:
      "SUPERSEDED — role removal is live via service_role edge functions " +
      "get-staff-list (index.ts:432, :180) and delete-user-account (:96), not " +
      "through this client-side writer. Verified 2026-09-10. KEPT for the same " +
      "reason as assign_user_role: it holds the owner-removal refusal.",
  },
];

/** Ceiling. May fall freely; may rise only for a new entry carrying its reason. */
const KNOWN_NO_CALLER_MAX = 2;

const ALLOWLISTED = new Set(KNOWN_NO_CALLER_ENTRIES.map((e) => e.name));

interface FnRow {
  signature: string;
  name: string;
  triggers: number;
  policies: number;
  defaults: number;
  functions: number;
  views: number;
}

/**
 * IN-DATABASE CALLERS. Called means called from ANYWHERE — a function reached
 * only by a trigger is CALLED, and one reached only by an RLS policy is CALLED.
 * A guard that flagged those would be flagging legitimate code, and would be
 * switched off within a week.
 *
 * SEARCH SCOPE IS PART OF THE ANSWER (widened 2026-09-10)
 * -------------------------------------------------------
 * The policy, function-body and view searches used to be filtered to
 * `schemaname = 'public'`. `is_valid_application_draft_token` is called by two
 * RLS policies on **storage.objects** — a different schema — so the guard
 * reported it uncalled and its finding recommended dropping the function that
 * gates applicant document and signature uploads. A guard that searches too
 * narrowly does not miss answers; it produces CONFIDENT WRONG ones. Only the
 * fact that the finding was investigated rather than acted on caught it.
 *
 * All three in-database name searches are now ACROSS EVERY SCHEMA. The scope is
 * restated in every failure message, so a future narrowing is visible in the
 * output instead of hidden in this query.
 *
 * Word-boundary name matching (`\m name \M`) against trigger bindings, policy
 * expressions, column defaults, other function bodies and view definitions.
 */
const CATALOG_SQL = `
WITH f AS (
  SELECT p.oid, p.proname, 'public.' || p.oid::regprocedure::text AS sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype <> 'trigger'::regtype
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
)
SELECT f.sig, f.proname,
  (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid = f.oid AND NOT t.tgisinternal),
  (SELECT count(*) FROM pg_policies pl
     WHERE (coalesce(pl.qual, '') || coalesce(pl.with_check, '')) ~ ('\\m' || f.proname || '\\M')),
  (SELECT count(*) FROM pg_attrdef ad
     WHERE pg_get_expr(ad.adbin, ad.adrelid) ~ ('\\m' || f.proname || '\\M')),
  (SELECT count(*) FROM pg_proc p2
     WHERE p2.oid <> f.oid
       AND p2.prosrc ~ ('\\m' || f.proname || '\\M')),
  (SELECT count(*) FROM pg_views v
     WHERE v.definition ~ ('\\m' || f.proname || '\\M'))
FROM f
ORDER BY 1;
`;

let catalogCache: FnRow[] | null = null;

function loadCatalog(): FnRow[] {
  if (catalogCache) return catalogCache;
  catalogCache = psql(CATALOG_SQL).map((line) => {
    const [signature, name, t, pol, def, fn, view] = line.split("|");
    return {
      signature,
      name,
      triggers: Number(t),
      policies: Number(pol),
      defaults: Number(def),
      functions: Number(fn),
      views: Number(view),
    };
  });
  return catalogCache;
}

/**
 * cron.job lives in a schema the sandbox harness role cannot read. The guard
 * says so in every failure message rather than silently treating "unreadable"
 * as "empty" — that substitution is how a sweep produces a confident wrong
 * answer.
 */
function cronReadable(): boolean {
  try {
    return psql("SELECT has_schema_privilege(current_user, 'cron', 'USAGE')")[0] === "t";
  } catch {
    return false;
  }
}

function cronHits(name: string): number | null {
  try {
    const rows = psql(
      `SELECT count(*) FROM cron.job j WHERE j.command ~ ('\\m' || ${quote(name)} || '\\M')`,
    );
    return Number(rows[0]);
  } catch {
    return null;
  }
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * THE FAILURE MESSAGE IS THE PRODUCT.
 *
 * This guard stays red for weeks while the backlog is worked, so somebody will
 * read this text many times. A message that only says "unreachable" teaches
 * people to skim. Every failure names three things, for a reader who did not
 * build the guard: WHAT WAS SEARCHED, WHICH CATEGORIES CAME BACK EMPTY, and
 * WHAT WOULD MAKE IT PASS.
 */
function explain(row: FnRow, cronOk: boolean, cron: number | null): string {
  const cronLine =
    cron === null || !cronOk
      ? "               cron jobs (NOT SEARCHED — the `cron` schema is not readable\n" +
        "               by this role; treat this category as unknown, not empty)"
      : `               cron jobs (${cron})`;

  return [
    ``,
    `${row.signature} is EXECUTABLE by a client role but nothing calls it.`,
    ``,
    `Searched, and found nothing:`,
    `  SCOPE        the in-database searches below cover EVERY SCHEMA, not just`,
    `               public. They were public-only until 2026-09-10, which made`,
    `               this guard report a function called by two storage.objects`,
    `               policies as uncalled. If you narrow the scope, say so here.`,
    `  in-database  triggers (${row.triggers})  RLS policies, all schemas (${row.policies})  column defaults (${row.defaults})`,
    `               other function bodies, all schemas (${row.functions})  views, all schemas (${row.views})`,
    cronLine,
    `  repository   the string '${row.name}' as a quoted literal in any non-test`,
    `               file under src/ or supabase/functions/ (0 files)`,
    `               [*.test.*, __tests__/, src/test/ and the generated`,
    `                src/integrations/supabase/types.ts do not count as callers]`,
    ``,
    `To make this pass, do ONE of these — in this order of preference:`,
    `  1. CALL IT. Add the screen, hook or edge function that uses it. If the`,
    `     capability is wanted and there is no way to use it, this is the class`,
    `     that has cost this project the most.`,
    `  2. REVOKE IT. If nothing should call it, REVOKE EXECUTE in a new`,
    `     migration and drop the function if it has no other consumer. An`,
    `     uncalled privileged function is the exact shape of`,
    `     get_pei_requests_needing_action, which had no caller and leaked`,
    `     applicant data for four months.`,
    `  3. ALLOWLIST IT, WITH A REASON — only if it is genuinely built ahead of`,
    `     a named consumer, or called by something this guard cannot see. Add to`,
    `     KNOWN_NO_CALLER_ENTRIES in src/test/function-reachability.test.ts as`,
    `       { name: '${row.name}', reason: 'AWAITING <module> — <what will call it>' }`,
    `     and raise KNOWN_NO_CALLER_MAX by exactly one. A bare name is rejected;`,
    `     the reason is what a future reader needs. "Unreachable but wanted" and`,
    `     "orphaned" are NOT reasons — those are the findings.`,
  ].join("\n");
}

describe("function reachability — nothing privileged goes uncalled", () => {
  it("every allowlist entry carries a written reason", () => {
    const bad = KNOWN_NO_CALLER_ENTRIES.filter(
      (e) => !/^(AWAITING|INTERNAL|SUPERSEDED) \S/.test(e.reason),
    );
    expect(
      bad.map((e) => e.name),
      `Every KNOWN_NO_CALLER_ENTRIES entry must explain itself. A reason must ` +
        `start with 'AWAITING ' (built ahead of a NAMED consumer), 'INTERNAL ' ` +
        `(called by something this guard cannot see — say what), or 'SUPERSEDED ' ` +
        `(the capability is live through a DIFFERENT named mechanism — name it). ` +
        `A bare list of ` +
        `names is a place to hide things, which is why the 2026-09-03 anon audit ` +
        `could prove only that a set had not grown, and not that any member of it ` +
        `was safe.`,
    ).toEqual([]);
  });

  it("the allowlist may only shrink", () => {
    expect(
      KNOWN_NO_CALLER_ENTRIES.length,
      `KNOWN_NO_CALLER_ENTRIES has ${KNOWN_NO_CALLER_ENTRIES.length} entries but ` +
        `KNOWN_NO_CALLER_MAX is ${KNOWN_NO_CALLER_MAX}. The ceiling may fall freely ` +
        `and rise only for a genuinely new item carrying its justification.`,
    ).toBeLessThanOrEqual(KNOWN_NO_CALLER_MAX);

    const names = KNOWN_NO_CALLER_ENTRIES.map((e) => e.name);
    expect(
      names.filter((n, i) => names.indexOf(n) !== i),
      "duplicate entries in KNOWN_NO_CALLER_ENTRIES",
    ).toEqual([]);
  });

  itLive("every client-executable function has a caller somewhere", () => {
    const rows = loadCatalog();
    expect(
      rows.length,
      "The catalog returned no client-executable functions at all. That is not " +
        "a clean bill of health — it means this guard searched nothing. Check " +
        "the connection and the query before reading the result as green.",
    ).toBeGreaterThan(50);

    const cronOk = cronReadable();

    const offenders = rows.filter((row) => {
      if (ALLOWLISTED.has(row.name)) return false;
      const dbHits =
        row.triggers + row.policies + row.defaults + row.functions + row.views;
      if (dbHits > 0) return false;
      if (callersOf(row.name).length > 0) return false;
      const cron = cronOk ? cronHits(row.name) : null;
      return !(cron && cron > 0);
    });

    const detail = offenders
      .map((row) => explain(row, cronOk, cronOk ? cronHits(row.name) : null))
      .join("\n" + "-".repeat(74) + "\n");

    expect(
      offenders.map((o) => o.signature),
      `${offenders.length} client-executable function(s) have no caller anywhere.\n` +
        `THIS GUARD IS NOW GREEN AND MUST STAY GREEN. It shipped on 2026-09-10 ` +
        `with 14 known findings; every one was settled by investigation, never ` +
        `by allowlisting a finding to silence it (14 -> 13 ` +
        `get_inspection_doc_by_token dropped, 13 -> 12 search scope widened to ` +
        `every schema, 12 -> 11 can_driver_message_staff dropped, 11 -> 6 the ` +
        `five accessorial adjustment writers got a screen in Module 5 Pass 5, ` +
        `6 -> 3 compliance_status, get_pei_requests_needing_action and ` +
        `get_application_pei_summary dropped, 3 -> 1 assign_user_role and ` +
        `remove_user_role allowlisted SUPERSEDED naming the service_role ` +
        `edge-function path that really assigns roles, 1 -> 0 get_user_roles ` +
        `dropped on 2026-09-11: no caller in any schema, and as a SECURITY ` +
        `DEFINER taking an arbitrary user id with no in-body gate it let any ` +
        `signed-in user read another user's roles). ANY NAME BELOW IS NEW. ` +
        `A FINDING IS A CANDIDATE, NOT A VERDICT: one of the 14 turned out to ` +
        `be called by a storage.objects policy this guard could not see. ` +
        `Investigate before you act, and do not make this pass by ` +
        `allowlisting.\n${detail}`,
    ).toEqual([]);
  });

  itLive("stale allowlist entries are reported", () => {
    const live = new Set(loadCatalog().map((r) => r.name));
    const stale = KNOWN_NO_CALLER_ENTRIES.filter((e) => !live.has(e.name));
    if (stale.length > 0) {
      console.warn(
        `KNOWN_NO_CALLER_ENTRIES has ${stale.length} entr(y|ies) that no longer ` +
          `exist or are no longer client-executable. Remove them and lower ` +
          `KNOWN_NO_CALLER_MAX:\n  ${stale.map((e) => e.name).join("\n  ")}`,
      );
    }
    expect(true).toBe(true);
  });
});
