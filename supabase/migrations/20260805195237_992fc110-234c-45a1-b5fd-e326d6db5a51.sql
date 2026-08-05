CREATE TABLE public.notification_role_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  category text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_role_defaults TO authenticated;
GRANT ALL ON public.notification_role_defaults TO service_role;
ALTER TABLE public.notification_role_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view role defaults"
ON public.notification_role_defaults FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Owner and management manage role defaults"
ON public.notification_role_defaults FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));

CREATE TABLE public.staff_email_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  email_enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_email_overrides TO authenticated;
GRANT ALL ON public.staff_email_overrides TO service_role;
ALTER TABLE public.staff_email_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own or admins view all overrides"
ON public.staff_email_overrides FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));

CREATE POLICY "Staff manage own or admins manage all overrides"
ON public.staff_email_overrides FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));

INSERT INTO public.notification_role_defaults (role, category, email_enabled) VALUES
  ('owner','applications', false),
  ('management','applications', true),
  ('onboarding_staff','applications', true),
  ('dispatcher','applications', false),
  ('truck_owner','applications', false),
  ('owner','onboarding', true),
  ('management','onboarding', true),
  ('onboarding_staff','onboarding', true),
  ('dispatcher','onboarding', false),
  ('truck_owner','onboarding', false),
  ('owner','compliance', false),
  ('management','compliance', true),
  ('onboarding_staff','compliance', true),
  ('dispatcher','compliance', true),
  ('truck_owner','compliance', false),
  ('owner','dispatch', false),
  ('management','dispatch', true),
  ('onboarding_staff','dispatch', false),
  ('dispatcher','dispatch', true),
  ('truck_owner','dispatch', false),
  ('owner','messaging', true),
  ('management','messaging', true),
  ('onboarding_staff','messaging', true),
  ('dispatcher','messaging', true),
  ('truck_owner','messaging', false),
  ('owner','fleet_documents', false),
  ('management','fleet_documents', true),
  ('onboarding_staff','fleet_documents', true),
  ('dispatcher','fleet_documents', false),
  ('truck_owner','fleet_documents', false),
  ('owner','staff_admin', true),
  ('management','staff_admin', true),
  ('onboarding_staff','staff_admin', false),
  ('dispatcher','staff_admin', false),
  ('truck_owner','staff_admin', false);