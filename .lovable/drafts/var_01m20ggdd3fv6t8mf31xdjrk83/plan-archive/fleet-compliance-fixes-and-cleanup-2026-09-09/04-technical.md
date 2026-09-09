## Technical notes

**Menu label** — `src/pages/management/ManagementPortal.tsx:1032` and `:1109`: label `'Compliance Tracking'` / `'Compliance'` → `'Fleet Compliance'`. View id `compliance`, path, badge and deep links unchanged.

**Open → document** — `ComplianceAlertsPanel.tsx`:
- `fetchData` (~`:99-129`) currently selects only `driver_id, name, expires_at` from `inspection_documents`; add `id, file_path`. For DOT rows, carry the corresponding `truck_dot_inspections` file reference if one exists, else treat as no-file.
- Replace the `onOpenOperatorWithFocus` call at `:793-796` with: file present → open `FilePreviewModal` (resolve bucket with `bucketForBinderDoc()` from `src/components/inspection/DocRow.tsx`); no file → invoke the existing renewal-upload path for that operator + doc key.
- Drop the `'dot'`/`focusField` prop plumbing that no longer has a consumer: `ComplianceAlertsPanel.tsx:32`, the wiring in `ManagementPortal.tsx:2064-2075` and `:2462-2473`, and the `focusField` branch in `ApplicationReviewDrawer.tsx:438-451` — only after confirming the Overview chip path at `:2092-2100` still needs it and is left working.
- Add error handling to the DOT fetch (`:123-128`) mirroring the toast in `InspectionComplianceSummary.tsx:167-174`.

**Summary view action** — `InspectionComplianceSummary.tsx`: rows already carry `file_path` (mapped `:180-189`, used only for `isStale`). Add a view control beside `UploadButton` (`:955-982`) and `HistoryButton` (`:1004-1018`) in both list rows and cards, opening the same preview modal. Hidden when `file_path` is null.

**Fleet / Drivers tabs** — rows are already split by `entity_kind` (`:190-202`) and grouped as `fleetGroups` vs driver groups (`:770-771`, list `:1498-1516`, cards `:1356-1400`). Add a scope toggle (`'drivers' | 'fleet'`, default `drivers`) persisted alongside the existing `viewMode`/`sortMode` localStorage keys (`:110-123`); filter `grouped` by scope; remove the fleet-first sort tie-break (`:240-257`) and the search-hides-fleet special case (`:770-771`). Doc-type chips recompute within the active scope; the header All/Expired/Critical/Valid pills stay fleet+driver totals.

**Stale tooltip clipping** — `src/components/ui/tooltip.tsx` renders `TooltipPrimitive.Content` without a `Portal`, so tooltips are clipped by any `overflow` ancestor — here, the horizontally scrolling compliance table. Wrap the content in `TooltipPrimitive.Portal` (matching how `popover.tsx` does it) and add `collisionPadding={8}`; this is a global fix and every existing tooltip should be spot-checked. Reword the copy at `InspectionComplianceSummary.tsx:910` and widen `max-w-[220px]` to `max-w-xs`.

**Sync check (no code change assumed until verified)** — inline date saves already write `inspection_documents.expires_at` and, for CDL/Med Cert, mirror to `applications.cdl_expiration` / `medical_cert_expiration`; uploads mirror `applications.certificate_file_path` (`:588,600`). Confirm the DOT path (`truck_dot_inspections`) and the fleet path write through the same way, and that the driver profile, binder and alerts re-read after a save (realtime channels `:311-328`). Any gap found becomes a fix in the same pass.

**Verification** — drive the running app: open Fleet Compliance, click Open on a Med Cert alert with a file (preview opens), one without (upload opens), and a DOT alert; hover a Stale pill in the scrolled table and confirm the full sentence shows; toggle Fleet/Drivers; edit an expiry and confirm the new value on the driver profile and binder; run `bunx vitest run src/components/inspection src/test` and a typecheck.
