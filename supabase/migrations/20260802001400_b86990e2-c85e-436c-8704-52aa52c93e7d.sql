-- §3 console: per-event escalation ledger with recipient names.
-- profiles keys on user_id (not id) — the embed bug class from §2 — and staff
-- cannot read auth.users, so this join lives in a definer function.
CREATE OR REPLACE FUNCTION public.get_eld_escalation_ledger(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  notification_type text,
  day_number integer,
  channel text,
  sent_on date,
  is_override boolean,
  created_at timestamptz,
  recipient_user_id uuid,
  recipient_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.event_id, n.notification_type, n.day_number, n.channel, n.sent_on,
         n.is_override, n.created_at, n.recipient_user_id,
         NULLIF(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
  FROM public.eld_malfunction_notifications n
  LEFT JOIN public.profiles p ON p.user_id = n.recipient_user_id
  WHERE n.event_id = p_event_id
    AND public.is_staff(auth.uid())
  ORDER BY n.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_eld_escalation_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_eld_escalation_ledger(uuid) TO authenticated;

-- Job health must be visible to every staff member who can see the malfunctions
-- console, not only management/owner.
DROP POLICY IF EXISTS eld_cron_runs_select_management ON public.eld_cron_runs;
CREATE POLICY eld_cron_runs_select_staff
  ON public.eld_cron_runs
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));