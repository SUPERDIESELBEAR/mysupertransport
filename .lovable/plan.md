

## Lease Termination Appendix C — sign with your Carrier Signature, send to insurance

Build a one-sided **Lease Termination (Appendix C)** that you sign with your saved Carrier Signature, then email to the insurance company along with the operator's driver's license — same recipient list as the Stage 6 insurance request, always CC'd to **marc@mysupertranport.com**.

### What you'll see

**1. New "Generate Lease Termination" button on the Operator Detail Panel**

Inside the existing ICA section (right next to "View ICA"), a new button: **🗎 Generate Lease Termination**. Visible only to owner/management. Clicking opens the **Lease Termination Builder** modal.

**2. Lease Termination Builder modal**

```text
┌─ Lease Termination — Appendix C ─────────────────────┐
│ Driver:       Bobby Thompson                          │
│ Truck:        2019 Freightliner Cascadia · VIN ...    │
│ Original ICA: Signed Mar 12, 2026                     │
│                                                       │
│ Effective termination date: [2026-04-23] (today)      │
│ Reason (internal, not on doc):                        │
│   [▾ Voluntary separation │ Mutual release │ Cause ] │
│ Notes for insurance (optional):                       │
│   [ textarea ... ]                                    │
│                                                       │
│ Carrier signature:  [✓ Marc Mueller, Owner]           │
│   (uses your saved Carrier Signature)                 │
│                                                       │
│        [ Preview ]   [ Cancel ]   [ Sign & Save ]    │
└───────────────────────────────────────────────────────┘
```

- **Effective date** defaults to today, editable.
- Auto-pulls truck/owner data from the active `ica_contracts` row.
- Carrier signature, name, and title come from `carrier_signature_settings` — same pipeline as ICAs. If no carrier signature is saved, button is disabled with tooltip "Save a Carrier Signature first".
- "Sign & Save" stamps the document, writes a record, and immediately reveals the **Send to Insurance** action.

**3. Lease Termination document (Appendix C)**

A clean, branded one-pager rendered from a new `LeaseTerminationDocumentView` component (mirrors `ICADocumentView` styling):

- SUPERTRANSPORT header
- "**APPENDIX C — LEASE TERMINATION**" title
- Body:
  > *Pursuant to Section 10 (Termination) of the Independent Contractor Agreement dated **{lease_effective_date}** between SUPERTRANSPORT, LLC ("Carrier") and **{contractor label}** ("Contractor"), Carrier hereby provides notice that the equipment lease for the unit described below is terminated effective **{effective_date}**. All rights, duties, and obligations under the Agreement and Appendix A cease as of that date, except those that survive by their terms (Sections 8 Set-Off, 9 Confidentiality & Non-Solicitation, and 12 Dispute Resolution).*
- Equipment block: Year/Make/VIN/Plate/Trailer (read-only, from the ICA)
- Carrier signature block (your image + typed name + title + signed date)
- Optional "Contractor Acknowledgment" block — **rendered blank with signature line** by default (carrier-only mode). A future toggle will enable in-portal countersign without changing the document layout.

**4. "Send to Insurance" action (after signing)**

Right under the just-signed termination, a gold button: **📧 Send Termination Notice to Insurance**.

- Sends an email to the same recipients configured in **Stage 6 Insurance Settings** (`insurance_email_settings.recipient_emails`).
- **CC: `marc@mysupertranport.com`** every time (hardcoded).
- Subject: `Lease Termination Notice — {Driver Name} — Unit {unit}`.
- Body: branded HTML with driver name, unit number, VIN, effective termination date, and your optional notes.
- **Attachments**: the signed Appendix C as PDF + the operator's driver's license image (same fetch logic as `send-insurance-request` — checks `applications.dl_front_url` then falls back to `operator_documents` of type `drivers_license`). DL larger than 4MB falls back to a 7-day signed URL in the email body, same pattern as today.
- After send: success toast "Termination sent to 2 recipients (CC: marc@mysupertranport.com)", and the record is marked `insurance_notified_at = now()`.

**5. New "Terminations" page in the Management portal**

A standalone view at `/management?view=terminations` (also linked from Staff portal sidebar for record keeping):

```text
┌─ Lease Terminations ─────────────────────────────────────────┐
│ [Search…]  [Year ▾]  [Reason ▾]                             │
│                                                              │
│ Driver            Unit  Effective    Signed By  Insurance   │
│ Bobby Thompson    412   Apr 23 2026  Marc M.    ✓ Apr 23   │
│ Larry Bazin       408   Mar 30 2026  Marc M.    ✓ Mar 30   │
│ Demetrius S-L     402   Feb 14 2026  Marc M.    — not sent │
│   ▸ row click → opens viewer + "Resend to insurance" button │
└──────────────────────────────────────────────────────────────┘
```

Each row opens a viewer modal showing the signed PDF, a "Download PDF" button, and "Resend to insurance" (re-attaches DL fresh in case it was updated).

### How it works (technical)

**Database — one migration**

