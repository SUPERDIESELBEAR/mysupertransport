# Go Live Acknowledgment Gate

## Goal
Prevent staff from setting an operator's `go_live_date` until that driver has acknowledged every policy document flagged as **"Blocks Go Live."** Owner (Marcus) can override with a confirmation. Enforced in both UI activation paths and at the database.

## Decisions locked in
- **Scope** — new column `driver_documents.blocks_go_live` (separate from `is_required`).
- **Override** — owners can bypass with a typed confirmation; everyone else is hard-locked.
- **Enforcement points** — Stage 7 `go_live_date` field on Operator Detail **and** the `start_date` → `go_live_date` write in the Add Driver modal. Plus a DB trigger as defense-in-depth.

## 1. Schema (single migration)

```sql
ALTER TABLE public.driver_documents
  ADD COLUMN blocks_go_live boolean NOT NULL DEFAULT false;

-- Helper: returns array of unacked blocking docs for an operator (by operator_id)
CREATE OR REPLACE FUNCTION public.unacked_go_live_blockers(_operator_id uuid)
RETURNS TABLE (document_id uuid, title text, version int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.title, d.version
  FROM public.driver_documents d
  JOIN public.operators o ON o.id = _operator_id
  WHERE d.blocks_go_live = true
    AND d.is_visible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.document_acknowledgments a
      WHERE a.document_id = d.id
        AND a.user_id = o.user_id
        AND a.document_version >= d.version
    );
$$;

GRANT EXECUTE ON FUNCTION public.unacked_go_live_blockers(uuid) TO authenticated, service_role;

-- Trigger: block go_live_date assignment unless all blockers acked OR owner override
CREATE OR REPLACE FUNCTION public.enforce_go_live_ack_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _unacked int;
  _is_owner boolean;
  _override boolean := COALESCE(current_setting('app.go_live_override', true) = 'true', false);
BEGIN
  IF NEW.go_live_date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.go_live_date IS NOT NULL AND OLD.go_live_date = NEW.go_live_date THEN
    RETURN NEW; -- no change
  END IF;

  SELECT count(*) INTO _unacked FROM public.unacked_go_live_blockers(NEW.operator_id);
  IF _unacked = 0 THEN RETURN NEW; END IF;

  SELECT public.has_role(auth.uid(), 'owner'::app_role) INTO _is_owner;
  IF _is_owner AND _override THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot set Go Live: driver has % unacknowledged required document(s).', _unacked
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_go_live_ack_gate ON public.onboarding_status;
CREATE TRIGGER trg_enforce_go_live_ack_gate
  BEFORE INSERT OR UPDATE OF go_live_date ON public.onboarding_status
  FOR EACH ROW EXECUTE FUNCTION public.enforce_go_live_ack_gate();
```

Owner override is signaled by setting the session var `app.go_live_override = 'true'` via a `SELECT set_config('app.go_live_override','true', true)` immediately before the update (transaction-scoped, never persisted).

## 2. UI — Admin Document Editor
`src/components/documents/DocumentEditorModal.tsx`:
- Add a `Blocks Go Live` switch beneath the existing `Required` switch with helper text: *"Operators cannot be set live until this document is acknowledged."* Save to the new column.

`src/components/documents/AdminDocumentList.tsx`:
- Add a small red shield/lock badge next to `Required` when `blocks_go_live` is on (hover: "Blocks Go Live").

## 3. UI — Stage 7 (`src/pages/staff/OperatorDetailPanel.tsx`)
- New hook call inside Stage 7 render: fetch unacked blockers via `supabase.rpc('unacked_go_live_blockers', { _operator_id })`.
- If `unackedBlockers.length > 0`:
  - Disable the `StageDatePicker` for `go_live_date` (and the Save button when that's the only pending edit).
  - Render a red checklist card above the picker:
    > "Driver must acknowledge N policy document(s) before going live:" followed by the document titles.
  - Add a `Send acknowledgment reminder` button that reuses the existing notification path from `ComplianceDashboard` (posts to `notifications` for that driver).
  - **Owner-only**: show a secondary `Override and set Go Live anyway` link (only when `isOwner === true`). Click → confirmation modal requiring the owner to type the driver's full name. On confirm: `set_config('app.go_live_override','true', true)` then perform the update in the same transaction (single RPC `set_go_live_with_override` to keep it atomic). Log the override into `audit_log` with `action = 'go_live_override'` and the list of bypassed document titles.
- When `unackedBlockers.length === 0`, behavior is unchanged.

## 4. UI — Add Driver modal (`src/components/drivers/AddDriverModal.tsx`)
- Keep `start_date` field as-is, but only copy it into `onboardingUpdate.go_live_date` after a pre-flight check using the same RPC against the just-created operator. If blockers exist:
  - Skip writing `go_live_date`, keep the rest of the onboarding update intact.
  - Show a non-blocking toast: *"Driver created. Go Live date deferred — N required policy document(s) must be acknowledged first."*
  - Owners get a second confirm dialog mirroring the Stage 7 override flow; if confirmed, write via the same override path.

## 5. Audit & history
- Existing audit log on `go_live_date` change keeps working. Add `override_used: true/false` and `bypassed_docs: [...]` into the payload when the override path is used.

## 6. Out of scope
- No change to the driver-facing Document Hub UI (drivers already see required docs prominently).
- No new email — reminders use the existing in-app `notifications` path.
- No retroactive enforcement: existing operators with a `go_live_date` already set are unaffected (trigger only fires when value changes).
- No migration of which docs are currently `is_required` → `blocks_go_live`; you'll flip the switch per document in the editor.
