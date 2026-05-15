# Including the Signed FCRA Authorization in PEI Emails

## Recommendation

**Don't attach the PDF to the email.** Two reasons:

1. Lovable's transactional email infrastructure does not support file attachments — emails are HTML/text only.
2. Even if it did, attachments to unknown corporate inboxes get stripped by spam filters, blocked by Mimecast/Proofpoint, or quarantined. Previous-employer safety departments are exactly the kind of recipient that distrusts attachments from senders they don't recognize.

**Instead, give the recipient a tokenized "View signed release" link** that opens the FCRA authorization PDF in their browser. This is the same pattern carriers like HireRight and Tenstreet use, and it's how we already deliver the PEI response form itself (`/pei/respond/:token`).

## How it fits the current flow

We already have the right primitives:
- Each `pei_requests` row has a unique `response_token` used to gate the response page.
- The FCRA authorization is captured during the application (Step 8 disclosures) and is one of the standalone documents we can render as a PDF.
- `sendPEIEmail.ts` already builds a `responseUrl` from `response_token` and passes `templateData` into the React Email template.

So the work is small and additive:

1. **Generate / locate the signed FCRA PDF per applicant.** Either (a) reuse the existing standalone-letter PDF generator to produce an FCRA Authorization PDF on demand and stash it in Supabase Storage under the application, or (b) generate it lazily the first time it's requested. Filename: `fcra-authorization-{applicationId}.pdf`.

2. **Add a tokenized release-viewer route**, e.g. `GET /pei/release/:token`. It uses the same `pei_requests.response_token` lookup the response page already uses, then returns a short-lived signed URL (or streams the PDF) for the FCRA document tied to that application. Same audit footprint as the response page (we can log views into a `pei_release_views` table or reuse existing audit_log).

3. **Add a "View signed release" button + line of trust copy to all three PEI templates** (`pei-request-initial`, `pei-request-follow-up`, `pei-request-final-notice`) and `_pei-shared.ts`. Place it near the existing "Complete the investigation →" button. Pass `releaseUrl` through `templateData` from `sendPEIEmail.ts`.

4. **Mirror it on the response page itself** (`PEIRespond.tsx`) so a recipient who clicked through to fill the form can re-download the release inline before answering — this is what most safety managers actually want before they certify anything.

## Email copy (suggested)

Just under the existing release sentence:

> The applicant has signed a Fair Credit Reporting Act (FCRA) release authorizing you to share this employment information with SUPERTRANSPORT.
>
> [📄 View the signed FCRA authorization]  ← tokenized link

And in the response page, a small panel:

> **Signed authorization on file** — James Whitaker signed an FCRA release on 03/14/2026. [Download PDF]

## Technical notes

- Token reuse: the existing `response_token` on `pei_requests` is already single-purpose and unguessable; reusing it for the release viewer keeps things simple and means revoking access (e.g. on a rescinded application) revokes both at once.
- Storage: bucket should be private; serve via short-lived signed URL minted server-side in the route handler, never embed a raw storage URL in the email.
- Audit: log every release view with `pei_request_id`, `viewed_at`, `ip`, `user_agent` so we can prove disclosure scope if a previous employer ever questions authority.
- No attachment paths, no SMTP changes, no new edge function for sending — only template + sendPEIEmail.ts + a small viewer route + PDF generation.

## Out of scope for this plan

- Bulk re-sending old PEI requests with the new link.
- Adding the same pattern to the drug/alcohol §40.25 release (similar idea, separate doc — easy follow-up).