```sql
CREATE TABLE public.lease_terminations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id              uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  ica_contract_id          uuid REFERENCES public.ica_contracts(id),
  effective_date           date NOT NULL,
  reason                   text NOT NULL CHECK (reason IN ('voluntary','mutual','cause')),
  notes                    text,
  -- Snapshot of equipment + parties at time of signing
  truck_year               text,
  truck_make               text,
  truck_vin                text,
  truck_plate              text,
  truck_plate_state        text,
  trailer_number           text,
  contractor_label         text,
  -- Carrier signature
  carrier_signed_by        uuid REFERENCES auth.users(id),
  carrier_typed_name       text,
  carrier_title            text,
  carrier_signature_url    text,
  carrier_signed_at        timestamptz NOT NULL DEFAULT now(),
  -- Reserved for optional contractor countersign (Phase 2)
  contractor_typed_name    text,
  contractor_signature_url text,
  contractor_signed_at     timestamptz,
  -- PDF storage + insurance tracking
  pdf_url                  text,
  insurance_notified_at    timestamptz,
  insurance_recipients     text[],
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.lease_terminations (operator_id);
CREATE INDEX ON public.lease_terminations (effective_date DESC);

ALTER TABLE public.lease_terminations ENABLE ROW LEVEL SECURITY;

-- Staff full access
CREATE POLICY "Staff manage lease terminations" ON public.lease_terminations
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Operators can view their own (for future portal exposure)
CREATE POLICY "Operators view own terminations" ON public.lease_terminations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.operators
            WHERE id = lease_terminations.operator_id AND user_id = auth.uid())
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lease_terminations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**Storage** — reuse existing `operator-documents` bucket under prefix `lease-terminations/{operator_id}/{termination_id}.pdf`. RLS already covers staff + owning operator.

**Frontend — new files**

```text
src/components/ica/LeaseTerminationDocumentView.tsx     [NEW — single-page Appendix C, mirrors ICADocumentView]
src/components/ica/LeaseTerminationBuilderModal.tsx     [NEW — builder w/ effective date, reason, notes, sign & save]
src/components/ica/LeaseTerminationViewModal.tsx        [NEW — read-only viewer + Send/Resend insurance button]
src/pages/management/TerminationsView.tsx               [NEW — list + filter; embedded in ManagementPortal]
```

**Frontend — small edits**

```text
src/pages/staff/OperatorDetailPanel.tsx
  • Add "Generate Lease Termination" button in ICA section
  • Render LeaseTerminationBuilderModal / ViewModal on demand

src/pages/management/ManagementPortal.tsx
  • Add 'terminations' to view router + sidebar nav item

src/integrations/supabase/types.ts                       [auto-regen]
```

**PDF generation** — use the existing browser print pipeline (`src/lib/printDocument.ts` already used for ICAs) to render `LeaseTerminationDocumentView` to PDF, then upload the blob to `operator-documents/lease-terminations/...` and store the path in `lease_terminations.pdf_url`. No external PDF library needed.

**Edge function — `send-lease-termination`**

```text
supabase/functions/send-lease-termination/index.ts       [NEW]
```

Modeled directly on `send-insurance-request`:

1. Auth check (Bearer token → `getClaims` → require owner/management role via `user_roles.limit(1)`).
2. Input: `{ termination_id }`. Loads termination + operator + driver name + DL path (applications.dl_front_url, fallback operator_documents).
3. Downloads the signed PDF from `operator-documents` and the DL image (same 4MB attachment / 7-day signed URL fallback as the insurance function).
4. Recipients = `insurance_email_settings.recipient_emails`. **CC always = `['marc@mysupertranport.com']`** (hardcoded constant at top of file).
5. Sends via Resend with branded HTML matching the existing `emailHeader/emailFooter` shared layout.
6. On success: `UPDATE lease_terminations SET insurance_notified_at = now(), insurance_recipients = recipients`.
7. Writes `audit_log` entry `action='lease_termination_sent'` with metadata `{ recipients, cc, effective_date, vin, reason }`.

CORS + JSON envelopes match the existing `send-insurance-request` patterns exactly.

**Audit log** — two new actions: `lease_termination_signed` (on Sign & Save) and `lease_termination_sent` (on insurance email).

**Memory** — new `mem/features/lease-termination/workflow.md` documenting the carrier-only signing flow, the hardcoded CC, the DL attachment fallback, and the Phase 2 hook for optional contractor countersign.

### Out of scope (Phase 1)

- Operator countersign in-portal — schema and UI placeholders are in place; flipping it on is a small Phase 2 follow-up.
- Auto-generate on Deactivate — kept manual per your decision.
- Bulk termination tool — per-operator only.
- Editing a termination after it's signed — locked; you'd void & generate a new one (we can add a "Void" flow later if needed).
- Driver-side notification when termination is signed.

### What you'll do after deploy

1. Open the operator's panel → click **Generate Lease Termination**.
2. Confirm date + pick reason → **Sign & Save** (your Carrier Signature is auto-applied).
3. Click **Send Termination Notice to Insurance** → email goes to your insurance recipients with you on CC, with the signed Appendix C and the operator's DL attached.
4. Anytime later, open **Management → Terminations** to see the full history or resend.

