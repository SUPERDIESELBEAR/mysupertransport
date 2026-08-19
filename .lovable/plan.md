# Load Detail Pass 2A — Status Controls & History Timeline

Extends the existing Load Detail page. Pass 1 sections (summary, rates, stops, notes) stay untouched.

## 1. Status flow configuration

New `src/lib/loadStatusFlow.ts`:
- `FORWARD_SEQUENCE` — available → covered → dispatched → in_transit → at_delivery → delivered → pod_received → accessorials_approved → ready_to_invoice → invoiced → factored → paid → settled → closed
- `getNextStatuses(current)` — next step(s); `invoiced` returns both `factored` and `paid`
- `classifyTransition(from, to)` — `forward` | `backward` | `terminal` | `override` (skip)
- `requiresNote(from, to)` — true for backward, skip, terminal (tonu/cancelled), and any transition into `paid` or `settled`
- `BILLING_STATUSES` — invoiced, factored, paid, settled (management/owner only)

## 2. Header controls

In the header row next to the status badge:
- Primary button(s) for the expected next step(s) ("Mark In Transit"; at `invoiced`: "Mark Factored" + "Mark Paid")
- "Change Status" dropdown listing all statuses (backward moves, skips)
- Destructive "Mark TONU" / "Mark Cancelled" actions

Roles: dispatcher/management/owner get working controls; dispatchers see billing-stage controls rendered but disabled with a tooltip "Billing status changes require management access". Onboarding staff and operators see the badge only.

## 3. Confirmation dialog

New `StatusChangeDialog.tsx`: shows current → new badges, the classification, and a note textarea. When a note is required the confirm button stays disabled until text is entered, with helper text explaining why.

## 4. Server-side enforcement

Migration adding `public.update_load_status(p_load_id uuid, p_new_status load_status, p_note text)`, SECURITY DEFINER, `search_path = public`:
- Role check (dispatcher/management/owner; billing statuses management/owner only) — raises on failure
- Note requirement re-checked server-side — raises on failure
- Updates `loads.status` (existing `log_load_status_change` trigger still fires and writes the history row)
- Immediately after, updates that just-written history row with the note and `change_source = 'manual_ui'` in the same transaction — the trigger is not modified or bypassed
- `REVOKE EXECUTE FROM public, anon; GRANT EXECUTE TO authenticated`

No table structure changes.

## 5. Status history timeline

New `StatusHistoryCard.tsx` + a fetch helper in `src/lib/loadDetail.ts`, newest first. Each row: from→to badges, formatted date/time, changer name (resolved through profiles), change source, and note. Empty state explains no status changes recorded yet.

Notes are hidden for operators (same `isStaff` gate pattern as internal notes). Existing RLS already lets operators read history for their own loads only.

## 6. Refresh

On success invalidate `['load-detail', id]`, `['load-status-history', id]`, and the loads list query; success toast names the new status. On failure use `getDbErrorMessage` / `logDbError`.

## Technical notes

- shadcn components already in the project (Button, DropdownMenu, Dialog, Textarea, Tooltip, Badge)
- Reuses `LoadStatusBadge` and `loadFormat.ts` formatters
- Optional: extend the existing operator-access test file to pin note-hiding for operators
