import { describe, expect } from "vitest";
import { gatedIt, skipBanner } from "@/test/helpers/gate";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * RETURN SHEET DEVICE TYPES — THIS GUARD IS GREEN.
 *
 * Two enums describe device types and they drifted: the deactivation wizard
 * offers a return list built from `equipment_items.device_type` (plain text:
 * bestpass, dash_cam, eld, fuel_card) plus `license_plate`, while the sheet
 * stores `public.osas_device_type`. `fuel_card` was missing from the sheet enum
 * until 2026-09-13, so every driver holding a fuel card failed the equipment
 * return step.
 *
 * Any name this guard reports is a NEW drift: a device the wizard offers that
 * the sheet cannot store. It is not inherited noise.
 *
 * It also pins the write ORDERING. The parent sheet used to be written `signed`
 * BEFORE the item insert, so a failed insert left an orphaned signed sheet with
 * no items — which hides the return list, making each retry worse. The sheet is
 * now written `draft`, then the items, then `signed`.
 */

const HAS_DB = Boolean(process.env.PGHOST);
const WIZARD = "src/components/management/DeactivationWizardContent.tsx";

if (!HAS_DB) {
  skipBanner("return-sheet-device-enum.test.ts LIVE CHECKS DID NOT RUN", [
    "No PGHOST, so osas_device_type could not be read.",
    "The enum drift can only be seen against the live catalog.",
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: "no PGHOST, so osas_device_type could not be read",
});

function psql(sql: string): string[] {
  return execFileSync("psql", ["-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** The device types the wizard's return list can offer. */
function offeredDeviceTypes(): string[] {
  const src = readFileSync(WIZARD, "utf8");
  const block = src.match(/const RETURN_DEVICE_LABELS[^{]*\{([\s\S]*?)\}/);
  expect(block, "RETURN_DEVICE_LABELS not found — the guard would assert nothing").toBeTruthy();
  return [...block![1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
}

describe("equipment return sheet device types", () => {
  itLive("every device the wizard offers is storable on a sheet", () => {
    const enumValues = psql(
      "select e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid " +
        "where t.typname = 'osas_device_type' order by e.enumsortorder",
    );
    expect(enumValues.length).toBeGreaterThan(0);
    const missing = offeredDeviceTypes().filter((d) => !enumValues.includes(d));
    expect(missing, `offered by the wizard, rejected by osas_device_type: ${missing.join(", ")}`).toEqual([]);
  });

  itLive("every device type in inventory is storable on a sheet", () => {
    const enumValues = psql(
      "select e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = 'osas_device_type'",
    );
    const inventory = psql("select distinct device_type from public.equipment_items where device_type is not null");
    const missing = inventory.filter((d) => !enumValues.includes(d));
    expect(missing, `held in equipment_items, rejected by osas_device_type: ${missing.join(", ")}`).toEqual([]);
  });

  /**
   * A device type is defined in THREE places, not two: this CHECK constraint, the
   * `osas_device_type` enum, and RETURN_DEVICE_LABELS in the wizard. The CHECK is
   * the EARLIEST warning — no `equipment_items` row can carry a value it does not
   * list, so the data arm above cannot go red until this constraint is widened.
   * Widening it is exactly the moment a new device type is introduced, so this arm
   * fires before a single row exists and before any offboarding fails.
   */
  itLive("every device type the inventory CHECK permits is storable on a sheet", () => {
    const enumValues = psql(
      "select e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = 'osas_device_type'",
    );
    const [definition] = psql(
      "select pg_get_constraintdef(oid) from pg_constraint " +
        "where conname = 'equipment_items_device_type_check'",
    );
    expect(definition, "the equipment_items device_type CHECK is gone — this arm asserts nothing").toBeTruthy();
    const permitted = [...definition.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(permitted.length, "no values parsed out of the CHECK — the arm asserts nothing").toBeGreaterThan(0);
    const missing = permitted.filter((d) => !enumValues.includes(d));
    expect(missing, `permitted by the inventory CHECK, rejected by osas_device_type: ${missing.join(", ")}`).toEqual([]);
  });


  itLive("no return sheet exists without items", () => {
    const orphans = psql(
      "select s.id from public.onboard_assignment_sheets s where not exists " +
        "(select 1 from public.onboard_assignment_sheet_items i where i.sheet_id = s.id)",
    );
    expect(orphans, `sheets with no items — a failed write left these behind: ${orphans.join(", ")}`).toEqual([]);
  });

  it("the return sheet is written draft first and signed only after its items land", () => {
    const src = readFileSync(WIZARD, "utf8");
    const fn = src.slice(src.indexOf("const handleBuildReturnSheet"));
    const body = fn.slice(0, fn.indexOf("const handleSendReturnInstructions"));
    const draftAt = body.indexOf("status: 'draft'");
    const itemsAt = body.indexOf("onboard_assignment_sheet_items");
    const signAt = body.indexOf("status: 'signed'");
    expect(draftAt, "the sheet must be inserted as draft").toBeGreaterThan(-1);
    expect(itemsAt).toBeGreaterThan(draftAt);
    expect(signAt, "signing must come after the item insert").toBeGreaterThan(itemsAt);
    expect(body, "a failed item insert must delete the draft").toMatch(/delete\(\)\.eq\('id', sheet\.id\)/);
  });
});
