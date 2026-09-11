-- ============================================================
-- Owner invariant, Pass 3: owner_transfers + transfer functions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.owner_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  initiated_by uuid REFERENCES public.profiles(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending',
  mechanism text NOT NULL DEFAULT 'in_app_management_transfer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_transfers_status_check
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  CONSTRAINT owner_transfers_not_self CHECK (from_user_id <> to_user_id)
);

-- Only ONE pending transfer may exist at a time. A partial unique index is used
-- for the same reason as user_roles_single_owner: it is enforced by the storage
-- layer, cannot be bypassed by service_role, and cannot race the way a counting
-- trigger can. The in-body check in initiate_owner_transfer exists only to
-- return a readable message before the index speaks.
CREATE UNIQUE INDEX IF NOT EXISTS owner_transfers_single_pending
  ON public.owner_transfers (status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS owner_transfers_to_user_idx ON public.owner_transfers (to_user_id);
CREATE INDEX IF NOT EXISTS owner_transfers_from_user_idx ON public.owner_transfers (from_user_id);

GRANT SELECT ON public.owner_transfers TO authenticated;
GRANT ALL ON public.owner_transfers TO service_role;

ALTER TABLE public.owner_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties can view their own owner transfers"
  ON public.owner_transfers FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Management can view owner transfers"
  ON public.owner_transfers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

DROP TRIGGER IF EXISTS update_owner_transfers_updated_at ON public.owner_transfers;
CREATE TRIGGER update_owner_transfers_updated_at
  BEFORE UPDATE ON public.owner_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.owner_transfers IS
  'Ownership transfer records. Recipient must already hold management, enforced at initiation and again at acceptance. Expiry is 72 hours, decided by the owner. At most one pending row, enforced by the owner_transfers_single_pending partial unique index. Rows are written only by initiate_owner_transfer, cancel_owner_transfer and transfer_owner; clients have SELECT only.';

-- ============================================================
-- initiate_owner_transfer
-- ============================================================
CREATE OR REPLACE FUNCTION public.initiate_owner_transfer(p_to_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_id uuid;
  v_label text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'owner') THEN
    RAISE EXCEPTION 'Only the current owner may initiate an ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF p_to_user_id = v_caller THEN
    RAISE EXCEPTION 'Ownership cannot be transferred to yourself.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_to_user_id) THEN
    RAISE EXCEPTION 'Ownership transfer recipient does not exist.'
      USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_role(p_to_user_id, 'management') THEN
    RAISE EXCEPTION 'Ownership may only be transferred to a user who already holds management.'
      USING ERRCODE = '42501';
  END IF;

  -- Retire pending rows whose 72 hours have run out, so an abandoned transfer
  -- cannot permanently occupy the single pending slot.
  UPDATE public.owner_transfers
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.owner_transfers WHERE status = 'pending') THEN
    RAISE EXCEPTION 'An ownership transfer is already pending; cancel it before starting another.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.owner_transfers (
    from_user_id, to_user_id, initiated_by, expires_at, status, mechanism
  ) VALUES (
    v_caller, p_to_user_id, v_actor, now() + interval '72 hours', 'pending',
    'in_app_management_transfer'
  )
  RETURNING id INTO v_id;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label FROM public.profiles p WHERE p.user_id = p_to_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(),
    'owner_transfer_initiated',
    'owner_transfer',
    v_id,
    coalesce(v_label, p_to_user_id::text),
    jsonb_build_object(
      'mechanism', 'in_app_management_transfer',
      'from_user_id', v_caller,
      'to_user_id', p_to_user_id,
      'expires_at', now() + interval '72 hours'
    )
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_owner_transfer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initiate_owner_transfer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.initiate_owner_transfer(uuid) TO authenticated;

COMMENT ON FUNCTION public.initiate_owner_transfer(uuid) IS
  'Starts an ownership transfer. Owner-only, refuses transfer to self, requires the recipient to already hold management, and refuses while another transfer is pending. Expiry is 72 hours. Actor is resolved server-side by current_profile_id(); no actor id is accepted from the caller. Audited as owner_transfer_initiated.';

-- ============================================================
-- cancel_owner_transfer
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_owner_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_row public.owner_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.owner_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ownership transfer not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_caller IS NULL OR v_caller NOT IN (v_row.from_user_id, v_row.to_user_id) THEN
    RAISE EXCEPTION 'Only the sending or receiving party may cancel an ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'accepted' THEN
    RAISE EXCEPTION 'This ownership transfer has already been accepted and cannot be cancelled.'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending ownership transfer can be cancelled.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.owner_transfers
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor
   WHERE id = p_transfer_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(),
    'owner_transfer_cancelled',
    'owner_transfer',
    p_transfer_id,
    p_transfer_id::text,
    jsonb_build_object(
      'mechanism', v_row.mechanism,
      'from_user_id', v_row.from_user_id,
      'to_user_id', v_row.to_user_id,
      'cancelled_by_party', CASE WHEN v_caller = v_row.from_user_id THEN 'owner' ELSE 'recipient' END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_owner_transfer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_owner_transfer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_owner_transfer(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_owner_transfer(uuid) IS
  'Cancels a pending ownership transfer. Callable by either party, refuses once accepted. Actor is resolved server-side by current_profile_id(). Audited as owner_transfer_cancelled.';

-- ============================================================
-- transfer_owner — the atomic swap
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_owner(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_row public.owner_transfers%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_row FROM public.owner_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ownership transfer not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'This ownership transfer was cancelled and cannot be accepted.'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending ownership transfer can be accepted.'
      USING ERRCODE = '22023';
  END IF;

  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'This ownership transfer has expired.'
      USING ERRCODE = '22023';
  END IF;

  IF v_caller IS NULL OR v_caller <> v_row.to_user_id THEN
    RAISE EXCEPTION 'Only the named recipient may accept this ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_row.to_user_id, 'management') THEN
    RAISE EXCEPTION 'The recipient no longer holds management; this ownership transfer cannot be accepted.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_row.from_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'The sending user is no longer the owner; this ownership transfer is stale.'
      USING ERRCODE = '22023';
  END IF;

  -- One transaction: unlock, remove the old owner, add the new one. The
  -- single-owner index makes any two-call implementation impossible, and any
  -- failure below rolls the whole swap back, leaving the original owner intact.
  PERFORM set_config('app.owner_role_write', 'on', true);

  DELETE FROM public.user_roles
   WHERE user_id = v_row.from_user_id AND role = 'owner';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_row.to_user_id, 'owner');

  UPDATE public.owner_transfers
     SET status = 'accepted', accepted_at = now(), accepted_by = v_actor
   WHERE id = p_transfer_id;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label FROM public.profiles p WHERE p.user_id = v_row.to_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(),
    'owner_transferred',
    'owner_transfer',
    p_transfer_id,
    coalesce(v_label, v_row.to_user_id::text),
    jsonb_build_object(
      'mechanism', v_row.mechanism,
      'from_user_id', v_row.from_user_id,
      'to_user_id', v_row.to_user_id,
      'accepted_at', now()
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_owner(uuid) TO authenticated;

COMMENT ON FUNCTION public.transfer_owner(uuid) IS
  'Accepts a pending ownership transfer. Called by the named recipient only. Refuses a non-pending, cancelled, or expired transfer, the wrong caller, a recipient who no longer holds management, and a from-user who is no longer the owner. Deletes the old owner row and inserts the new one inside ONE transaction with the dedicated app.owner_role_write gate enabled, because the user_roles_single_owner index makes any two-step implementation impossible. Actor is resolved server-side by current_profile_id(). Audited as owner_transferred.';