ALTER TABLE public.inspection_documents
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff_upload';

COMMENT ON COLUMN public.inspection_documents.pending_review IS 'True when the file was synced automatically from an onboarding upload and staff have not yet verified it. Pending docs are excluded from roadside binder sharing.';
COMMENT ON COLUMN public.inspection_documents.source IS 'staff_upload | onboarding_sync';

CREATE OR REPLACE FUNCTION public.clear_binder_pending_on_stage2_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF OLD.form_2290 IS DISTINCT FROM NEW.form_2290 AND NEW.form_2290 = 'received' THEN
    SELECT user_id INTO v_uid FROM public.operators WHERE id = NEW.operator_id;
    IF v_uid IS NOT NULL THEN
      UPDATE public.inspection_documents
         SET pending_review = false
       WHERE scope = 'per_driver'
         AND driver_id = v_uid
         AND name = 'Form 2290'
         AND pending_review = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_binder_pending_on_stage2_received ON public.onboarding_status;
CREATE TRIGGER trg_clear_binder_pending_on_stage2_received
AFTER UPDATE OF form_2290 ON public.onboarding_status
FOR EACH ROW EXECUTE FUNCTION public.clear_binder_pending_on_stage2_received();