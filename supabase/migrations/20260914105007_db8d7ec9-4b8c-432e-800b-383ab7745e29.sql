-- Tenancy: pay_policies + owner_transfers gain company_id and their singletons go per-company.

-- 1. pay_policies -------------------------------------------------------------
ALTER TABLE public.pay_policies ADD COLUMN company_id uuid;

ALTER TABLE public.pay_policies DISABLE TRIGGER USER;
UPDATE public.pay_policies
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE company_id IS NULL;
ALTER TABLE public.pay_policies ENABLE TRIGGER USER;

ALTER TABLE public.pay_policies ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.pay_policies
  ADD CONSTRAINT pay_policies_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_pay_policies_company_id ON public.pay_policies (company_id);

DROP INDEX public.pay_policies_single_company_default;
CREATE UNIQUE INDEX pay_policies_single_company_default
  ON public.pay_policies (company_id, is_company_default)
  WHERE is_company_default;

CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.pay_policies
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- 2. owner_transfers ----------------------------------------------------------
ALTER TABLE public.owner_transfers ADD COLUMN company_id uuid;

ALTER TABLE public.owner_transfers DISABLE TRIGGER USER;
UPDATE public.owner_transfers
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE company_id IS NULL;
ALTER TABLE public.owner_transfers ENABLE TRIGGER USER;

ALTER TABLE public.owner_transfers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.owner_transfers
  ADD CONSTRAINT owner_transfers_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX idx_owner_transfers_company_id ON public.owner_transfers (company_id);

DROP INDEX public.owner_transfers_single_pending;
CREATE UNIQUE INDEX owner_transfers_single_pending
  ON public.owner_transfers (company_id, status)
  WHERE status = 'pending';

CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.owner_transfers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- 3. The rule the index enforces also lives in this function body -------------
-- Its pending check and its expiry sweep were global; both are now per company,
-- otherwise a per-company index with a global body check is worse than neither.
CREATE OR REPLACE FUNCTION public.initiate_owner_transfer(p_to_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_caller uuid := auth.uid();
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_label text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'owner') THEN
    RAISE EXCEPTION 'Only the current owner may initiate an ownership transfer.'
      USING ERRCODE = '42501';
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'You hold no company membership; this ownership transfer cannot be started.'
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

  UPDATE public.owner_transfers
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at <= now() AND company_id = v_company;

  IF EXISTS (
    SELECT 1 FROM public.owner_transfers
     WHERE status = 'pending' AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'An ownership transfer is already pending; cancel it before starting another.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.owner_transfers (
    from_user_id, to_user_id, initiated_by, expires_at, status, mechanism, company_id
  ) VALUES (
    v_caller, p_to_user_id, v_actor, now() + interval '72 hours', 'pending',
    'in_app_management_transfer', v_company
  )
  RETURNING id INTO v_id;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_label FROM public.profiles p WHERE p.user_id = p_to_user_id;

  INSERT INTO public.audit_log (
    actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata
  ) VALUES (
    v_actor,
    public._audit_actor_name(v_caller),
    'owner_transfer_initiated',
    'owner_transfer',
    v_id,
    coalesce(v_label, p_to_user_id::text),
    jsonb_build_object(
      'mechanism', 'in_app_management_transfer',
      'from_user_id', v_caller,
      'to_user_id', p_to_user_id,
      'company_id', v_company,
      'expires_at', now() + interval '72 hours'
    )
  );

  RETURN v_id;
END;
$function$;
