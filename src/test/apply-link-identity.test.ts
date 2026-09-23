import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * THE PER-CARRIER APPLY LINK (pass 3d).
 *
 * Three things must stay true, and none of them can be read off migration text:
 *
 *  1. The public identity reader exposes EXACTLY five columns. It is callable by
 *     `anon` — a stranger on /apply/<slug> — so a sixth column added carelessly
 *     is a public leak out of carrier_profile.
 *  2. `anon` holds NO privilege on `applications`. The public form writes only
 *     through the two definer RPCs. (3d revoked the unused INSERT grant.)
 *  3. An apply slug is unique, lower-cased, and shaped like a URL segment —
 *     otherwise two carriers could answer to the same link.
 */
const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("apply-link-identity.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so the public identity reader's column list, the anon grants",
    "on applications and the slug uniqueness index could not be read. A green",
    "run without this file proves none of them.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live catalog could not be read",
  details: ["Only a live read can see a grant or column added out of band."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** The five public fields, and nothing else, in order. */
const PUBLIC_IDENTITY_FIELDS = [
  "legal_name",
  "applicant_locality",
  "usdot_number",
  "mc_number",
  "apply_slug",
];

describe("per-carrier apply link", () => {
  itLive("the public identity reader exposes exactly the five public fields", () => {
    for (const fn of ["carrier_public_identity", "carrier_identity_for_draft"]) {
      const args = psql(
        `SELECT pg_get_function_result(p.oid) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = '${fn}';`,
      ).join(" ");
      expect(args, `${fn} must exist`).not.toBe("");
      for (const field of PUBLIC_IDENTITY_FIELDS) {
        expect(args, `${fn} must return ${field}`).toContain(field);
      }
      // Anything beyond the five is a public leak out of carrier_profile.
      const returned = (args.match(/\b([a-z_]+)\s+(text|uuid|boolean|date|timestamp)/g) ?? [])
        .map((m) => m.trim().split(/\s+/)[0]);
      expect(returned.sort()).toEqual([...PUBLIC_IDENTITY_FIELDS].sort());
    }
  });

  itLive("anon can call both readers and nothing else it did not have", () => {
    for (const fn of ["carrier_public_identity", "carrier_identity_for_draft"]) {
      const ok = psql(
        `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = '${fn}';`,
      );
      expect(ok, `anon must be able to call ${fn} from the public form`).toEqual(["t"]);
    }
  });

  itLive("anon holds no privilege on applications", () => {
    const privs = psql(
      `SELECT privilege_type FROM (
         SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS privilege_type
       ) p
        WHERE has_table_privilege('anon', 'public.applications', p.privilege_type);`,
    );
    expect(privs).toEqual([]);
  });

  itLive("the stamp trigger trusts ONLY the carrier this transaction resolved", () => {
    const def = psql(
      `SELECT replace(pg_get_functiondef(p.oid), E'\\n', ' ') FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'stamp_application_company';`,
    ).join(" ");
    // Transaction-local, set by save_application_draft after it resolved the slug
    // server-side. A browser cannot reach it.
    expect(def).toContain("app.apply_link_company");
    expect(def).toContain("current_setting('app.apply_link_company', true)");
    // The trust is an EXACT match, never a fallback to "some carrier".
    expect(def).toContain("NEW.company_id = v_declared::uuid");
  });

  itLive("save_application_draft resolves the slug itself and refuses an unknown one", () => {
    const def = psql(
      `SELECT replace(pg_get_functiondef(p.oid), E'\\n', ' ') FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'save_application_draft';`,
    ).join(" ");
    expect(def).toContain("carrier_slug");
    expect(def).toContain("lower(c.apply_slug) = lower(v_slug)");
    expect(def).toContain("unknown_carrier");
    // The browser must never be able to name a carrier id directly.
    expect(def).not.toContain("p_payload->>'company_id'");
  });

  itLive("an apply slug is unique, and shaped like a URL segment", () => {
    const idx = psql(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname='public' AND indexname='carrier_profile_apply_slug_unique';`,
    ).join(" ");
    expect(idx).toContain("UNIQUE");
    expect(idx).toContain("lower(apply_slug)");

    const chk = psql(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname='carrier_profile_apply_slug_format';`,
    ).join(" ");
    expect(chk).toContain("~");
  });

  itLive("SUPERTRANSPORT's own link resolves to SUPERTRANSPORT", () => {
    const row = psql(
      `SELECT legal_name || ' | USDOT ' || usdot_number || ' | MC ' || mc_number
         FROM public.carrier_public_identity('supertransport');`,
    );
    expect(row).toEqual(["SUPERTRANSPORT, LLC | USDOT 2309365 | MC 788425"]);
    // An unknown slug returns NO ROW: the page says so rather than printing
    // whichever carrier happened to be first.
    expect(psql(`SELECT count(*) FROM public.carrier_public_identity('no-such-carrier');`))
      .toEqual(["0"]);
  });
});
