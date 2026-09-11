## Technical notes

**Schema (staged as an additive migration, applied when the draft is accepted)**
- `ica_contracts`: add `is_paper_original boolean not null default false`, `paper_scan_path text`, `paper_scan_name text`, `paper_recorded_by uuid`, `paper_recorded_at timestamptz`. Mirrors the pattern already proven on `onboard_assignment_sheets`. No column is dropped or retyped.
- `onboard_assignment_sheets`: add `is_return_only boolean not null default false` so a retroactively built sheet is never mistaken for one that was issued and signed at onboarding. Required columns (`assignment_date`, `status`, `bestpass_included`, `terms_version`, `is_paper_original`) are all satisfiable.
- Storage: reuse the bucket already used for `osas-paper/` scans, under an `ica-paper/<operatorId>/` prefix, with policies matching the existing paper-scan policies.

**Recording the legacy agreement**
- New `RecordPaperIcaModal` (`src/components/ica/`), rendered from the Stage 3 ICA panel and from the wizard's `lease_termination` step when `ica` is null and `onboarding_status.ica_status` is not `not_issued`.
- Pre-fill from `onboarding_status` (`truck_year/make/model/vin/plate/plate_state/trailer_number`, `unit_number`) and `truck_owners` (name, business name, contact). Staff confirm; `lease_effective_date` is entered manually. Insert into `ica_contracts` with `status = 'complete'`, `is_paper_original = true`, `contractor_signed_at` set to the entered signing date, and `linehaul_split_pct` from the current default rather than hardcoded.
- Scan optional: when present, upload then store path/name; when absent, the ICA panel and Appendix C preview show "no signed copy on file."
- Audit: `audit_log` row `action: 'ica_paper_recorded'`, entity `operator`.

**Steps 4 and 8 need no branching** once a row exists — `handleCreateLeaseTermination` and `handleVoidIca` already read `ica` and `lease_terminations.ica_contract_id` is nullable anyway. The Appendix C content and `send-lease-termination` are unchanged.

**Equipment return without a sheet**
- In `DeactivationWizardContent`, when `sheets` is empty, render a confirm-list built from the data already fetched: open `equipment_assignments` joined to `equipment_items` (eld, dash_cam, bestpass, fuel_card), open `mo_plate_assignments`, and `onboarding_status` device numbers as a fallback label when no inventory row exists. Serial-less lines render "serial not on file" and stay uncheckable-but-visible rather than being silently dropped.
- Confirming inserts one `onboard_assignment_sheets` row (`is_return_only = true`, `is_paper_original = false`, `assignment_date` = earliest open assignment date, `status` = the existing value used for an acknowledged sheet) plus `onboard_assignment_sheet_items` rows from the confirmed list, then calls the existing `send-equipment-return-instructions` function with that `sheetId`. Nothing is emailed until staff confirm the list.
- The rest of step 5 (decal photos, receipts, `return_completed_at`) then behaves identically.
- `SignOffSheetList` and `SignOffSheetPreviewModal` gain a "Return only" badge so these rows read correctly in the equipment hub and never look like a missing signature.

**Derived-status effect** in the wizard: the current auto-skip branches (`No active ICA contract on file`, `No active equipment assignment sheets`) become "action available" states rather than skips when the new paths apply, so the step stays open instead of self-completing.

**Not in this pass:** no backfill of the 20 agreement-less or 50 sheet-less drivers, no change to the ten steps or their order, no change to insurance recipients or email templates.
