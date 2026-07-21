
## Overview

Add the SUPERTRANSPORT Passenger Authorization form as a new document type with its own send/sign lifecycle, modeled on the existing ICA flow (staff builder → tokenized email link → driver signs in-app → executed PDF filed to Driver Hub).

## 1. Resource Center (Staff-only template)

- Upload the blank DOCX to a new `company-documents` storage bucket (private).
- Add a **Passenger Authorization** card to the staff-only Company Documents section of the Resource Center with View / Download / **Send to Driver** actions.
- Not shown in the driver-facing Resources & FAQ view.

## 2. Database

New table `passenger_authorizations`:
- `id`, `operator_id`, `contractor_name`, `unit_number`
- `token` (unique, for email link), `status` (`sent` | `signed` | `expired` | `revoked`)
- `carrier_signature_url`, `carrier_signed_at` (auto-filled at send from Carrier Signature Settings)
- Passenger fields (name, age, begin/end city, effective/expires dates)
- Signature fields: `contractor_signature_url`, `contractor_printed_name`, `contractor_signed_at`, `contractor_initials`, `passenger_signature_url`, `passenger_printed_name`, `passenger_signed_at`, `passenger_initials`, `guardian_signature_url`, `guardian_printed_name`, `guardian_signed_at`, `guardian_initials`, `is_minor`
- `executed_pdf_url`, `executed_at`, `sent_by`, `sent_at`, `created_at`
- GRANTs + RLS: staff full access; anon SELECT/UPDATE only via valid token (mirrors ICA pattern); operator can read their own.

New storage buckets: `passenger-auth-signatures` (private), `passenger-auth-executed` (private).

## 3. Staff Send Flow

New modal `SendPassengerAuthModal.tsx` triggered from the Resource Center card and from each driver in Driver Hub:
- Fields: **Contractor / Driver Name** (autocomplete from operators), **Unit No.** (auto-fills from selected operator when available).
- Validates carrier signature exists in `carrier_signature_settings`; if not, blocks and prompts staff to set one.
- Creates `passenger_authorizations` row with token + carrier signature baked in.
- Invokes `send-passenger-auth` edge function → emails driver a link: `https://.../passenger-auth/{token}`.

## 4. Driver Signing Page

New route `/passenger-auth/:token` (public, token-guarded) rendered on both marketing and SUPERDRIVE:
- Renders the full document with the carrier block already signed.
- Driver completes Section 1 (Passenger Name/Age, cities, effective/expires dates) and Section 2+ (initials + Contractor signature).
- If Passenger is under 18: shows Parent/Guardian signature block.
- Passenger signature captured via typed or drawn signature (reuses `SignatureCanvas` from ICA).
- On submit: uploads signature PNGs, generates executed PDF (jsPDF, same pattern as ICA executed PDF), stores in `passenger-auth-executed`, marks `status = 'signed'`.

## 5. Driver Hub Filing

- On signing, insert a row in `driver_documents` (or the appropriate binder table) with `document_type = 'passenger_authorization'`, `file_url` = executed PDF, linked to `operator_id`.
- Appears in Driver Hub → Documents tab alongside ICA/amendments.
- Staff can view a **Passenger Authorizations** history list per driver (sent, signed, expired).

## 6. Edge Functions

- `send-passenger-auth`: validates staff, generates token, sends templated email (uses existing transactional email infra) with signing link.
- `finalize-passenger-auth`: called from driver page on submit; renders executed PDF server-side, files to Driver Hub, marks signed.

## Technical Notes

- Reuses: `SignatureCanvas`, carrier signature settings, transactional email queue, ICA token/RLS pattern, jsPDF executed-doc rendering, `uploadWithAuth` helper.
- Email template: new entry in `_shared/transactional-email-templates/` with subject "Passenger Authorization — Signature Required".
- Token TTL: 30 days; expired links show a friendly "contact staff" message.
- Audit log entries on send, sign, and revoke.

## Out of Scope

- Passenger under-18 identity verification beyond guardian signature.
- Bulk send / multi-driver send in one action.
- Driver-facing template preview in Resources & FAQ.
