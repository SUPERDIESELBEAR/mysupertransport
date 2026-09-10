## How it works

1. **The list.** Management → Drivers → *Duplicate Plates*. One card per shared plate, grouped by plate and state, newest activity first. Each card shows every driver on that plate: name, unit, truck year/make, and whether they are on or off the roster. Cards are sorted so mixed active/deactivated pairs come first, then both-active pairs, then all-deactivated ones.

2. **Two ways to fix a record.** On any driver in the group except the one you keep:
   - **Clear the plate** — removes it from that driver's truck record, leaving the unit and truck details untouched.
   - **Enter the right plate** — you type the plate that truck actually carries, with its state. Blocked if it would create a new duplicate.

   Both ask for a short reason before saving.

3. **Both drivers active.** Those cards are marked "both active" and offered the same two actions, with a warning that neither driver is off the roster so one of them is likely a typo on a live truck.

4. **The plate history.** Every change writes a row recording the plate that was removed, the plate that replaced it (if any), the driver and unit it belonged to, who made the change, when, and the reason. Each card shows "Previously on this truck" for anything already recorded, so a plate that legitimately moved trucks reads as a move rather than a mistake.

5. **Resolved plates leave the list** once only one driver holds them, but stay reachable through a "Resolved" toggle so the history is not buried.

## Technical notes

- Staged migration (applies when this draft is accepted):
  - New additive table `public.truck_plate_history` — `operator_id`, `unit_number`, `plate_number`, `plate_state`, `replaced_by_plate`, `replaced_by_state`, `action` (`cleared` | `replaced`), `reason`, `changed_by`, `created_at`. GRANT `SELECT` to `authenticated`, `ALL` to `service_role`; RLS restricting reads to management/owner/onboarding_staff via `has_role`, no direct client writes.
  - Protected writer `public.resolve_shared_truck_plate(_operator_id uuid, _new_plate text, _new_state text, _reason text)` — SECURITY DEFINER, `SET search_path TO 'public', 'extensions'`, management/owner only, required non-empty reason, one operator per call, no bulk path. Updates only `onboarding_status.truck_plate` / `truck_plate_state`, inserts the history row and an `audit_log` entry with actor attribution. EXECUTE to `authenticated`; REVOKE from `PUBLIC` and `anon`. Registered in the definer allowlist with its justification.
- New `src/lib/duplicatePlates.ts`: normalises plate + state (uppercase, strip non-alphanumerics — matching the existing `sharedPlates` key in `FleetRoster.tsx`), groups operators, classifies each group, and exposes the same grouping to both screens.
- New `src/components/management/DuplicatePlatesPanel.tsx`, wired into `ManagementPortal.tsx` as `duplicate-plates` in the Drivers group directly under *Vehicle Hub*, added to `ManagementView` and `ALLOWED_VIEWS`.
- `FleetRoster.tsx`: its existing shared-plate note gains a link into this screen; its local grouping is replaced by the shared helper so the two never disagree.
- Tests: grouping and classification (mixed, both-active, all-deactivated, the four-driver 53KU7B case), the duplicate-blocking rule on a typed replacement, reason-required and no-overwrite behaviour of the writer, and a source guard that the panel does not write `onboarding_status` directly.
- No existing column is dropped, renamed, or retyped. No RLS change to existing tables.

## Verify

On plate 05KT2W: clear Edward Williams's plate with a reason, confirm the group disappears from the open list, that his unit 197 record keeps its truck details, that the history row and audit entry both name the actor and reason, and that Matthew Clovis's record is untouched.
