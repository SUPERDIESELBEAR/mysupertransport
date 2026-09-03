## Technical notes

**Storage (staged migration, applies when the draft is accepted)**

New additive table `public.vacant_units`: `operator_id` (the driver being deactivated), `unit_number`, snapshot of truck fields (`truck_year/make/model/vin/plate/plate_state/trailer_number`), `truck_owner_id`, `disposition` (`truck_stays` | `undecided`), `held_at`, `held_by`, `released_at`, `released_by`, `release_reason`, `resolved_operator_id`, plus standard timestamps. GRANTs: `SELECT, INSERT, UPDATE` to `authenticated`, `ALL` to `service_role`; RLS restricted to management/owner/onboarding_staff via `has_role`.

The wizard's answer is also written into the existing `operator_offboarding_steps` row (`step_key = 'unit_disposition'`) and into the `operator_deactivated` audit metadata, so the record stands even if the vacant row is later released.

**Wizard**

- `src/components/management/DeactivationWizardContent.tsx`: add `'unit_disposition'` to `OffboardingStepKey` and to `orderedSteps` immediately after `reason`; block Next until an option is picked. Truck snapshot is read from the existing `onboarding_status` join already fetched in `fetchAllData`; truck owner from `truck_owners` by `operator_id`.
- MO plate step: when disposition is `truck_stays`/`undecided`, present "Keep plate with the unit" as the default and mark the step skipped with that reason rather than urging release.
- ICA void step: show an inline warning when the truck stays, since voiding the contract also ends the truck owner's lease.
- `handleFinalize`: insert the `vacant_units` row (when held) in the same submission, then notify management + onboarding staff via the existing notification insert pattern.

**Vehicle Hub**

- `src/components/fleet/FleetRoster.tsx`: new `Vacant units` card above the roster on the Active tab, fed by an open-rows query on `vacant_units`. Row actions: *Assign new driver* → the existing applicant invite route with unit/truck values prefilled from the snapshot; *Release unit* → confirm dialog capturing a reason, sets `released_at`/`release_reason`, writes an audit row.
- Section is hidden entirely when there are no held units, and only rendered for management/owner (same check the roster already uses).

No schema is dropped, renamed, or retyped; nothing existing changes shape.
