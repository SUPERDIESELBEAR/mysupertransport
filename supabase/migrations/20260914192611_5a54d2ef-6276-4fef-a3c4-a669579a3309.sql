-- B5 part one: the two carrier-data singletons become PER-COMPANY.
-- email_send_state is NOT touched: the record (2026-09-13) declares
-- email_send_state_id_check deliberately GLOBAL infrastructure keyed to the
-- shared sending domain.

------------------------------------------------------------------ settlement_settings
ALTER TABLE public.settlement_settings ADD COLUMN company_id uuid;
UPDATE public.settlement_settings
   SET company_id = '6b54d0e6-8743-4284-b55b-8cd094b093dd'
 WHERE company_id IS NULL;
ALTER TABLE public.settlement_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.settlement_settings ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.settlement_settings
  ADD CONSTRAINT settlement_settings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

-- PER-COMPANY: the CHECK (singleton) is dropped and the primary key moves from
-- the boolean `singleton` column to company_id, which is what now enforces
-- "one settlement settings row per carrier". The `singleton` column itself is
-- left in place (default true) so existing client filters keep working; it no
-- longer constrains anything.
ALTER TABLE public.settlement_settings DROP CONSTRAINT settlement_settings_singleton_check;
ALTER TABLE public.settlement_settings DROP CONSTRAINT settlement_settings_pkey;
ALTER TABLE public.settlement_settings
  ADD CONSTRAINT settlement_settings_pkey PRIMARY KEY (company_id);

CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.settlement_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

DROP POLICY "Staff can read settlement settings" ON public.settlement_settings;
CREATE POLICY "Staff can read settlement settings"
  ON public.settlement_settings FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  );

DROP POLICY "Management can create settlement settings" ON public.settlement_settings;
CREATE POLICY "Management can create settlement settings"
  ON public.settlement_settings FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  );

DROP POLICY "Management can update settlement settings" ON public.settlement_settings;
CREATE POLICY "Management can update settlement settings"
  ON public.settlement_settings FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  );

------------------------------------------------------- carrier_signature_settings
ALTER TABLE public.carrier_signature_settings ADD COLUMN company_id uuid;
UPDATE public.carrier_signature_settings
   SET company_id = '6b54d0e6-8743-4284-b55b-8cd094b093dd'
 WHERE company_id IS NULL;
ALTER TABLE public.carrier_signature_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.carrier_signature_settings ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.carrier_signature_settings
  ADD CONSTRAINT carrier_signature_settings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

-- PER-COMPANY: UNIQUE ((true)) becomes UNIQUE (company_id).
DROP INDEX IF EXISTS public.carrier_signature_settings_singleton;
CREATE UNIQUE INDEX carrier_signature_settings_company_unique
  ON public.carrier_signature_settings (company_id);

CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.carrier_signature_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

DROP POLICY "Staff can view carrier signature settings" ON public.carrier_signature_settings;
CREATE POLICY "Staff can view carrier signature settings"
  ON public.carrier_signature_settings FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff(auth.uid()));

DROP POLICY "Management can insert carrier signature settings" ON public.carrier_signature_settings;
CREATE POLICY "Management can insert carrier signature settings"
  ON public.carrier_signature_settings FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  );

DROP POLICY "Management can update carrier signature settings" ON public.carrier_signature_settings;
CREATE POLICY "Management can update carrier signature settings"
  ON public.carrier_signature_settings FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  );

DROP POLICY "Management can delete carrier signature settings" ON public.carrier_signature_settings;
CREATE POLICY "Management can delete carrier signature settings"
  ON public.carrier_signature_settings FOR DELETE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  );

--------------------------------------------- the three single-settings-row readers
-- Patched by textual substitution on the LIVE body so nothing else in these
-- functions changes, and each patch is asserted before it is applied.
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_accessorial_adjustment';
  d := replace(d,
    'FROM public.settlement_settings WHERE singleton',
    'FROM public.settlement_settings WHERE company_id = public.current_company_id()');
  IF position('WHERE company_id = public.current_company_id()' in d) = 0 THEN
    RAISE EXCEPTION 'approve_accessorial_adjustment: settings read not found, refusing to leave it global';
  END IF;
  EXECUTE d;

  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'my_rm_deposit';
  d := replace(d,
    'FROM public.settlement_settings s LIMIT 1',
    'FROM public.settlement_settings s WHERE s.company_id = public.current_company_id()');
  IF position('s.company_id = public.current_company_id()' in d) = 0 THEN
    RAISE EXCEPTION 'my_rm_deposit: settings read not found, refusing to leave it global';
  END IF;
  EXECUTE d;

  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'my_fuel_transactions';
  d := replace(d,
    'FROM public.settlement_settings ss LIMIT 1',
    'FROM public.settlement_settings ss WHERE ss.company_id = public.current_company_id()');
  IF position('ss.company_id = public.current_company_id()' in d) = 0 THEN
    RAISE EXCEPTION 'my_fuel_transactions: settings read not found, refusing to leave it global';
  END IF;
  EXECUTE d;
END
$do$;