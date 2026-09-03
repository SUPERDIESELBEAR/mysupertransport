ALTER TABLE public.dispatch_settlements
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.stamp_dispatch_settlement_actors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor uuid;
BEGIN
  actor := public.current_profile_id();

  -- Client-supplied actor values are never trusted: carry the stored value
  -- forward, then overwrite only on the transition that earns the stamp.
  NEW.approved_by := OLD.approved_by;
  NEW.paid_by := OLD.paid_by;
  NEW.voided_by := OLD.voided_by;

  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.approved_by := actor;
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    NEW.paid_by := actor;
  END IF;

  IF NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void' THEN
    NEW.voided_by := actor;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stamp_dispatch_settlement_actors() FROM anon, authenticated;

DROP TRIGGER IF EXISTS stamp_dispatch_settlement_actors ON public.dispatch_settlements;
CREATE TRIGGER stamp_dispatch_settlement_actors
  BEFORE UPDATE ON public.dispatch_settlements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_dispatch_settlement_actors();