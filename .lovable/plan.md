# Pass 2D — Claim Flag Management on Load Detail

Extends the existing Load Detail page with a Claims section. No existing section (Pass 1, 2A, 2B, 2C) is rebuilt, and no claim table or trigger is altered.

## Claims section

A new section between Documents and Notes, rendered only for management, owner, dispatcher, and onboarding staff. For operator sessions the section is not rendered at all and the claim queries are never enabled, matching the gating already used for internal notes and the hold banner.

Each claim shows: level badge (watch = amber outline, hold = solid destructive, cleared = muted), claim type in plain language, description, reporter and report time, estimated and actual amounts, a documentation link when present, and for resolved claims the resolution, notes, resolver and resolution time. Active claims sort first; holds render with a heavier destructive treatment so they read as settlement blockers.

## Actions

- **Raise a claim** (management, owner, dispatcher): level watch or hold, claim type, required description, reporting broker contact, estimated amount, optional documentation URL. Choosing hold shows an inline warning that the load is excluded from settlement until resolved.
- **Resolve** (management, owner, dispatcher): outcome of denied / approved in full / approved in part / withdrawn, required notes, and actual amount required for the two approved outcomes. Only resolution fields are written; the existing `sync_claim_flag_resolution` trigger clears `is_active` and stamps `resolved_at` / `resolved_by`.
- **Reopen** (management and owner only): confirmation dialog explaining the resolution will be cleared and, for holds, that settlement is blocked again. A reason is required and is appended to the claim notes so it survives in the audit trail.

Onboarding staff see the section read-only with no action buttons.

## Claim history

Each claim card has an expandable panel that loads `claim_flag_history` for that claim on open, listing each change with action type, from/to values, actor name and timestamp.

## Hold banner

After every mutation the claim query, the load detail query, and the loads list query are invalidated, so the Pass 1 hold banner appears and disappears without a page refresh. This behaviour is verified in the browser.

## Server-side enforcement

One SECURITY DEFINER function handles all three mutations (raise, resolve, reopen). It checks the caller's roles — dispatcher/management/owner for raise and resolve, management/owner only for reopen — and raises an exception otherwise. It uses `public.current_profile_id()` for profile references, pins `search_path = public`, revokes EXECUTE from PUBLIC and anon, and grants EXECUTE to authenticated. The client calls it through the existing context-preserving `rpc` helper in `loadDetail.ts`.

## Tests

`loadDetailOperatorAccess.test.tsx` gains assertions that an operator viewing their own load with an active hold claim sees no Claims section and no claim text anywhere in the output, and that no `claim_flags` or `claim_flag_history` request is issued during that render. A database-level check confirms an operator-only caller invoking the mutation function raises. Failing assertions get reported, not relaxed.

## Technical notes

Files added under `src/components/dispatch/loadDetail/`: `ClaimsSection.tsx`, `ClaimCard.tsx`, `RaiseClaimDialog.tsx`, `ResolveClaimDialog.tsx`, `ReopenClaimDialog.tsx`, `ClaimHistoryPanel.tsx`. Data access is added to `src/lib/loadDetail.ts` (fetch claims, fetch claim history, one RPC wrapper per action). Only existing shadcn/ui components are used; errors go through `getDbErrorMessage` / `logDbError`; styling follows the existing charcoal and gold tokens.
