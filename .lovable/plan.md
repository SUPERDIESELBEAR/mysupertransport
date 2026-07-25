# Email Edge-Function Hardening Pass

Goal: turn the recent OSAS lessons into durable guardrails so the next email feature can't repeat the same mistakes (bad links, role drift, opaque errors, hand-rolled CORS).

## What we'll change

### 1. Centralize app URL building
- Re-export `buildAppUrl` from `supabase/functions/_shared/email/index.ts` so any function importing email helpers gets it automatically.
- Audit every edge function that constructs a user-facing link. Replace hand-rolled URLs (`SITE_URL` constants, hard-coded `mysupertransport.lovable.app`, string concatenation with `SUPABASE_URL`, etc.) with `buildAppUrl('/path')`.
- Confirmed offenders to fix:
  - `send-passenger-auth` (`const SITE_URL = ...`)
  - `send-insurance-request`, `send-dot-consultant-request`, `send-return-receipt-pdf`, `send-lease-termination`, `send-deactivation-notice`, `send-operator-broadcast`, `send-notification`, `send-test-email`, `resend-invite`, `launch-superdrive-invite`, `invite-staff`, `notify-onboarding-update`, `notify-upload-attention`, `pei-auto-cadence`, `auth-email-hook` — each will be spot-checked and moved to `buildAppUrl` where it builds a link that appears in an email.
- Non-email URL builders (`download-qpassport`, `_shared/qpassport-link.ts`) left alone unless they emit links into emails.

### 2. Finish the shared-helpers migration
Migrate remaining staff-triggered email functions to the `_shared/email/` helpers (`requireStaff`, `withErrorEnvelope`, `ok`/`fail`, `sendTemplateEmail` / `sendResendDirect`):
- `send-passenger-auth`
- `send-resource-email`
- `send-release-note`
- `send-payroll-docs`
- `send-cert-reminder`
- `send-operator-broadcast`
- `notify-upload-attention`, `notify-onboarding-update`, `notify-pay-setup-submitted`, `notify-document-update`, `notify-new-message` (staff/system notifiers that still hand-roll auth or CORS)

Each migration: replace ad-hoc CORS + JSON responses with `withErrorEnvelope` + `ok`/`fail`, replace role checks with `requireStaff`, and route sends through `sendTemplateEmail` (queued) unless the function has a specific reason to bypass the queue.

### 3. Guardrails against the specific bugs we just hit
- **Role enum drift** (`admin` bug): add a startup-time assertion in `_shared/email/auth.ts` that logs a warning if `DEFAULT_STAFF_ROLES` contains an unknown role. Document the valid `app_role` values in a comment next to the type.
- **Marketing-host links**: `buildAppUrl` already rejects the marketing domain; add a unit-style self-test log line the first time it's called with a rejection so misconfiguration is visible in function logs.
- **Opaque frontend errors**: sweep frontend call sites that invoke edge functions and confirm they use `getEdgeFunctionErrorMessage` (already used in OSAS). Fix any that still show generic "non-2xx" toasts.

### 4. Documentation
- Add a short `supabase/functions/_shared/email/README.md` describing the canonical pattern (import from barrel, use `requireStaff`, `buildAppUrl`, `sendTemplateEmail`, wrap with `withErrorEnvelope`) with a minimal template.

## Out of scope
- No changes to email templates, queue infrastructure, or `process-email-queue`.
- No changes to auth-email-hook internals beyond swapping any hand-rolled URL for `buildAppUrl`.
- No product/UX behavior changes — pure hardening/refactor.

## Verification
- After each function migration: deploy and, for the staff-triggered ones, trigger a real send from the UI (OSAS-style smoke test) and confirm the email arrives with a working in-app link.
- `tsgo` typecheck across `supabase/functions/` after the sweep.

## Rollout order
1. Barrel export + README (safe, no behavior change).
2. URL audit + `buildAppUrl` swaps (one commit per function).
3. Helper migration for remaining functions (grouped by risk: notifiers first, then staff-triggered senders).
4. Guardrail assertions.

Estimated size: ~15 files touched, no schema changes, no template changes.
