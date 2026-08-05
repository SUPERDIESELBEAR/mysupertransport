# Rename Stage 5 to "Onboard Systems"

Stage 5 is currently labeled "Equipment Setup" / "Stage 5 — Equipment" in several places, both staff-facing and driver-facing. Renaming only the pipeline panel header would leave the other labels inconsistent, so the rename should cover every user-visible spot.

## Where the Stage 5 label appears today

Staff side
- Onboarding Pipeline detail panel header: "Stage 5 — Equipment Setup"
- Pipeline stage chips/filters, legend and color map: stage name "Stage 5 — Equipment", short badge "Equip"
- Pipeline dispatch warnings: "Stage 5 (Equipment Setup) is still open", "Finalize Stage 5 →"
- Management Overview stage breakdown chip: label "EQ", tooltip title "Equipment"
- Bulk Message modal stage filter list
- Milestone label: "Equipment Setup Complete (Decal, ELD, Fuel Card, IFTA Decal)"
- Staff Help / FAQ index entry: "Stage 5 — Equipment Setup" plus its steps and keywords
- Database `pipeline_config` row (stage_key `equip`): full_name "Equipment Setup", short label "Equip"

Driver side
- Driver portal onboarding progress stage 5 title: "Equipment Setup"
- Smart Progress Widget stage 5 title: "Equipment Setup"
- Onboarding milestone notification heading: "🚛 Equipment Setup Complete"

## Proposed new labels

- Long label: "Stage 5 — Onboard Systems"
- Driver/stage title: "Onboard Systems"
- Short badge: "Systems" (replaces "Equip"); Overview chip "OS" (replaces "EQ")
- Milestone/email: "Onboard Systems Complete (Decal, ELD, Fuel Card, IFTA Decal)"

This matches the "Onboard Systems" naming already used for equipment inventory and the Onboard Systems Assignment Sheet (OSAS).

## Technical notes

- `'Stage 5 — Equipment'` is also used as an internal stage *key* (stage filters, chip routing, color map, bulk-message filter). All occurrences get renamed together (PipelineDashboard, ManagementPortal, BulkMessageModal) so filter round-trips keep working; the string isn't persisted in the database.
- `pipeline_config.stage_key` stays `equip` (referenced by completion logic and prior migrations); only `full_name` and `label` change via a small update migration.
- Field names (`decal_applied`, `eld_installed`, `fuel_card_issued`, `ifta_decal_issued`) and all completion logic stay unchanged. Non-user-visible code comments can keep saying Stage 5.
- No change to IFTA Decal behavior: it stays a tracking-only dropdown excluded from completion and progress.

## Files touched

- `src/pages/staff/OperatorDetailPanel.tsx`
- `src/pages/staff/PipelineDashboard.tsx`
- `src/pages/management/ManagementPortal.tsx`
- `src/components/staff/BulkMessageModal.tsx`
- `src/pages/operator/OperatorPortal.tsx`
- `src/components/operator/SmartProgressWidget.tsx`
- `src/lib/staffHelp/help-index.ts`
- `supabase/functions/send-notification/index.ts`
- One migration updating the `equip` row in `pipeline_config`