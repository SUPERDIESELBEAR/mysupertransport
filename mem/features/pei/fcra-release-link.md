---
name: PEI FCRA Release Link
description: Tokenized public viewer that lets the previous employer view the applicant's signed Fair Credit Reporting Act authorization from the PEI emails.
type: feature
---
# PEI FCRA Release Link

## What it does
Each PEI email (`pei-request-initial`, `pei-request-follow-up`, `pei-request-final-notice`) includes a secondary CTA "View the signed FCRA authorization" that opens `/pei/release/:token`, where `token` is the SAME `pei_requests.response_token` used for `/pei/respond/:token`.

## How
- Page: `src/pages/PEIRelease.tsx` renders `FCRAAuthorizationDoc` with a Print/Save-as-PDF action.
- Data: edge function `pei-release-fcra` (verify_jwt = false, default). POST `{ token }`. Validates UUID, looks up `pei_requests` by `response_token`, blocks if status is `revoked`, fetches the application's signature from the private `signatures` bucket via service role, returns base64 data URL plus minimal applicant fields (no raw signature URL ever leaves the edge).
- `sendPEIEmail.ts` builds `releaseUrl = ${safeOrigin}/pei/release/${response_token}` and passes it via `templateData`.
- `_pei-shared.ts` exposes `releaseUrl?: string` on `PEIEmailProps` and a `secondaryButton` outline style.
- `PEIRespond.tsx` shows the same release link inline so the responder can verify authority before answering.

## Audit
Every successful release view inserts an `audit_log` row with `action = 'pei_release_viewed'`, `entity_type = 'pei_request'`, `entity_id = pei_request.id`, and metadata `{ application_id, employer_name, ip, user_agent }`. Failure to log is non-fatal.

## Why no PDF attachment
Lovable transactional email infrastructure does not support attachments, and corporate spam filters strip unknown-sender attachments. A tokenized link matches what carriers like HireRight/Tenstreet do.
