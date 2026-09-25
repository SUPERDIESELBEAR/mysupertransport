Prompt received complete, ending with: "END OF PROMPT — the first line of your report must say whether you received this prompt complete, ending with this line."

# Alvys M2 pass 3 — paperwork check, SUPERDRIVE invoice look, packet preview

2026-09-25 13:59 UTC. BUILD MODE.

## Decisions
P73–P77 are recorded verbatim in `docs/tms-build-status.md`. P74 supplemental
invoices and P75 payout questions were recorded but deliberately not built.

## Built
- 0070 adds the shared, company-scoped invoice-readiness rule and branding /
  packet settings. BOL or POD satisfies signed delivery paperwork; both are
  packet sources when present. Rate confirmation, conditional lumper receipt,
  per-ton scale ticket, broker billing address, and approved exceptions are
  enforced.
- The same database rule gates `ready_to_invoice` and invoice insertion. 0071
  places the check before invoice-number allocation. 0072 removes client access
  from the private assertion and trigger, while retaining signed-in read access
  to the invoker-mode missing-items function.
- Billing Queue displays the database missing-item list, disables Issue while
  incomplete, and offers a dry-run packet preview. The load invoice card offers
  the same preview.
- Billing Settings supports a private PNG/JPG logo (1 MB), accent color, footer,
  four optional-field switches, invoice preview, and packet include switches.
- `generate-invoice-pdf` renders the new SUPERDRIVE-owned hierarchy and reads the
  private carrier logo. Existing saved PDFs are never replaced.
- `build-invoice-packet` was deployed. It authenticates, verifies staff role and
  company, follows the default factor's combined order/includes, merges PDF and
  PNG/JPG sources, reports unreadable/unsupported files by name, and saves
  nothing.

## Security and live checks
- Definer catalog rerun: 13/13 passed. The trigger and assertion are not callable
  by anon/authenticated; all definer search paths remain pinned.
- Packet and invoice endpoints returned 401 for missing and invalid credentials.
- Live catalog confirms the readiness check appears before number allocation.
- Exact residue after all checks: invoices 1; payments 0; factoring_remittances
  0; invoice_files 0; invoice next_sequence 2. ST26-0001 `updated_at` remains
  `2026-09-17 21:37:10.352836+00`.

## Verification
- Focused pass: 8 files, 61 passed, 1 intentionally skipped because the harness
  cannot execute billing RPCs. The standalone billing rerun passed 10 with the
  same 1 skip.
- Typecheck: `bunx tsgo --noEmit`, exit 0.
- Full suite with `--maxWorkers=2` exceeded the 600-second ceiling. Before the
  kill it exposed stale pre-gate billing fixture expectations and formatting-only
  status-function assertions, plus existing pooler `EAUTHQUERY` failures. The
  pass-focused security, billing settings, paperwork, PDF model and UI tests all
  passed. This report does not claim a green full suite.

## Changed files
`drizzle/migrations/0070_paperwork_invoice_branding.sql`,
`drizzle/migrations/0071_invoice_gate_order_fix.sql`,
`drizzle/migrations/0072_tighten_invoice_readiness_execution.sql`,
`src/integrations/supabase/types.ts`, `src/lib/loadPaperwork.ts`,
`src/lib/__tests__/loadPaperwork.test.ts`, `src/lib/billingRun.ts`,
`src/lib/invoicePdf.ts`, `src/components/billing/PacketPreviewButton.tsx`,
`src/components/billing/LoadInvoiceCard.tsx`,
`src/components/operator/__tests__/driverLoadPaperwork.test.tsx`,
`src/pages/management/BillingQueuePage.tsx`,
`src/pages/management/BillingSettingsPage.tsx`,
`src/test/billing-company-checks.test.ts`, `supabase/config.toml`,
`supabase/functions/_shared/invoice/model.ts`,
`supabase/functions/_shared/invoice/renderPdf.ts`,
`supabase/functions/generate-invoice-pdf/index.ts`,
`supabase/functions/build-invoice-packet/index.ts`, `roadmap.md`,
`docs/tms-build-status.md`, `docs/tms-wish-list.md`, and this report.

END OF PROMPT — the first line of your report must say whether you received this prompt complete, ending with this line.