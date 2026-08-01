-- 1. Demo flag carried on the record itself
ALTER TABLE public.rods_days ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.eld_malfunction_events ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.operators ADD COLUMN IF NOT EXISTS demo_reset_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rods_days_is_demo ON public.rods_days (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_eld_events_is_demo ON public.eld_malfunction_events (is_demo) WHERE is_demo;

-- 2. Stamp from operators.is_demo on INSERT; immutable on UPDATE (record_source pattern)
CREATE OR REPLACE FUNCTION public.enforce_record_is_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o.is_demo INTO v_demo FROM public.operators o WHERE o.id = NEW.operator_id;
    NEW.is_demo := COALESCE(v_demo, false);
    RETURN NEW;
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'is_demo is immutable once written (%.%)', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'P0047',
            HINT = 'A demo record can never be reclassified as real. Purge it instead.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rods_days_is_demo ON public.rods_days;
CREATE TRIGGER trg_rods_days_is_demo
BEFORE INSERT OR UPDATE ON public.rods_days
FOR EACH ROW EXECUTE FUNCTION public.enforce_record_is_demo();

DROP TRIGGER IF EXISTS trg_eld_events_is_demo ON public.eld_malfunction_events;
CREATE TRIGGER trg_eld_events_is_demo
BEFORE INSERT OR UPDATE ON public.eld_malfunction_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_record_is_demo();

-- 3. Backstop: cannot clear operators.is_demo while certified demo logs exist
CREATE OR REPLACE FUNCTION public.enforce_demo_clear_requires_purge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_certified int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_demo = true AND NEW.is_demo = false THEN
    SELECT count(*) INTO v_certified
    FROM public.rods_days d
    WHERE d.operator_id = NEW.id AND d.is_demo = true AND d.certified_at IS NOT NULL;

    IF v_certified > 0 THEN
      RAISE EXCEPTION 'Cannot clear demo status: % certified demo log(s) exist', v_certified
        USING ERRCODE = 'P0048',
              HINT = 'Run reset-demo-driver to purge the demo logs, then clear the flag.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operators_demo_clear_purge ON public.operators;
CREATE TRIGGER trg_operators_demo_clear_purge
BEFORE UPDATE ON public.operators
FOR EACH ROW EXECUTE FUNCTION public.enforce_demo_clear_requires_purge();

-- 4. Demo operators may not mint officer-packet share tokens
CREATE OR REPLACE FUNCTION public.enforce_no_demo_share_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo boolean := false;
BEGIN
  IF NEW.scope = 'officer_packet' THEN
    SELECT COALESCE(o.is_demo, false) INTO v_demo
    FROM public.operators o
    WHERE o.id = NEW.resource_id;

    IF v_demo THEN
      RAISE EXCEPTION 'Demo operators cannot mint public share links'
        USING ERRCODE = 'P0049',
              HINT = 'Demo sessions show a preview of the link instead of creating one.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_share_tokens_no_demo ON public.share_tokens;
CREATE TRIGGER trg_share_tokens_no_demo
BEFORE INSERT ON public.share_tokens
FOR EACH ROW EXECUTE FUNCTION public.enforce_no_demo_share_tokens();