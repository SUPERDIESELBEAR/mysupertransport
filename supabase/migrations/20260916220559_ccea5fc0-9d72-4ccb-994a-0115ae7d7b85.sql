-- Owner decision C (2026-09-16): an ambiguous company resolves to NOTHING.
-- A person matching MORE THAN ONE distinct company across company_members,
-- operators and truck_owners resolves to NULL rather than to an arbitrary
-- LIMIT 1 winner. Options A (one company per person, enforced) and B (pick by
-- rule, e.g. newest) were rejected: A is too rigid, B silently shows the wrong
-- carrier while both links are live. C never shows wrong data; its failure is a
-- visible empty screen.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  -- Tenancy is resolved server-side only: no client input, no JWT claim, no
  -- carrier fallback. Three sources are read TOGETHER, not in preference order:
  -- company_members (staff), the caller's OWN operator row (drivers, who
  -- deliberately hold no company_members row because membership implies staff
  -- capability in the billing policies), and his TRUCK OWNER row -- read
  -- DIRECTLY, never walked to the operators he owns, so an owner between hires
  -- with no drivers still resolves.
  --
  -- NO LIMIT. Exactly one distinct non-null company resolves; zero or two or
  -- more resolve to NULL, which the NOT NULL company_id columns and the
  -- restrictive tenant policies both refuse.
  -- (array_agg(...))[1], not min(): there is no min(uuid) in Postgres.
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(d.company_id))[1] END
  FROM (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT o.company_id  FROM public.operators o       WHERE o.user_id  = auth.uid()
    UNION
    SELECT t.company_id  FROM public.truck_owners t    WHERE t.user_id  = auth.uid()
  ) d
  WHERE d.company_id IS NOT NULL
$function$;

-- Grants re-applied verbatim so the set is stated, not assumed.
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_company_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;

-- Same rule for the second user->company deriver: the notification recipient.
CREATE OR REPLACE FUNCTION public.stamp_company_from_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_company uuid;
  v_n integer;
BEGIN
  -- No LIMIT: ambiguity refuses instead of choosing (owner decision C).
  SELECT count(*), (array_agg(d.company_id))[1] INTO v_n, v_company
  FROM (
    SELECT m.company_id FROM public.company_members m WHERE m.user_id = NEW.user_id
    UNION
    SELECT o.company_id FROM public.operators o       WHERE o.user_id = NEW.user_id
    UNION
    SELECT w.company_id FROM public.truck_owners w    WHERE w.user_id = NEW.user_id
  ) d
  WHERE d.company_id IS NOT NULL;

  IF v_n > 1 THEN
    RAISE EXCEPTION 'Notification recipient % belongs to % different carriers; refusing to guess which one this % row belongs to.',
      NEW.user_id, v_n, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for notification recipient %: refusing to write % without tenancy',
      NEW.user_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_eld_malfunction_notification_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_company uuid;
  v_n integer;
BEGIN
  -- Sources unchanged (membership, operator row); the LIMIT is gone, so a
  -- recipient linked to two carriers refuses rather than resolving arbitrarily.
  SELECT count(*), (array_agg(d.company_id))[1] INTO v_n, v_company
  FROM (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = NEW.recipient_user_id
    UNION
    SELECT o.company_id  FROM public.operators o        WHERE o.user_id  = NEW.recipient_user_id
  ) d
  WHERE d.company_id IS NOT NULL;

  IF v_n > 1 THEN
    RAISE EXCEPTION
      'The recipient % of this ELD malfunction notification belongs to % different carriers. Refusing rather than choosing one.',
      NEW.recipient_user_id, v_n USING ERRCODE = '42501';
  END IF;
  IF v_company IS NOT NULL THEN
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'The recipient % of this ELD malfunction notification belongs to no carrier (no company_members row, no operator row), and eld_malfunction_events carries no company of its own. Refusing rather than defaulting to a carrier.',
    NEW.recipient_user_id
    USING ERRCODE = '42501';
END;
$function$;