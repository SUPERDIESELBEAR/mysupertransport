

## Add "ELD Exempt" toggle for pre-2000 trucks (Stage 5)

Per FMCSA rule §395.8(a)(1)(iii), trucks with engines manufactured before model year 2000 are exempt from ELD requirements and may use paper logs instead. Today, Stage 5 always requires an **ELD Serial #** and **Dash Cam #**, which forces staff to enter junk data for these trucks. This plan adds a clean exempt flag that propagates everywhere.

### What you'll see

**Stage 5 — Equipment Setup (OperatorDetailPanel)**
- A new gold toggle at the top of the **ELD section**: **"ELD Exempt — Pre-2000 truck (paper logs allowed)"**
- When ON:
  - "ELD Install Method", "ELD Installed", **ELD Serial #**, and **Dash Cam #** fields collapse and are visually replaced by a single gold info chip:
    > 🛡️ *ELD Exempt — Pre-2000 truck. Paper logs in use. (FMCSA §395.8(a)(1)(iii))*
  - Stage 5 completion no longer requires `eld_installed = yes`, `eld_serial_number`, or `dash_cam_number`. Only **Decal Applied** + **Fuel Card Issued** + assigned BestPass/Fuel numbers are required.
  - The "Equipment Setup Complete" milestone email still fires, but with adjusted body ("Decal applied, paper logs approved, fuel card issued").
- When OFF: current behavior unchanged.

**Auto-suggest when truck year < 2000**
- If `truck_year` is filled and parses as < 2000, a small inline hint appears next to the toggle: *"This truck appears to be pre-2000. Consider enabling ELD Exempt."* — never auto-toggled; staff stays in control.

**Operator Portal (Stage 5 view)**
- Substep list omits "ELD Installed" and shows a single read-only row instead:
  > **ELD Status:** Exempt — Pre-2000 truck (paper logs)
- Stage 5 status logic treats exempt trucks as satisfying the ELD requirement.

**Pipeline Dashboard (EQUIP dot)**
- For exempt operators, the EQUIP dot completion check ignores ELD; if Decal + Fuel Card are done, the dot turns green (no more "stuck at 2/3" forever).
- Tooltip line for ELD reads: *"ELD — Exempt (pre-2000)"* in gold instead of grey/green.

**TruckInfoCard (operator + staff views)**
- "ELD Serial #" row is hidden when exempt and replaced with a small gold "Exempt" badge in the device grid.
- "Dash Cam #" row is hidden the same way (since dash cam is only required alongside ELD policy).

**Fleet Roster / Vehicle Hub**
- New small gold "ELD Exempt" pill on the truck card.

**Equipment Inventory → Assign Modal**
- When assigning ELD or Dash Cam to an exempt operator, a warning appears: *"This operator is marked ELD Exempt. Assign anyway?"* — does not block, just confirms.

**Bulk Message / Stage filters**
- `computeStage` treats exempt operators' Stage 5 as complete on Decal + Fuel Card alone.

### How it works (technical)

**Database (1 migration)**
- Add `eld_exempt boolean NOT NULL DEFAULT false` to `public.onboarding_status`.
- Add `eld_exempt_reason text NULL` (free-text, defaults to "Pre-2000 truck — FMCSA §395.8(a)(1)(iii)" when toggled on; staff-editable).
- Update milestone trigger `notify_operator_on_status_change` so the `equipment_ready` notification fires when:
  ```
  decal_applied='yes' AND fuel_card_issued='yes'
    AND (eld_installed='yes' OR eld_exempt=true)
  ```
- Update `pipeline_config.equip.items` JSON to include a synthetic note for ELD: when `eld_exempt=true`, the `eld_installed` item is treated as satisfied. (Implemented in app code, not SQL — the config row stays as-is for non-exempt ops.)

**Frontend (one shared completion helper)**

Create `src/lib/equipmentCompletion.ts`:
```ts
export function isEldRequirementMet(s: { eld_installed?: string|null; eld_exempt?: boolean|null }) {
  return s.eld_exempt === true || s.eld_installed === 'yes';
}
export function isEquipmentStageComplete(s: {...}) {
  return s.decal_applied === 'yes' && s.fuel_card_issued === 'yes' && isEldRequirementMet(s);
}
```
All ~12 inline checks across these files refactor to use the helper:
- `src/pages/staff/OperatorDetailPanel.tsx` (Stage 5 panel, auto-collapse, milestone detection, mini status track, save handler)
- `src/pages/operator/OperatorPortal.tsx` (Stage 5 status + substeps)
- `src/pages/staff/PipelineDashboard.tsx` (EQUIP dot state, `computeStage`, `isStage5Open`)
- `src/components/staff/BulkMessageModal.tsx` (`computeStage`)
- `src/components/operator/TruckInfoCard.tsx` (hide ELD/Dash rows when exempt; show badge)
- `src/components/equipment/EquipmentAssignModal.tsx` (confirm-before-assign warning)
- `src/components/fleet/FleetRoster.tsx` (exempt pill)

**Stage 5 UI changes (OperatorDetailPanel, ~line 4979)**
- Insert toggle row above "ELD Install Method".
- Wrap the ELD method/installed/serial/dash-cam fields in `{!status.eld_exempt && (...)}`.
- When `eld_exempt`, render the gold info chip + a textarea for `eld_exempt_reason` (collapsed by default).

**Auto-suggest logic**
```ts
const looksPre2000 = (() => {
  const y = parseInt(status.truck_year ?? '', 10);
  return Number.isFinite(y) && y > 1900 && y < 2000;
})();
```
Shown only when `!status.eld_exempt && looksPre2000`.

**Audit trail**
- Toggling `eld_exempt` writes an `audit_log` entry: action `equipment.eld_exempt_changed`, metadata `{ from, to, reason, truck_year }` — same pattern as existing equipment changes.

### Files touched

```text
supabase/migrations/<new>.sql                              [+ columns, trigger update]
src/lib/equipmentCompletion.ts                             [NEW — shared helper]
src/integrations/supabase/types.ts                         [auto-regen]
src/pages/staff/OperatorDetailPanel.tsx                    [toggle UI + refactors]
src/pages/operator/OperatorPortal.tsx                      [stage status + substeps]
src/pages/staff/PipelineDashboard.tsx                      [EQUIP dot + computeStage]
src/components/staff/BulkMessageModal.tsx                  [computeStage]
src/components/operator/TruckInfoCard.tsx                  [hide ELD/Dash rows]
src/components/equipment/EquipmentAssignModal.tsx          [confirm warning]
src/components/fleet/FleetRoster.tsx                       [exempt pill]
mem://features/onboarding/eld-exempt                       [NEW memory file]
```

### Out of scope

- No change to ELD/Dash Cam inventory tracking itself — exempt operators simply don't need devices assigned.
- No change to insurance, ICA, or dispatch flows.
- No automatic "set exempt" based on truck year — staff confirms manually.

