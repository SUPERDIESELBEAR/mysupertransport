-- B7 table 1 of 4: notifications (10,827 rows).
-- SHAPE: derive-from-parent, where the parent is the RECIPIENT.
-- Why not the resolver stamp: ~20 edge functions (cron reminders, escalations,
-- broadcasts) and ~25 SECURITY DEFINER RPCs insert notifications with NO
-- auth.uid(); aa_stamp_tenant_company_id would raise 42501 on every one of them.
-- user_id is NOT NULL and all 10,827 rows' recipients resolve, so the recipient
-- is an exact source, not a guess.

CREATE OR REPLACE FUNCTION public.stamp_company_from_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT COALESCE(
    (SELECT m.company_id FROM public.company_members m WHERE m.user_id = NEW.user_id LIMIT 1),
    (SELECT o.company_id FROM public.operators o WHERE o.user_id = NEW.user_id AND o.company_id IS NOT NULL LIMIT 1),
    (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = NEW.user_id AND w.company_id IS NOT NULL LIMIT 1)
  ) INTO v_company;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for notification recipient %: refusing to write % without tenancy',
      NEW.user_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_company_from_recipient() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_company_from_recipient() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_company_from_recipient() FROM authenticated;

ALTER TABLE public.notifications ADD COLUMN company_id uuid;

UPDATE public.notifications n SET company_id = COALESCE(
  (SELECT m.company_id FROM public.company_members m WHERE m.user_id = n.user_id LIMIT 1),
  (SELECT o.company_id FROM public.operators o WHERE o.user_id = n.user_id AND o.company_id IS NOT NULL LIMIT 1),
  (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = n.user_id AND w.company_id IS NOT NULL LIMIT 1));

DO $$
DECLARE v_null bigint;
BEGIN
  SELECT count(*) INTO v_null FROM public.notifications WHERE company_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'notifications: % rows could not derive a company; refusing to default them', v_null;
  END IF;
END $$;

ALTER TABLE public.notifications ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON public.notifications (company_id);

CREATE TRIGGER aa_stamp_company_from_recipient
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_recipient();
