

## Sync DOT Periodic Inspections across the app (Vehicle Hub ↔ Inspection Binder ↔ Operator uploads)

Right now there are **two parallel tracks** for the same thing:

| | Vehicle Hub (DOT card) | Everywhere else (Binder, Compliance, Operator upload) |
|---|---|---|
| Table | `truck_dot_inspections` | `inspection_documents` ("Periodic DOT Inspections") |
| Data | inspection date, interval, inspector, location, result, file, **auto-computed `next_due_date`** | only file + `expires_at` |
| Cron alerts | not checked | yes (`check-inspection-expiry`) |
| Currently used? | **0 rows** — feature is unused | populated by every operator upload + the Inspection Binder |

The Vehicle Hub is the richer record but disconnected. We'll make `truck_dot_inspections` the single source of truth and keep the Binder/Compliance views as read-views into the same data.

### What syncs

**One write → three places visible**

When a Vehicle Hub DOT inspection is added (new or via "Add DOT Inspection" card):
1. **Vehicle Hub** — countdown card + history (already works).
2. **Operator's Inspection Binder** — upserts the per-driver "Periodic DOT Inspections" row with the same file + `expires_at = next_due_date`.
3. **Compliance Summary** — picks it up automatically because it reads `inspection_documents`.

And the reverse — when an operator (or staff) uploads a Periodic DOT Inspection from the operator portal / Inspection Binder, we also create a matching `truck_dot_inspections` record so the Vehicle Hub countdown stays accurate.

### Reminder interval changes

- The "Add DOT Inspection" card stays exactly as it is. `reminder_interval` (90/180/270/360) keeps driving `next_due_date` via the existing DB trigger.
- **New: fleet-wide default interval.** In Vehicle Hub header, add a small **"Set fleet-wide reminder interval"** button. Picks one of the same four options and stores it in a new `fleet_settings` row (`default_dot_reminder_interval_days`). Used as the pre-selected default in the Add DOT modal — staff can still override per truck.
- **New: bulk-apply.** Same dialog gets an *"Apply this interval to every truck's most recent DOT inspection"* checkbox. Recomputes `next_due_date` for the latest record per operator.
- Operator-uploaded inspections (which have no interval picker) use the fleet-wide default to compute `next_due_date`.

### Suggestions added

1. **"Source" badge on the Binder row** — small chip showing whether the latest Periodic DOT entry came from `Vehicle Hub` (full record) or `Operator upload` (file only). Helps staff know when to enrich the record from Vehicle Hub.
2. **One-click "Open in Vehicle Hub"** link on the Compliance Summary's DOT row — jumps directly to the Vehicle Hub drawer for that operator.
3. **30-day pre-alert in the cron** — `check-inspection-expiry` already alerts at ≤30 days for other docs but DOT is excluded from `ALERT_DOCS`. Add `"Periodic DOT Inspections"` so it sends operator + assigned-staff reminders the same way.
4. **Auto-archive old DOT files** — when a new Vehicle Hub inspection replaces an older binder entry, keep the prior file viewable in the Vehicle Hub history (already happens) but stop showing it as "current" in the Binder.

### Technical changes

**DB migration**
- New table `fleet_settings` (single row) with `default_dot_reminder_interval_days int default 360`. RLS: staff read, management write.
- Trigger `sync_dot_to_inspection_documents` on `truck_dot_inspections` (AFTER INSERT/UPDATE): upserts the per-driver `inspection_documents` row keyed by `(driver_id = operator.user_id, name = 'Periodic DOT Inspections')` with `expires_at = NEW.next_due_date`, `file_path/url` from the certificate.
- Trigger `sync_inspection_doc_to_dot` on `inspection_documents` (AFTER INSERT) where `name = 'Periodic DOT Inspections'` and not just synced from above (use a session GUC guard to avoid loops): inserts a minimal `truck_dot_inspections` row with `inspection_date = today`, `reminder_interval = fleet_settings.default`, `result = 'pass'`, file fields populated.
- Add `"Periodic DOT Inspections"` to the cron's `ALERT_DOCS` set in `check-inspection-expiry`.

**Frontend**
- `DOTInspectionModal.tsx` — read fleet default from `fleet_settings` to pre-select interval; add the "Apply to fleet" checkbox.
- `FleetRoster.tsx` — add header button "Fleet Reminder Interval" opening a small dialog that updates `fleet_settings`.
- `OperatorDocumentUpload.tsx` — when `slot.key === 'truck_inspection'` is uploaded, the new DB trigger handles the Vehicle Hub side automatically; no client change needed beyond what's already there.
- `InspectionComplianceSummary.tsx` / `DocRow` — small "Open in Vehicle Hub" link + source chip on the DOT row.

### Out of scope

- Truck-down banner, ICA/Lease Termination workflow, Compliance dashboard for non-DOT docs.
- Replacing the `inspection_documents` per-driver row model — we keep it for Binder display.
- Per-truck (multi-truck-per-operator) DOT records — current model is one truck per operator.

