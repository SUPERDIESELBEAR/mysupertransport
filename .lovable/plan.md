# Sync Form 2290 and Vehicle Registration from Onboarding to Vehicle Hub

Today a driver's Form 2290 uploaded in onboarding never reaches the Vehicle Hub, and Vehicle Registration only half-reaches it. Staff re-upload the same files a second time. This makes one upload flow to every place the document is needed.

## Current behavior (verified)

- Form 2290: driver upload lands in `operator_documents`; when staff mark it Received a trigger copies it into the driver's document vault only. Nothing is written to `inspection_documents`, which is what Vehicle Hub, the roadside binder, and Fleet Compliance read. 82 onboarding uploads vs 37 Vehicle Hub rows.
- Vehicle Registration: the driver slot only appears when `registration_status = own_registration`, and on upload it does insert a binder row — but with no expiration date and with a `file_path` pointing at the `operator-documents` bucket while the Vehicle Hub drawer signs against `inspection-documents`. Only 2 of 77 registration binder rows came from that path; the rest were re-uploaded by staff.

## What will change

**1. One reliable sync for both document types**

When a driver (or staff, on their behalf) uploads Form 2290 or Vehicle Registration in onboarding, a matching row is created or updated in the driver's Vehicle Hub / binder record under the existing names `Form 2290` and `IRP Registration (cab card)`.

- Copies the file into the correct storage bucket so previews and roadside sharing work, instead of cross-referencing a bucket the viewer can't sign.
- Updates the driver's existing row for that document type rather than stacking duplicates; the previous file is replaced, not lost.
- Fires on every upload path, including a staff replacement of a blurry file.

**2. Pending-review marking**

Synced documents appear in Vehicle Hub right away, tagged **Pending review**. The tag clears automatically when staff mark the matching Stage 2 item as Received. Pending documents are excluded from roadside binder sharing until reviewed, so an unverified file never goes out to an officer.

**3. Expiration dates stay a staff step**

Synced documents arrive with no expiration date and show a **Needs expiration date** prompt in the Vehicle Hub Registration / 2290 section, editable inline through the existing edit modal. They will not count as expired or raise false alarms in Fleet Compliance while the date is blank.

**4. Backfill existing drivers**

A one-time pass creates Vehicle Hub records for every current driver who has an onboarding-uploaded 2290 or registration but no matching Vehicle Hub row, skipping anyone who already has one. Backfilled rows carry no expiration date and are marked as needing one. Demo and deactivated accounts are excluded.

**5. Where it shows**

In the existing **Registration / 2290** section of the vehicle detail drawer, alongside staff-uploaded records, with the same view / update / delete actions. No change to the vehicle card itself.

## Technical notes

- Add `pending_review boolean not null default false` and a `source` marker to `inspection_documents` so synced-vs-staff-uploaded rows are distinguishable; update the binder-share query and `get_share_bundle_meta` to exclude `pending_review = true`.
- Move the sync out of `OperatorDocumentUpload.tsx` into a `sync-onboarding-doc-to-binder` edge function (service role) so it runs identically for driver uploads, staff replacements, and the backfill, and can copy the object between the `operator-documents` and `inspection-documents` buckets.
- Clear `pending_review` from the existing `copy_stage2_docs_to_vault` trigger path when `form_2290` / registration transitions to `received`.
- `FleetDetailDrawer.tsx`: render the Pending review and Needs expiration date states in the Registration / 2290 list; keep the existing signed-URL preview path.
- `InspectionComplianceSummary.tsx`: treat a null `expires_at` on these two doc keys as "date needed", not expired.
- Backfill runs as a one-time invocation of the same edge function over eligible operators, not as SQL in a migration.
