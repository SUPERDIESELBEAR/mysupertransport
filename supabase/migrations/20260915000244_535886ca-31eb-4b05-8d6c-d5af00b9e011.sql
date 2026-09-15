DO $$
DECLARE t text; tables text[] := ARRAY[
  'company_settings','fleet_settings','load_number_config','dot_consultant_email_settings',
  'insurance_email_settings','carrier_notification_settings','inspection_program_settings',
  'pei_cadence_settings','dispatch_settlement_rates','mo_plates','notification_role_defaults',
  'inspection_binder_order'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', t);
    EXECUTE format('UPDATE public.%I SET company_id = (SELECT id FROM public.carrier_profile)', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT', t, t||'_company_id_fkey');
    EXECUTE format('CREATE INDEX %I ON public.%I (company_id)', 'idx_'||t||'_company_id', t);
    EXECUTE format('CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id()', t);
  END LOOP;
END $$;

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_setting_key_key;
DROP INDEX IF EXISTS public.company_settings_setting_key_key;
CREATE UNIQUE INDEX company_settings_company_setting_key_uniq ON public.company_settings (company_id, setting_key);

ALTER TABLE public.inspection_binder_order DROP CONSTRAINT IF EXISTS inspection_binder_order_scope_key;
DROP INDEX IF EXISTS public.inspection_binder_order_scope_key;
CREATE UNIQUE INDEX inspection_binder_order_company_scope_uniq ON public.inspection_binder_order (company_id, scope);

ALTER TABLE public.carrier_notification_settings DROP CONSTRAINT IF EXISTS carrier_notification_settings_email_key;
DROP INDEX IF EXISTS public.carrier_notification_settings_email_key;
CREATE UNIQUE INDEX carrier_notification_settings_company_email_uniq ON public.carrier_notification_settings (company_id, email);

ALTER TABLE public.notification_role_defaults DROP CONSTRAINT IF EXISTS notification_role_defaults_role_category_key;
DROP INDEX IF EXISTS public.notification_role_defaults_role_category_key;
CREATE UNIQUE INDEX notification_role_defaults_company_role_category_uniq ON public.notification_role_defaults (company_id, role, category);