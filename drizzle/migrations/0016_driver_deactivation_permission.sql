-- DRIVER DEACTIVATION — P6 enforced in the database (owner decision 2026-09-21).
-- Slice item 1 of docs/passes/2026-09-21-0132-permissions-design.md.
--
-- The operators UPDATE policies are deliberately NOT split or narrowed: the same
-- policy serves onboarding writes, staff edits and this action at once, and
-- narrowing it would break ordinary work. Instead a BEFORE UPDATE trigger fires
-- ONLY when is_active or deactivated_at actually changes, and refuses unless the
-- caller holds 'driver.deactivate'. The permission covers BOTH directions —
-- deactivating and reactivating.
--
-- Service-role writers (auth.uid() IS NULL) pass the trigger. The only such
-- writer that changes is_active is the reset-demo-driver edge function, which is
-- given the two-argument check in this same pass, per design (d).
--
-- UNDO, in this order:
--   DROP TRIGGER aa_enforce_driver_deactivation_permission ON public.operators;
--   DROP FUNCTION public.enforce_driver_deactivation_permission();
--   DELETE FROM public.role_permissions WHERE action_key = 'driver.deactivate';
--   DELETE FROM public.permission_actions WHERE key = 'driver.deactivate';
--   -- and restore seed_role_permissions to its 0013 body (13 grants).

INSERT INTO public.permission_actions (key, label, description, category, kind) VALUES
  ('driver.deactivate', 'Deactivate or reactivate a driver',
   'Take a driver off the active roster, or put a deactivated driver back on it.',
   'drivers', 'change')
ON CONFLICT (key) DO NOTHING;

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
      ('management',       'driver.deactivate')
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

-- Seed the new grant for every carrier that exists today. The stamp trigger on
-- role_permissions resolves the CALLER's company; this connection carries no
-- JWT, so it is told it is the server and handed the company_id explicitly —
-- exactly the service-role path stamp_tenant_company_id already allows.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.seed_role_permissions(c.id) FROM public.carrier_profile c;
SELECT set_config('request.jwt.claims', NULL, true);

-- THE GATE. Named aa_ so it fires BEFORE handle_operator_deactivated_trigger,
-- which derives deactivated_at from is_active: the gate must judge what the
-- CALLER asked for, not what another trigger added.
CREATE OR REPLACE FUNCTION public.enforce_driver_deactivation_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Fires only when the active status itself moves. Every other column on
  -- operators — onboarding fields, notes, parked/departing, unit number, the
  -- driver's own last_web_seen_at — is untouched by this gate.
  IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.deactivated_at IS NOT DISTINCT FROM OLD.deactivated_at THEN
    RETURN NEW;
  END IF;

  -- Service-role writers have no auth.uid(). They are admitted here because each
  -- one checks the permission itself before writing (see the header).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_permission(auth.uid(), 'driver.deactivate') THEN
    RAISE EXCEPTION
      'Not authorized to change a driver''s active status. Deactivating or reactivating a driver is limited to management and the owner.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER aa_enforce_driver_deactivation_permission
  BEFORE UPDATE ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_deactivation_permission();
