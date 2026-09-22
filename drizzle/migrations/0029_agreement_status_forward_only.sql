-- P36: An agreement's status only moves forward; only the owner may move it back.
--
-- The bypass this closes (proved live 2026-09-22): the ICA builder wrote
-- status = 'draft' on EVERY update. Staff could save a sent agreement back to
-- draft without touching the percentage, and then change the percentage freely,
-- because ab_guard_ica_linehaul_split (migration 0027) only locks the split once
-- the status is something other than 'draft'. It also silently un-sent an
-- agreement a driver had already been asked to sign.
--
-- Ordering. All three guards are BEFORE UPDATE FOR EACH ROW and fire in trigger
-- name order:
--   aa_guard_ica_contract_terms      (0023) -- is the caller staff at all?
--   ab_guard_ica_linehaul_split      (0027) -- may this caller change the split?
--   ab_guard_ica_status_forward_only (this) -- may this caller move the status back?
-- A driver therefore still gets 0023's message; staff get 0027's split message
-- before this one, and this one only when the status itself moves backward.
--
-- UNDO:
--   DROP TRIGGER IF EXISTS ab_guard_ica_status_forward_only ON public.ica_contracts;
--   DROP FUNCTION IF EXISTS public.guard_ica_status_forward_only();

CREATE OR REPLACE FUNCTION public.guard_ica_status_forward_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_old int;
  v_new int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Service-role callers (edge functions) check their own caller's permission,
  -- per design (d). Same convention as the 0027 guards.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_old := CASE COALESCE(OLD.status, 'draft')
             WHEN 'draft' THEN 0
             WHEN 'sent_to_operator' THEN 1
             WHEN 'fully_executed' THEN 2
             WHEN 'complete' THEN 3
             ELSE NULL END;
  v_new := CASE COALESCE(NEW.status, 'draft')
             WHEN 'draft' THEN 0
             WHEN 'sent_to_operator' THEN 1
             WHEN 'fully_executed' THEN 2
             WHEN 'complete' THEN 3
             ELSE NULL END;

  -- An unrecognised status on either side is not ranked; only the unambiguous
  -- move to 'draft' is refused in that case.
  IF v_old IS NULL OR v_new IS NULL THEN
    IF COALESCE(NEW.status, 'draft') = 'draft' AND COALESCE(OLD.status, 'draft') <> 'draft' THEN
      v_old := 1; v_new := 0;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_new < v_old AND NOT public.has_permission(auth.uid(), 'driver_pay.change') THEN
    RAISE EXCEPTION
      'Not authorized to move this agreement back from % to %. An agreement''s status only moves forward; only the owner may move it back.',
      OLD.status, NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ab_guard_ica_status_forward_only ON public.ica_contracts;
CREATE TRIGGER ab_guard_ica_status_forward_only
  BEFORE UPDATE ON public.ica_contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_ica_status_forward_only();

COMMENT ON COLUMN public.ica_contracts.status IS
  'draft -> sent_to_operator -> fully_executed -> complete. Forward only: moving it back requires the driver_pay.change permission (owner only). See guard_ica_status_forward_only.';
