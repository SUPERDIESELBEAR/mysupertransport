CREATE OR REPLACE FUNCTION public.owner_role_writer_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT coalesce(current_setting('app.owner_role_write', true), 'off') = 'on'
$$;

REVOKE ALL ON FUNCTION public.owner_role_writer_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_role_writer_active() FROM anon;
REVOKE ALL ON FUNCTION public.owner_role_writer_active() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owner_role_writer_active() TO service_role;

COMMENT ON FUNCTION public.owner_role_writer_active() IS
  'Internal transaction-local gate for owner-role writes. Its dedicated app.owner_role_write flag is not shared with invoice or settlement writers. Service-role only; the user_roles trigger calls it.';

CREATE OR REPLACE FUNCTION public.enforce_owner_role_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.role = 'owner')
    OR (TG_OP = 'DELETE' AND OLD.role = 'owner')
    OR (TG_OP = 'UPDATE' AND (OLD.role = 'owner' OR NEW.role = 'owner'))
  ) AND NOT public.owner_role_writer_active() THEN
    RAISE EXCEPTION 'Owner role changes must use an approved ownership function.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_owner_role_writes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_owner_role_writes() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_owner_role_writes() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_owner_role_writes() TO service_role;

COMMENT ON FUNCTION public.enforce_owner_role_writes() IS
  'BEFORE trigger guard on user_roles. Refuses INSERT, DELETE, and UPDATE in either direction involving owner unless app.owner_role_write is enabled for the current transaction by an approved ownership function.';

DROP TRIGGER IF EXISTS enforce_owner_role_writes ON public.user_roles;
CREATE TRIGGER enforce_owner_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_owner_role_writes();

CREATE OR REPLACE FUNCTION public.bootstrap_assign_owner(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_label text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'owner'
  ) THEN
    RAISE EXCEPTION 'An owner already exists; bootstrap cannot assign another owner.'
      USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Bootstrap owner target does not exist.'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config('app.owner_role_write', 'on', true);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'owner');

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label
    FROM public.profiles p
   WHERE p.user_id = p_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    NULL,
    'bootstrap-admin',
    'bootstrap_owner_assigned',
    'user',
    p_user_id,
    coalesce(v_label, p_user_id::text),
    jsonb_build_object('mechanism', 'bootstrap_assign_owner')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_assign_owner(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_assign_owner(uuid) TO service_role;

COMMENT ON FUNCTION public.bootstrap_assign_owner(uuid) IS
  'Fresh-deployment owner assignment only. Refuses when any owner exists, validates the target auth user, enables the dedicated transaction-local owner-role write gate, inserts the owner row, and writes an audit event. Callable only by service_role; BOOTSTRAP_SECRET remains enforced by bootstrap-admin before this RPC is called.';