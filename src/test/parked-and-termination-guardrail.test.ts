import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import {
  canSubmitPark, isParked, parkedSummary, shouldRollForward, PARKED_REASONS,
} from "@/lib/parking";
import {
  looksActivelyWorking, nameMatches, TERMINATION_REASONS, terminationReasonLabel,
} from "@/lib/leaseTermination";

/**
 * PARKED STATE + LEASE-TERMINATION GUARDRAIL.
 *
 * Nine lease_terminations rows were written in three weeks by one person who
 * believed she was recording a status. Six of those drivers were never
 * terminated. Two things are asserted here: the parked control that should
 * have existed behaves as an overlay (active driver, equipment untouched, no
 * termination row), and the termination path cannot be walked without a typed
 * name and a deliberately chosen legal ground.
 */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner("parked live checks did not run", [
    "No PGHOST, so the parked columns, RPC hardening and the standing",
    "lease_terminations row count could not be read.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so the live catalog could not be read",
  details: ["Only this file asserts the nine existing rows are untouched."],
});

function psql(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

describe("parked — pure behaviour", () => {
  it("reason is required, and 'other' additionally requires a note", () => {
    expect(canSubmitPark(null, "")).toBe(false);
    expect(canSubmitPark("vacation", "")).toBe(true);
    expect(canSubmitPark("other", "   ")).toBe(false);
    expect(canSubmitPark("other", "grandfather's funeral")).toBe(true);
  });

  it("covers every real case that was mis-filed as a termination", () => {
    expect(PARKED_REASONS).toContain("truck_down");
    expect(PARKED_REASONS).toContain("vacation");
    expect(PARKED_REASONS).toContain("personal_time_off");
    expect(PARKED_REASONS).toContain("medical");
    expect(PARKED_REASONS).toContain("other");
  });

  it("tolerates not knowing the return date", () => {
    const summary = parkedSummary({ is_parked: true, parked_reason: "truck_down", parked_expected_return: null });
    expect(summary).toContain("return date unknown");
  });

  it("is an overlay, not a day status — parked is only parked", () => {
    expect(isParked({ is_parked: true })).toBe(true);
    expect(isParked({ is_parked: false })).toBe(false);
    expect(isParked(null)).toBe(false);
  });

  it("the nightly rollover skips parked drivers instead of carrying them forward", () => {
    expect(shouldRollForward({ is_parked: false, excluded_from_dispatch: false })).toBe(true);
    expect(shouldRollForward({ is_parked: true, excluded_from_dispatch: false })).toBe(false);
    expect(shouldRollForward({ is_parked: false, excluded_from_dispatch: true })).toBe(false);
  });
});

describe("lease termination — guardrail behaviour", () => {
  it("requires the typed name to match; a mismatch does not proceed", () => {
    expect(nameMatches("Cody Fifer", "Cody Fifer")).toBe(true);
    expect(nameMatches("  cody   fifer ", "Cody Fifer")).toBe(true);
    expect(nameMatches("Cody", "Cody Fifer")).toBe(false);
    expect(nameMatches("", "Cody Fifer")).toBe(false);
  });

  it("warns on exactly the shape all six mistaken rows had", () => {
    expect(looksActivelyWorking({ isActive: true, excludedFromDispatch: false, dispatchStatus: "dispatched" })).toBe(true);
    expect(looksActivelyWorking({ isActive: true, excludedFromDispatch: true, dispatchStatus: "dispatched" })).toBe(false);
    expect(looksActivelyWorking({ isActive: false, excludedFromDispatch: false, dispatchStatus: "dispatched" })).toBe(false);
    expect(looksActivelyWorking({ isActive: true, excludedFromDispatch: false, dispatchStatus: "not_dispatched" })).toBe(false);
  });

  it("has no default legal ground — absence reads as unrecorded, never as 'voluntary'", () => {
    expect(terminationReasonLabel(null)).toBe("No legal ground recorded");
    expect(TERMINATION_REASONS[0]).toBe("voluntary");
    // The list exists, but nothing in the helpers picks one for the user.
    expect(terminationReasonLabel("cause")).toMatch(/for cause/i);
  });
});

describe("parked — live schema and standing rows", () => {
  itLive("parked columns live on operators and keep the driver active", () => {
    const cols = psql(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='operators'
        and column_name in ('is_parked','parked_reason','parked_note','parked_expected_return','parked_at','parked_by')
      order by column_name`);
    expect(cols.sort()).toEqual([
      "is_parked", "parked_at", "parked_by", "parked_expected_return", "parked_note", "parked_reason",
    ]);
    // Parked is NOT is_active: no parked driver may be deactivated by parking.
    const bad = psql(`select count(*) from public.operators where is_parked = true and is_active = false`);
    expect(bad[0]).toBe("0");
  });

  itLive("a parked driver keeps their equipment assignments", () => {
    const orphaned = psql(`
      select count(*) from public.operators o
      where o.is_parked = true
        and not exists (
          select 1 from public.equipment_assignments ea
          where ea.operator_id = o.id and ea.returned_at is null
        )
        and exists (
          select 1 from public.equipment_assignments ea2 where ea2.operator_id = o.id
        )`);
    // Parking never returns equipment, so any operator who had an open
    // assignment before parking still has one.
    expect(orphaned[0]).toBe("0");
  });

  itLive("parking writes no lease_terminations row — the standing set is untouched", () => {
    // 31 rows stand today (16 voluntary, 12 cause, 3 mutual), including the
    // nine written in the three-week window under investigation. This pass
    // does not modify, void or delete any of them.
    const total = psql(`select count(*) from public.lease_terminations`);
    expect(Number(total[0])).toBe(31);
    const parkedWithTermination = psql(`
      select count(*) from public.operators o
      join public.lease_terminations lt on lt.operator_id = o.id
      where o.parked_at is not null and lt.created_at > o.parked_at`);
    expect(parkedWithTermination[0]).toBe("0");
  });

  itLive("the parked RPCs are hardened", () => {
    const rows = psql(`
      select p.proname || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig,','),'') ||
             '|' || coalesce(array_to_string(p.proacl,','),'')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in ('set_operator_parked','clear_operator_parked')
      order by p.proname`);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row).toContain("|true|"); // SECURITY DEFINER
      expect(row).toContain("search_path=public, extensions");
      expect(row).not.toMatch(/(^|,)=X\//); // no PUBLIC execute
      expect(row).not.toContain("anon=X/");
    }
  });
});
