
# Omit Passenger Signature — Plan

Combine approach **E (relationship-based auto-omit)** with **A (contractor-controlled "not present" toggle)**. The contractor decides at signing time. The final PDF stamps the waiver reason in the passenger signature block so the record is unambiguous.

## User experience (PassengerAuthSign page)

1. Add a **Passenger relationship** dropdown at the top of the signing form:
   - Spouse
   - Minor Child
   - Adult Family Member
   - Other Authorized Rider
2. When **Minor Child** is selected, the passenger signature pad is automatically hidden and replaced with a notice: *"Passenger is a minor — parent/guardian signature (contractor) is sufficient."* The contractor's signature is required as usual.
3. For every other relationship, add a checkbox below the passenger signature pad:
   - **"Passenger is not with me at the time of signing"**
   - When checked, the passenger signature pad hides and a required **Reason** textarea appears (short — e.g., "Spouse joining on Monday", "Rider boarding at next stop"). Default placeholder suggestions provided.
4. Contractor signature remains required in all cases. Submit is disabled until either (passenger signed) OR (waiver reason provided) OR (minor selected).

## Data model

Extend `passenger_authorizations` with three columns:
- `passenger_relationship text` (nullable — 'spouse' | 'minor_child' | 'adult_family' | 'other')
- `passenger_signature_waived boolean not null default false`
- `passenger_waiver_reason text` (nullable — free text; required when waived is true, or auto-set to "Minor child — parent/guardian signature on file" when relationship = minor_child)

RLS unchanged — the finalize edge function writes these via service role.

## Edge function changes (`finalize-passenger-auth`)

- Accept the three new fields in the request body (validate with Zod).
- If `passenger_signature_waived` is true, `passenger_waiver_reason` must be a non-empty string.
- Skip requiring `passenger_signature_url` when waived or when relationship = minor_child.
- Persist the new fields on the row.

## PDF rendering

In the PDF generation step (`jsPDF` inside `finalize-passenger-auth`):
- If passenger signed → render passenger signature image as today.
- If waived (adult) → replace the signature line with a boxed stamp:
  > **PASSENGER SIGNATURE WAIVED**
  > Reason: *{waiver_reason}*
  > Contractor attested at signing on {date}
- If minor child → replace the passenger signature line with:
  > **MINOR PASSENGER**
  > Parent/guardian signature captured above (contractor).
- Add a small footer note on the signature page: *"Executed via SUPERDRIVE — {timestamp} — IP {ip}"* (already present; keep).

## Management/Driver Hub display

- Filed PDF path is unchanged; nothing to update in the Driver Hub viewer.
- In `SendPassengerAuthModal` / staff-facing list, show a small badge next to completed rows: **"Passenger signed"**, **"Waived — {relationship}"**, or **"Minor"** so staff can see at a glance which records used the waiver.

## Files to touch

- `supabase/migrations/…` — add three columns to `passenger_authorizations`.
- `supabase/functions/finalize-passenger-auth/index.ts` — accept + validate new fields, adjust PDF rendering, persist row.
- `src/pages/PassengerAuthSign.tsx` — relationship dropdown, waiver checkbox + reason field, conditional signature pad, submit gating, pass new fields to finalize.
- `src/components/documents/SendPassengerAuthModal.tsx` (or the staff list that shows completed auths) — status badge for waived/minor.

## Out of scope

- No two-step passenger-signs-later flow (option B/C).
- No staff-side waiver override (option D). Only the contractor can waive at signing time.
- Existing completed records untouched — new fields default to null/false.
