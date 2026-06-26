# Unsaved Changes Protection — Staff Dashboard

## What staff will see

**A status pill in the header of every editing page** that tells you, at a glance, where your work stands:

- **Unsaved changes** (gold) — you've typed something but haven't saved
- **Saving…** — being written now
- **All changes saved · 2s ago** — safe to walk away
- **Save failed — Retry** (red) — click to try again
- **Demo mode — changes not saved** — when in demo

**A warning popup when you try to leave with unsaved work** — fires whether you click another menu item, close the drawer, hit the X, swipe back on your phone, or refresh the browser:

> You have unsaved changes.
> [Save & continue]  [Discard changes]  [Keep editing]

Same wording everywhere. Same three buttons everywhere.

**Cmd+S / Ctrl+S saves on every protected page** — and stops the browser's "save this webpage" dialog from hijacking it.

**Quiet auto-save on long-form writing pages** (broadcast emails, FAQs, release notes, document templates, email templates). Saves every ~1.5s after you stop typing, plus a hard flush every 15s. "Send" and "Publish" stay as separate, deliberate clicks — auto-save only protects the draft.

**Multi-tab safety banner** — if the same record is open in two tabs and one saves, the other shows: *"This record was updated in another tab — reload to see latest."*

## Pages covered

**Warning-popup pages (Tier 2):**
- Driver Hub (operator detail panel)
- Applicant Pipeline (application review, propose changes, revert revision)
- PEI Queue (queue panel, GFE modal, response viewer)
- Vehicle Hub (roster, detail drawer, quick edit, DOT inspection, maintenance record)
- Equipment (inventory, item modal, assign, return)
- MO Plate Registry (registry, form, assign)
- Pipeline Config Editor
- Resource Library + Service Library (manager + form modals + help requests)
- ICA / Lease Termination builders
- Carrier Signature Settings
- Staff Directory edit modal, Truck Owner edit
- Inspection Binder admin
- Staff Application modal
- Notification preferences modals (staff + operator)
- Edit Profile, Change Password

**Auto-save pages (Tier 1):**
- Operator Broadcast (already drafts — migrating to the shared pill)
- Email Templates editor
- Release Notes Manager
- FAQ Manager
- Document Editor (TipTap)

**Not touched:** read-only dashboards, queues without inline edits, log panels, document viewers.

## UX rules applied everywhere

1. One dialog, one set of button labels — **Save & continue / Discard changes / Keep editing**.
2. Browser "Leave site?" prompt only attaches **while dirty** — no spurious prompts on clean pages.
3. Route changes (clicking a sidebar link) trigger the same dialog as closing a drawer.
4. Android hardware back / swipe-back composes with the existing `useBackButton` hook so the guard fires on gestures too.
5. Auto-save never writes when a required field is invalid — pill shows *"Waiting to save — fix errors"*.
6. Failed saves keep your dirty state intact — nothing is lost to a transient network error.
7. Nested modals only show one dialog (innermost wins) — no double-warning.
8. Demo mode suppresses auto-save and short-circuits manual save with the existing toast.
9. Optional audit event when a user chooses **Discard** so admins can spot forms with high abandonment.

## Technical structure

- **`src/hooks/useUnsavedChanges.ts`** — single hook powering both tiers. Tracks dirty state, attaches `beforeunload`, exposes a `guard(action)` helper and an `autoSave` mode with debounce + status states (`idle | dirty | saving | saved | error`).
- **`src/components/shared/UnsavedChangesDialog.tsx`** — the one AlertDialog used everywhere.
- **`src/components/shared/UnsavedStatusPill.tsx`** — the status badge, themed with existing tokens, aria-live polite for screen readers.
- React Router `useBlocker` for in-app navigation guards.
- `BroadcastChannel('superdrive:record-saved')` for cross-tab invalidation.
- Migrate `OperatorDetailPanel` and `OperatorBroadcast` first (they already implement custom versions of this) to validate the API, then roll out in batches: Vehicle Hub → Equipment → MO Plates → PEI → Pipeline → content editors → smaller modals.
- Adding protection to a future page is one line: `const { dirty, guard, statusPill } = useUnsavedChanges({ dirty: isDirty, onSave });`

## Out of scope

- Server-side draft persistence for surfaces that don't already have it.
- Real-time collaborative editing / conflict merging — multi-tab handled by warn-and-reload.
- Offline save queueing.
