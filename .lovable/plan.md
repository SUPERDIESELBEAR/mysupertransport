# Reimbursement pay class — Phase 1 (Module 2)

## Buildability report (asked for before building)

Phase 1 can be built without touching settlement or invoicing logic. Confirmed by reading the code:

- No settlement engine exists yet — there are no settlement tables and nothing computes driver pay. `payTreatment()` in `src/lib/payTreatment.ts` is display-only, and it already returns a descriptor union that includes an `at_cost` kind, so a non-percentage class needs no special casing at the call site.
- `lumper_reimbursement_pct` stays on `pay_policies`. Nothing is removed this pass.
- No invoicing code exists, so the Phase 3 review gate is untouched.

One gap worth naming: **Load Detail does not display charges at all today** (`RateDetailsCard` renders rates only; charges live in `load_charges` and are edited through the load form). Phase 1 therefore has to add a Charges card to Load Detail — that is where the unconfirmed state and the three reimbursement fields belong.

## What gets built

### 1. Pay class on classifications, policy-configurable

Every classification carries a pay class: `revenue` (split at the policy percentage) or `reimbursement` (paid at actual cost). The mapping lives on the pay policy, not in code — a carrier that splits washout as revenue configures it that way.

- New classification `reimbursement` — label "Reimbursement — driver-paid cost" — added to the dropdown.
- `lumper` is mapped to `reimbursement` by the default company policy, not hardcoded.
- `payTreatment()` returns `{ kind: 'at_cost', label: 'reimbursed at cost' }` for any classification whose class is reimbursement, and the existing percentage path otherwise. Call sites render the label unchanged.

### 2. Three fields on the charge

Captured when the classification is a reimbursement, all nullable, none required at classification time:

- `funding_source` — driver or company
- `actual_cost` — what was actually spent
- `proof_document_id` — a load document holding the receipt or Comchek screenshot

All three stay editable until the load is invoiced (same lock the load form already applies to financials).

### 3. Proof document

Reuses `load_documents` with a new document type for reimbursement proof. Missing proof routes through the existing document-exception path — no second mechanism.

### 4. Visible unconfirmed state

A Charges card on Load Detail lists every charge with its pay treatment. A reimbursement missing funding source, actual cost, or proof is flagged incomplete and names exactly which pieces are missing. No blocking — the settlement hold is Phase 2.

### 5. Disclosure at the point of choice

Where funding source is set: driver-funded reimburses the driver at cost; company-funded is company revenue and does not appear on the driver's settlement.

## Technical detail

Database (one migration):

- `pay_policies`: add `charge_pay_classes jsonb not null default` mapping classification key to `revenue`/`reimbursement`, seeded with `lumper` and `reimbursement` as reimbursement, everything else revenue. Backfill existing rows with the same default.
- `load_charges`: add `funding_source text` (check: `driver`/`company`), `actual_cost numeric`, `proof_document_id uuid references public.load_documents(id) on delete set null`, plus an index on `proof_document_id`.
- Enum `load_document_type`: add `reimbursement_proof`.
- In-place edit of `create_load_with_stops` and `update_load_with_stops` to persist the three new charge fields (existing parser/loadout behaviour preserved byte-for-byte otherwise).

Code:

- `src/lib/revisedRateCon.ts` — add `reimbursement` to `ClassificationKey`, `CLASSIFICATION_LABELS`, `CLASSIFICATION_OPTIONS`. `FULL_PAY_CLASSIFICATIONS` keeps meaning "100% percentage class" and loses `lumper`, since lumper's treatment now comes from the class.
- `src/lib/payTreatment.ts` — read `charge_pay_classes` from the policy; return `at_cost` for reimbursement classes.
- `src/pages/dispatch/loadFormSchema.ts` and `src/lib/loadSavePayload.ts` — carry `funding_source`, `actual_cost`, `proof_document_id` through the charge schema and save payload.
- New `src/components/dispatch/loadDetail/LoadChargesCard.tsx` — charge list, treatment label, unconfirmed banner, inline reimbursement editor with the disclosure text; wired into `LoadDetailPage` after Rate Details.
- `src/test/helpers/pgFake.ts` and unit tests extended so the new fields are exercised on **both** the create and revision paths, per the standing reachability rule in `docs/tms-build-status.md`.
- `docs/tms-build-status.md` — record the pay-class model, the Phase 2 and Phase 3 decisions (settlement reads the class, line-level hold via the -A1 mechanism, overage approval, `lumper_reimbursement_pct` removal in Phase 2, invoicing gate in Phase 3) so they are not relitigated.

## Explicitly not in this pass

No change to any pay percentage, no settlement computation, no invoicing, no blocking gates, and `lumper_reimbursement_pct` is left in place.
