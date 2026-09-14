import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";

/**
 * LOAD-CHARGE AUTHORISATION ORDER — LIVE CATALOG.
 *
 * A load charge reaches the broker invoice, the driver settlement and the
 * dispatch base. The three entry RPCs are SECURITY DEFINER and
 * `authenticated`-executable, so RLS on `load_charges` does not protect them:
 * `assert_charge_entry_allowed` inside the body is the whole protection.
 *
 * On 2026-09-14 a reviewer read the migration and reported the gate missing. It
 * was not missing — but in `update_load_charge` and `delete_load_charge` it sat
 * AFTER the charge lookup, so an unauthorised caller was told 'Charge not found'
 * and a reader had to scroll past a lookup and arithmetic to find the
 * authorisation. This pins the corrected order, and that the gate itself stays
 * unreachable from the API.
 *
 * Reads the live definition, not the migration text: the record documents a
 * migration that rewrote a function by transforming its live source, so the
 * newest file is not always the newest definition.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("load-charge-gate-order.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so the live bodies could not be read. Nothing else in the suite",
    "sees the authorisation gate move behind the charge lookup.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live function bodies could not be read",
  details: ["Only this check reads the shipped charge-entry bodies."],
});

function psql(sql: string): string {
  return execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const bodyOf = (name: string) =>
  psql(
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '${name}'`,
  ).replace(/--[^\n]*/g, "");

const ENTRY_POINTS = ["add_load_charge", "update_load_charge", "delete_load_charge"];

describe("load charge entry is authorised before anything else happens", () => {
  itLive("every entry point calls the gate, and calls it before any write", () => {
    for (const fn of ENTRY_POINTS) {
      const body = bodyOf(fn);
      const gate = body.indexOf("assert_charge_entry_allowed");
      expect(gate, `${fn} does not call assert_charge_entry_allowed at all`).toBeGreaterThan(-1);
      for (const write of ["INSERT INTO", "UPDATE public.load_charges", "DELETE FROM"]) {
        const at = body.indexOf(write);
        if (at > -1) {
          expect(gate, `${fn}: "${write}" precedes the authorisation gate`).toBeLessThan(at);
        }
      }
    }
  });

  itLive("the gate precedes the 'Charge not found' lookup, so refusals tell the truth", () => {
    // Before 2026-09-14 an unauthorised caller was told the charge did not
    // exist — a claim about the data, when the truth was permission.
    for (const fn of ["update_load_charge", "delete_load_charge"]) {
      const body = bodyOf(fn);
      const gate = body.indexOf("assert_charge_entry_allowed");
      const notFound = body.indexOf("Charge not found");
      expect(notFound, `${fn} lost its 'Charge not found' message`).toBeGreaterThan(-1);
      expect(gate, `${fn}: 'Charge not found' is raised before the gate runs`).toBeLessThan(notFound);
    }
  });

  itLive("the gate's role test precedes its own load lookup", () => {
    // This is what makes calling the gate with a NULL load id safe: a made-up
    // charge id still meets the role refusal, not a message about the load.
    const body = bodyOf("assert_charge_entry_allowed");
    const role = body.search(/has_role\(/);
    const lookup = body.search(/FROM\s+public\.loads/i);
    expect(role).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(-1);
    expect(role, "the gate looks the load up before testing the caller's role").toBeLessThan(lookup);
    expect(body).toMatch(/management/);
    expect(body).toMatch(/owner/);
    expect(body).toMatch(/dispatcher/);
  });

  itLive("the gate is not callable from the API, and the three entry points are", () => {
    const rows = psql(`
      SELECT has_function_privilege('authenticated', 'public.assert_charge_entry_allowed(uuid)', 'EXECUTE')::text
      UNION ALL
      SELECT has_function_privilege('authenticated', 'public.add_load_charge(uuid,text,numeric,text,text,text,numeric,uuid)', 'EXECUTE')::text
      UNION ALL
      SELECT has_function_privilege('authenticated', 'public.update_load_charge(uuid,text,numeric,text,text,text,numeric,uuid)', 'EXECUTE')::text
      UNION ALL
      SELECT has_function_privilege('authenticated', 'public.delete_load_charge(uuid,text)', 'EXECUTE')::text
    `).split("\n");
    // The gate is unreachable from outside and unavoidable from inside.
    expect(rows).toEqual(["false", "true", "true", "true"]);
  });
});
