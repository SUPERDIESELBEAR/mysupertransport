import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import {
  canSubmitPark, isParked, parkedSummary, shouldRollForward, PARKED_REASONS,
} from "@/lib/parking";
import {
  countActiveTerminations, isActiveTermination, isVoided, latestActiveTermination,
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

  itLive("parking writes no lease_terminations row", () => {
    // INVARIANT, NOT A CENSUS. This assertion used to hard-code the row count
    // as it stood on 2026-08-31 (31 total, 6 voided). Two legitimate staff
    // terminations on 2026-09-03 broke it through no fault of any code, and
    // that noise was then cited as "pre-existing" cover for a real failure.
    // A guard states a property that must always hold; it never counts rows.
    //
    // The property: parking is not termination. No operator may acquire a
    // termination row at or after the moment they were parked, and no void
    // may be deleted — voided rows stay on the table, withdrawn in place.
    const parkedWithTermination = psql(`
      select count(*) from public.operators o
      join public.lease_terminations lt on lt.operator_id = o.id
      where o.parked_at is not null and lt.created_at > o.parked_at`);
    expect(parkedWithTermination[0]).toBe("0");

    // A void is a withdrawal, never a delete: every voided row is still here.
    const voidedStillPresent = psql(`
      select count(*) from public.lease_terminations where voided_at is not null`);
    expect(Number(voidedStillPresent[0])).toBeGreaterThanOrEqual(6);
  });


  itLive("exactly the six mistaken rows are voided, and no genuine departure is", () => {
    const voidedNames = psql(`
      select trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
      from public.lease_terminations lt
      join public.operators o on o.id = lt.operator_id
      join public.profiles p on p.user_id = o.user_id
      where lt.voided_at is not null
      order by 1`);
    expect(voidedNames).toEqual([
      "Calvin Herrera",
      "Dale Erickson",
      "Ian Dunfee",
      "Steve Figueroa",
      "Steven Fifer",
      "Vino Huddleston",
    ]);

    // The genuine departures keep their terminations.
    const genuine = psql(`
      select count(*)
      from public.lease_terminations lt
      join public.operators o on o.id = lt.operator_id
      join public.profiles p on p.user_id = o.user_id
      where lt.voided_at is not null
        and trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
            in ('Bilal Leggett','Ronald Lockett','Willie Westbrook')`);
    expect(genuine[0]).toBe("0");
  });

  itLive("a void carries a reason, an actor and an audit entry", () => {
    const incomplete = psql(`
      select count(*) from public.lease_terminations
      where voided_at is not null
        and (void_reason is null or btrim(void_reason) = '' or voided_by is null)`);
    expect(incomplete[0]).toBe("0");

    // INVARIANT, NOT A CENSUS. This used to read `toBe(6)` — the number of
    // voids that had happened by 2026-08-31. The seventh legitimate void would
    // have broken it for exactly the reason the `31` did. The property is the
    // one the test is named for: every void carries an audit entry, and every
    // void audit entry describes a real void. Counted against each other, not
    // against a literal.
    const unaudited = psql(`
      select count(*) from public.lease_terminations lt
      where lt.voided_at is not null
        and not exists (
          select 1 from public.audit_log a
          where a.action = 'lease_termination_voided'
            and a.metadata->>'termination_id' = lt.id::text)`);
    expect(unaudited[0]).toBe("0");

    // And no orphan in the other direction: an audit entry claiming a void
    // must name an actor and point at a row that is genuinely voided.
    const orphanAudit = psql(`
      select count(*) from public.audit_log a
      where a.action = 'lease_termination_voided'
        and (a.actor_id is null
             or not exists (
               select 1 from public.lease_terminations lt
               where lt.id::text = a.metadata->>'termination_id'
                 and lt.voided_at is not null))`);
    expect(orphanAudit[0]).toBe("0");
  });

  itLive("no void was issued against a driver who was already gone", () => {
    // A void withdraws a termination recorded in error for someone who was
    // still working. It is NOT a comment on what happens to that driver
    // afterwards: Vino Huddleston's 2026-08-31 void was correct, and his
    // genuine termination on 2026-09-03 does not retroactively invalidate it.
    //
    // So the check is scoped to voided rows with NO subsequent termination
    // for the same operator. Those, and only those, must still describe a
    // working driver. A void against someone already gone is the defect.
    const notWorking = psql(`
      select count(*) from public.lease_terminations lt
      join public.operators o on o.id = lt.operator_id
      where lt.voided_at is not null
        and not exists (
          select 1 from public.lease_terminations later
          where later.operator_id = lt.operator_id
            and later.voided_at is null
            and later.created_at > lt.created_at)
        and (o.is_active is not true or o.excluded_from_dispatch is true)`);
    expect(notWorking[0]).toBe("0");
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


describe("voided terminations — pure behaviour", () => {
  const voided = { voided_at: "2026-08-31T00:00:00Z", void_reason: "Generated in error." };
  const real = { voided_at: null, void_reason: null };

  it("a voided row is not a termination", () => {
    expect(isVoided(voided)).toBe(true);
    expect(isActiveTermination(voided)).toBe(false);
    expect(isActiveTermination(real)).toBe(true);
    expect(isActiveTermination(null)).toBe(false);
  });

  it("the newest non-voided row wins, and a voided one never stands in for it", () => {
    expect(latestActiveTermination([voided])).toBeNull();
    expect(latestActiveTermination([voided, real])).toBe(real);
    expect(latestActiveTermination([])).toBeNull();
  });

  it("counts exclude voided rows without deleting them", () => {
    const rows = [voided, voided, real, real, real];
    expect(rows.length).toBe(5);
    expect(countActiveTerminations(rows)).toBe(3);
  });
});
