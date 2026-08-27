-- Module 5, Pass 1 — the detention CLAIM RECORD.
--
-- Detention at SUPERTRANSPORT is negotiated, not computed. The driver calls,
-- the dispatcher emails the broker, and if the chase works a REVISED RATE
-- CONFIRMATION arrives with detention on it — which the existing parse path
-- already turns into a load_charges row. Nothing here computes hours, derives
-- eligibility, or creates a charge. This table records the CONVERSATION, which
-- is the part that gets dropped when a dispatcher gets busy.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detention_claim_status') THEN
    -- 'abandoned' is not optional: most claims die quietly, and a status set
    -- that cannot say so records them as open forever.
    CREATE TYPE public.detention_claim_status AS ENUM (
      'open', 'notified', 'in_discussion', 'resolved_revision', 'denied', 'abandoned'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detention_notification_method') THEN
    CREATE TYPE public.detention_notification_method AS ENUM (
      'email', 'phone', 'text', 'load_board'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.detention_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  load_stop_id uuid REFERENCES public.load_stops(id) ON DELETE SET NULL,
  driver_reported_at timestamptz NOT NULL,
  reported_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  broker_notified_at timestamptz,
  notified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_method public.detention_notification_method,
  status public.detention_claim_status NOT NULL DEFAULT 'open',
  resolution_note text,
  -- The only link between a claim and the money it produced. Set BY HAND when
  -- a revised con lands; nothing matches charges to claims automatically.
  resulting_charge_id uuid REFERENCES public.load_charges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS detention_claims_load_id_idx ON public.detention_claims (load_id);
CREATE INDEX IF NOT EXISTS detention_claims_status_idx ON public.detention_claims (status);

GRANT SELECT, INSERT, UPDATE ON public.detention_claims TO authenticated;
GRANT ALL ON public.detention_claims TO service_role;

ALTER TABLE public.detention_claims ENABLE ROW LEVEL SECURITY;

-- Operators have NO access in this pass. Deliberate: the driver-facing view of
-- his own claims belongs with the driver app, and a read policy written now
-- would be a guess at that surface.
DROP POLICY IF EXISTS "Dispatch staff read detention claims" ON public.detention_claims;
CREATE POLICY "Dispatch staff read detention claims"
ON public.detention_claims FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);

DROP POLICY IF EXISTS "Dispatch staff raise detention claims" ON public.detention_claims;
CREATE POLICY "Dispatch staff raise detention claims"
ON public.detention_claims FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);

DROP POLICY IF EXISTS "Dispatch staff update detention claims" ON public.detention_claims;
CREATE POLICY "Dispatch staff update detention claims"
ON public.detention_claims FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
)
WITH CHECK (
  public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);

-- Actor stamping, server side. current_profile_id(), never auth.uid(): these
-- columns are foreign keys to profiles(id), and the auth user id is a
-- different uuid that raises 23503 on write.
CREATE OR REPLACE FUNCTION public.stamp_detention_claim_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile uuid;
BEGIN
  v_profile := public.current_profile_id();

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_profile;
    NEW.updated_by := v_profile;
    -- Whoever logs the call is who took it, unless the dispatcher says
    -- otherwise (claims are often typed up by someone else afterwards).
    NEW.reported_to := COALESCE(NEW.reported_to, v_profile);
    IF NEW.broker_notified_at IS NULL THEN
      NEW.notified_by := NULL;
      NEW.notification_method := NULL;
    ELSE
      NEW.notified_by := COALESCE(NEW.notified_by, v_profile);
    END IF;
    RETURN NEW;
  END IF;

  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  NEW.updated_by := v_profile;

  IF NEW.broker_notified_at IS NULL THEN
    NEW.notified_by := NULL;
    NEW.notification_method := NULL;
  ELSIF NEW.broker_notified_at IS DISTINCT FROM OLD.broker_notified_at
        AND NEW.notified_by IS NULL THEN
    NEW.notified_by := v_profile;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS stamp_detention_claim_actor ON public.detention_claims;
CREATE TRIGGER stamp_detention_claim_actor
BEFORE INSERT OR UPDATE ON public.detention_claims
FOR EACH ROW EXECUTE FUNCTION public.stamp_detention_claim_actor();
