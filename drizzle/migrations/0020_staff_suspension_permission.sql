-- STAFF ACCOUNT SUSPENSION — slice item 5 of
-- docs/passes/2026-09-21-0132-permissions-design.md, owner decisions P16-P19
-- (2026-09-21). The permission covers BOTH directions: suspending and
-- reinstating a staff login.
--
-- TWO PATHS EXIST, and both are gated:
--   1. get-staff-list, actions deactivate_user / reactivate_user. Service-role
--      writer: it flips profiles.account_status AND applies/lifts the auth ban.
--      It asks has_permission about the CALLER's own id, per design (d).
--   2. A direct PostgREST UPDATE of profiles.account_status. Today
--      "Staff can update profiles" (is_staff) plus enforce_profiles_self_update
--      admit ANY staff role to that column. The trigger below closes it.
--
-- The profiles UPDATE policies are deliberately NOT narrowed: they serve name,
-- phone, avatar and birthday edits for every staff member. The trigger fires
-- ONLY when account_status actually changes.
--
-- Carve-out, deliberate: a person's own pending -> active on FIRST SIGN-IN
-- (src/hooks/useAuth.tsx activatePendingProfile) is admitted. It is not a
-- suspension, and refusing it would break every first login.
--
-- UNDO, in this order:
--   DROP TRIGGER aa_enforce_staff_suspension_permission ON public.profiles;
--   DROP FUNCTION public.enforce_staff_suspension_permission();
--   DELETE FROM public.role_permissions WHERE action_key = 'staff_account.suspend';
--   DELETE FROM public.permission_actions WHERE key = 'staff_account.suspend';
--   -- and restore seed_role_permissions to its 0016 body (14 grants).

INSERT INTO public.permission_actions (key, label, description, category, kind) VALUES
  ('staff_account.suspend', 'Suspend or reinstate a staff login',
   'Block a staff member from signing in, or let a suspended staff member sign in again.',
   'access', 'change')
ON CONFLICT (key) DO NOTHING;

-- A new carrier receives the same grant (P16).
CREATE OR REPLACE FUNCTION public.seed_role_permissions(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_count integer;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'seed_role_permissions requires a company_id' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.carrier_profile c WHERE c.id = _company_id) THEN
    RAISE EXCEPTION 'No carrier_profile row %', _company_id USING ERRCODE = '22023';
  END IF;

  -- The owner appears NOWHERE below: P1 lives in has_permission, not in rows.
  INSERT INTO public.role_permissions (company_id, role, action_key)
  SELECT _company_id, d.role::public.app_role, d.action_key
    FROM (VALUES
      ('management',       'lease_termination.view'),
      ('dispatcher',       'lease_termination.view'),
      ('onboarding_staff', 'lease_termination.view'),
      ('management',       'lease_termination.change'),
      ('management',       'company_document.view'),
      ('dispatcher',       'company_document.view'),
      ('onboarding_staff', 'company_document.view'),
      ('management',       'company_document.send'),
      ('dispatcher',       'company_document.send'),
      ('management',       'settlement.view'),
      ('dispatcher',       'settlement.view'),
      ('management',       'invoice.view'),
      ('dispatcher',       'invoice.view'),
      ('management',       'driver.deactivate'),
      ('management',       'staff_account.suspend')
    ) AS d(role, action_key)
  ON CONFLICT (company_id, role, action_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_role_permissions(uuid) TO service_role;

-- Seed the new grant for every carrier that exists today. Same shim as 0016:
-- this connection carries no JWT, so it is told it is the server and handed the
-- company_id explicitly — the service-role path stamp_tenant_company_id allows.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.seed_role_permissions(c.id) FROM public.carrier_profile c;
SELECT set_config('request.jwt.claims', NULL, true);

-- THE GATE. Named aa_ so it fires before the other profiles BEFORE UPDATE
-- triggers, and so it judges what the CALLER asked for.
-- Check order, quoted in the report: own account (P19) -> owner account (P18)
-- -> permission (P17). The same order as the edge function.
CREATE OR REPLACE FUNCTION public.enforce_staff_suspension_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.account_status IS NOT DISTINCT FROM OLD.account_status THEN
    RETURN NEW;
  END IF;

  -- Service-role writers have no auth.uid(). get-staff-list, the only one that
  -- changes this column, asks has_permission about its caller before writing.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- First sign-in activation of your OWN pending account: not a suspension.
  IF auth.uid() = OLD.user_id
     AND OLD.account_status = 'pending' AND NEW.account_status = 'active' THEN
    RETURN NEW;
  END IF;

  -- P19: nobody may suspend or reinstate his own account.
  IF auth.uid() = OLD.user_id THEN
    RAISE EXCEPTION
      'You cannot change your own account status.'
      USING ERRCODE = '42501';
  END IF;

  -- P18: only the owner may touch the owner account.
  IF public.has_role(OLD.user_id, 'owner') AND NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION
      'Only the owner can suspend or reinstate the owner account.'
      USING ERRCODE = '42501';
  END IF;

  -- P17: the permission itself, closed by default.
  IF NOT public.has_permission(auth.uid(), 'staff_account.suspend') THEN
    RAISE EXCEPTION
      'Not authorized to change a staff account status. Suspending or reinstating a staff login is limited to management and the owner.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- A trigger function must never be executable by a client role.
REVOKE EXECUTE ON FUNCTION public.enforce_staff_suspension_permission() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_staff_suspension_permission() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_staff_suspension_permission() FROM authenticated;

CREATE TRIGGER aa_enforce_staff_suspension_permission
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_suspension_permission();
