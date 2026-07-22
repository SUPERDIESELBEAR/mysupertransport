
## Problem

The current signing page and generated PDF contain only form fields (name, DOB, relationship, signatures). The actual **Passenger Authorization and Release of Liability** legal text (49 CFR §392.60, sections 1–7) was never included, so the driver was never prompted to read anything and the filed PDF is only a one-page summary.

## Fix

### 1. Shared authorization content module
Create `src/lib/passengerAuthContent.ts` exporting the full authorization body (all 7 sections verbatim from the uploaded PDF) as structured data (headings + paragraphs + bullets), so the on-screen viewer and the PDF generator render the same source of truth.

### 2. Signing page — `src/pages/PassengerAuthSign.tsx`
- **Read the Authorization** panel above the form renders the full document body in a scrollable styled box (matching the Handbook/DocumentViewer look).
- **"I have read and agree to the Passenger Authorization" checkbox** below the panel. Required. The Sign & Submit button stays disabled until it is checked. Timestamp of confirmation is captured and persisted.
- New trip fields the paper form requires:
  - Passenger Age
  - Transportation Begins At (City, State)
  - Transportation Ends At (City, State)
  - Passenger initials (and Parent/Guardian initials when under 18) for the Section 4 acknowledgment
- **Effective date**: defaults to today (unchanged).
- **Expiration date**: auto-filled to **exactly one year after the effective date**, recomputed whenever the effective date changes. Field is read-only (with a small helper: "Automatically set to one year from the effective date"). Value is sent to the backend and stamped in the PDF.
- Keep the existing waiver logic (Minor Child auto-waives passenger signature; "Passenger not present" toggle + reason).

### 3. PDF generator — `buildPdf` in the same file
Rewrite to produce a multi-page PDF that mirrors the source document:
- Page 1+: Header ("SUPERTRANSPORT — Passenger Authorization and Release of Liability, Issued Under 49 CFR §392.60") then all 7 sections rendered as wrapped paragraphs/bullets with automatic page breaks (`doc.splitTextToSize` + y-overflow → `doc.addPage()`).
- Filled fields (Passenger Name, Age, Contractor, Unit, Cities, Effective, **Expires**) inserted into Section 1.
- Passenger/Parent initials stamped into Section 4.
- Contractor read-and-agree acknowledgment stamped near the signature block: "Contractor confirmed reading of the Passenger Authorization on {date/time}".
- Final Signatures page: contractor sig + typed name + date; passenger sig OR "PASSENGER SIGNATURE WAIVED — Reason: …" OR "MINOR PASSENGER — parent/guardian signature captured above"; carrier rep signature block populated from `carrier_signature_settings`.
- Footer on each page: "SUPERTRANSPORT | positive. thinking. transport. | www.mysupertransport.com | (833) 337-8737".

### 4. Backend — `supabase/functions/finalize-passenger-auth/index.ts`
- Accept and persist: `passenger_age`, `origin_city_state`, `destination_city_state`, `expires_at`, `passenger_initials`, `parent_initials`, `contractor_read_acknowledged_at`.
- Validation: require age, origin, destination, passenger initials, and `contractor_read_acknowledged_at`. `expires_at` is derived server-side as `effective_date + 1 year` (client value ignored/overridden as a safety net).

### 5. Database
One migration adding the new columns to `passenger_authorizations`:
- `passenger_age int`
- `origin_city_state text`
- `destination_city_state text`
- `expires_at date`
- `passenger_initials text`
- `parent_initials text`
- `contractor_read_acknowledged_at timestamptz`

No RLS changes; existing policies still apply.

### 6. Staff send modal — `SendPassengerAuthModal.tsx`
No changes; staff still supplies only Driver Name, Unit, Email. Trip-specific fields are captured on the signing page.

### 7. Deploy
Deploy `finalize-passenger-auth` after the code + migration.

## Out of scope

- Backfilling Marcus's already-filed short-version PDF. Say the word and I'll regenerate it once the new flow is live.

## Technical notes

- `jspdf` `splitTextToSize` + a small `writeParagraph(text, opts)` helper handles wrapping and page breaks cleanly.
- Full body text (~1,100 words) lives in one exported constant so legal edits are a single-file change.
- Expiration compute: parse the effective date at local noon (per project date-parsing rule), add 1 year, format back as `YYYY-MM-DD`. Handles Feb 29 by rolling to Feb 28.
- Read-agree checkbox stores confirmation `timestamptz` at click time and is included in the submit payload.
