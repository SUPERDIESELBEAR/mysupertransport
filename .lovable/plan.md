## Goal

Populate the existing FAQ system with high-quality, hand-authored Q&As covering the core workflows of both portals. Everything lands as **drafts** in the existing FAQ Manager for staff review before publishing.

## Approach: hand-authored from a codebase scan

You asked what's most accurate. **Hand-authoring from a codebase scan is the most accurate.** The AI doc-generator works well when the source is a self-contained PDF, but the portals are living UI — button labels, tab names, gating rules, and status logic only exist in the components. Reading those components directly and writing the Q&As myself avoids the AI hallucinating buttons or flows that don't exist. Trade-off: slower than pure AI, but you spend far less time correcting drafts.

## Coverage

**Core workflows only**, roughly 20-25 per audience. I'll bias toward the tasks staff and drivers actually hit weekly. If, while scanning, I find a workflow that's non-obvious and high-risk (e.g. equipment return receipts, PEI cadence, ICA signing gotchas), I'll add it even if it's outside "core" — those are the ones a FAQ pays back the most. I'll flag any such additions in the summary when I hand off.

## Scope

### Staff (Management Portal) — audience: `staff`, tagged for Staff Help Portal
Topics I'll cover based on the sidebar and existing features:

- Onboarding Pipeline: moving a driver through stages, reverting a revision, propose-changes drawer, courtesy email defaults
- Applications: reviewing a submitted application, PEI tab, add previous employer, auto-cadence behavior
- Driver Hub / Vehicle Hub: editing driver docs, IRP ↔ MO Plate sync behavior
- Fleet Compliance & Compliance Summary: who appears, why a driver is/isn't listed, expiry thresholds
- Dispatch Board: opening a driver binder, daily log
- Onboard Systems (Fuel Cards, ELDs, BestPass): assigning, deactivating, inventory of unassigned
- Equipment Asset Sheet: verified-by-staff toggle, signature gating, return instructions + receipts
- MO Plate Registry: assigning plates, expiry sync
- Document Hub + FAQ Manager: uploading a handbook, generating FAQs from a document, publishing drafts, audience toggle
- Staff Help Portal itself: how to search, how re-verification prompts work
- Release Notes: composing a note, flagging FAQs for re-verification
- Messaging & broadcasts, notifications
- Roles & permissions: who can do what

### Owner-Operator (Driver App) — audience: `owner_operator`
Topics based on `OperatorPortal.tsx` and driver-facing components:

- Installing the PWA (iOS + Android), why install prompts appear
- Signing in, session timeout, forgot password
- Status page: reading progress stages, what "Go Live" means
- Uploading documents: CDL, Med Cert, IRP, truck photos, camera vs file upload
- ICA signing: signature canvas tips, why re-signing is required
- Equipment Asset Sheet: verifying items, signing, what happens if something's missing
- Messages: inbox, notifications tab, viewing full history
- Notifications: opening "View all", tab deep-link behavior
- Truck-down alerts: what the chime means, how to clear
- PEI: what it is, why previous employers get emails
- Compliance timeline: reading expiry warnings
- Returning equipment when leaving: mailing instructions + receipt upload gate
- Viewing binder / documents in-app modal (no more new-tab)
- Where to find the handbook, BOL/POD, other resources

## Delivery

1. Read each portal's entry points and key components to ground every answer in real UI labels and behavior.
2. Draft ~20-25 Q&As per audience as a batch insert into `faq` with `status = 'draft'`, correct `audience`, and useful `tags` for search.
3. Set `source_document = 'hand-authored codebase scan'` and `source_section` to the portal area (e.g. "Onboarding Pipeline", "Driver Status Page") so you can filter and audit them in FAQ Manager.
4. No new UI, no schema changes. Everything reuses the existing FAQ Manager review/publish flow.

## Technical section

- Single migration-free change: SQL insert batch via existing `faq` table.
- Fields per row: `question`, `answer` (markdown), `audience`, `tags[]`, `status='draft'`, `source_document`, `source_section`, `created_by = current staff user or null`.
- Owner-operator rows tagged so they surface in `OperatorResourcesAndFAQ` after staff publish.
- Staff rows tagged so they're searchable in `StaffHelpPortal` full-text search once published.
- No changes to `faq-generate-from-doc` edge function or the AI pipeline.

## What you'll do after I hand off

Open **Management → FAQ Manager**, filter by `source_document = 'hand-authored codebase scan'`, review each draft, edit anything that's off, and click publish. Nothing goes live to drivers or the Staff Help Portal until you publish.
