-- 1. brokers: carrier packet, agreement, do-not-load, rating -----------------
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS carrier_packet_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carrier_packet_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier_packet_completed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS broker_agreement_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS broker_agreement_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS broker_agreement_recorded_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS broker_agreement_document_id uuid REFERENCES public.broker_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS do_not_load boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_load_reason text,
  ADD COLUMN IF NOT EXISTS do_not_load_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS do_not_load_set_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rating smallint;

CREATE INDEX IF NOT EXISTS brokers_do_not_load_idx ON public.brokers (do_not_load) WHERE do_not_load;

-- 2. contact role enum ------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'broker_contact_role') THEN
    CREATE TYPE public.broker_contact_role AS ENUM
      ('dispatch', 'accounts_payable', 'claims', 'after_hours', 'other');
  END IF;
END $$;

-- 3. broker_contacts --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role public.broker_contact_role NOT NULL DEFAULT 'other',
  phone text,
  email text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_contacts TO authenticated;
GRANT ALL ON public.broker_contacts TO service_role;
ALTER TABLE public.broker_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_contacts_mgmt_all ON public.broker_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY broker_contacts_staff_select ON public.broker_contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE POLICY broker_contacts_staff_insert ON public.broker_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE POLICY broker_contacts_staff_update ON public.broker_contacts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE POLICY broker_contacts_staff_delete ON public.broker_contacts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE INDEX IF NOT EXISTS broker_contacts_broker_role_idx ON public.broker_contacts (broker_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS broker_contacts_one_primary_idx
  ON public.broker_contacts (broker_id) WHERE is_primary;

CREATE TRIGGER update_broker_contacts_updated_at
  BEFORE UPDATE ON public.broker_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. broker_notes: running attributed record --------------------------------
CREATE TABLE IF NOT EXISTS public.broker_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_notes TO authenticated;
GRANT ALL ON public.broker_notes TO service_role;
ALTER TABLE public.broker_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_notes_mgmt_all ON public.broker_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY broker_notes_staff_select ON public.broker_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE POLICY broker_notes_staff_insert ON public.broker_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

-- Author-only edits: staff may correct their own note, never someone else's.
CREATE POLICY broker_notes_author_update ON public.broker_notes
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
    AND created_by = public.current_profile_id()
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
    AND created_by = public.current_profile_id()
  );

CREATE POLICY broker_notes_author_delete ON public.broker_notes
  FOR DELETE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'))
    AND created_by = public.current_profile_id()
  );

CREATE INDEX IF NOT EXISTS broker_notes_broker_created_idx
  ON public.broker_notes (broker_id, created_at DESC);

CREATE TRIGGER update_broker_notes_updated_at
  BEFORE UPDATE ON public.broker_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. do-not-load history ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_do_not_load_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  previous_value boolean,
  new_value boolean NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT ON public.broker_do_not_load_history TO authenticated;
GRANT ALL ON public.broker_do_not_load_history TO service_role;
ALTER TABLE public.broker_do_not_load_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_dnl_history_mgmt_select ON public.broker_do_not_load_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY broker_dnl_history_staff_select ON public.broker_do_not_load_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'onboarding_staff'));

CREATE INDEX IF NOT EXISTS broker_dnl_history_broker_idx
  ON public.broker_do_not_load_history (broker_id, changed_at DESC);

-- 6. server-side actor stamping + validation on brokers ---------------------
CREATE OR REPLACE FUNCTION public.stamp_brokers_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
BEGIN
  IF NEW.rating IS NOT NULL AND (NEW.rating < 1 OR NEW.rating > 5) THEN
    RAISE EXCEPTION
      'Broker rating must be a whole number from 1 to 5 (received %).', NEW.rating
      USING ERRCODE = '23514',
            HINT = 'Clear the rating to leave it unset, or choose a value between 1 and 5.';
  END IF;

  IF NEW.do_not_load AND COALESCE(btrim(NEW.do_not_load_reason), '') = '' THEN
    RAISE EXCEPTION
      'A do-not-load reason is required when a broker is flagged do-not-load.'
      USING ERRCODE = '23514',
            HINT = 'Enter why this broker is flagged before saving.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, v_actor);
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by);
    NEW.carrier_packet_completed_at :=
      CASE WHEN NEW.carrier_packet_completed THEN COALESCE(NEW.carrier_packet_completed_at, now()) ELSE NULL END;
    NEW.carrier_packet_completed_by :=
      CASE WHEN NEW.carrier_packet_completed THEN v_actor ELSE NULL END;
    NEW.broker_agreement_signed_at :=
      CASE WHEN NEW.broker_agreement_signed THEN COALESCE(NEW.broker_agreement_signed_at, now()) ELSE NULL END;
    NEW.broker_agreement_recorded_by :=
      CASE WHEN NEW.broker_agreement_signed THEN v_actor ELSE NULL END;
    NEW.do_not_load_set_at := CASE WHEN NEW.do_not_load THEN now() ELSE NULL END;
    NEW.do_not_load_set_by := CASE WHEN NEW.do_not_load THEN v_actor ELSE NULL END;
    RETURN NEW;
  END IF;

  NEW.created_by := OLD.created_by;
  NEW.updated_by := COALESCE(v_actor, OLD.updated_by);

  -- Packet: stamp on transition, preserve otherwise, clear when unset.
  IF NEW.carrier_packet_completed IS DISTINCT FROM OLD.carrier_packet_completed THEN
    IF NEW.carrier_packet_completed THEN
      NEW.carrier_packet_completed_at := COALESCE(NEW.carrier_packet_completed_at, now());
      NEW.carrier_packet_completed_by := v_actor;
    ELSE
      NEW.carrier_packet_completed_at := NULL;
      NEW.carrier_packet_completed_by := NULL;
    END IF;
  ELSE
    NEW.carrier_packet_completed_by := OLD.carrier_packet_completed_by;
    IF NEW.carrier_packet_completed_at IS NULL THEN
      NEW.carrier_packet_completed_at := OLD.carrier_packet_completed_at;
    END IF;
  END IF;

  IF NEW.broker_agreement_signed IS DISTINCT FROM OLD.broker_agreement_signed THEN
    IF NEW.broker_agreement_signed THEN
      NEW.broker_agreement_signed_at := COALESCE(NEW.broker_agreement_signed_at, now());
      NEW.broker_agreement_recorded_by := v_actor;
    ELSE
      NEW.broker_agreement_signed_at := NULL;
      NEW.broker_agreement_recorded_by := NULL;
    END IF;
  ELSE
    NEW.broker_agreement_recorded_by := OLD.broker_agreement_recorded_by;
    IF NEW.broker_agreement_signed_at IS NULL THEN
      NEW.broker_agreement_signed_at := OLD.broker_agreement_signed_at;
    END IF;
  END IF;

  IF NEW.do_not_load IS DISTINCT FROM OLD.do_not_load THEN
    NEW.do_not_load_set_at := CASE WHEN NEW.do_not_load THEN now() ELSE NULL END;
    NEW.do_not_load_set_by := CASE WHEN NEW.do_not_load THEN v_actor ELSE NULL END;
  ELSE
    NEW.do_not_load_set_at := OLD.do_not_load_set_at;
    NEW.do_not_load_set_by := OLD.do_not_load_set_by;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_brokers_actor() FROM public, anon;

DROP TRIGGER IF EXISTS stamp_brokers_actor ON public.brokers;
CREATE TRIGGER stamp_brokers_actor
  BEFORE INSERT OR UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_brokers_actor();

CREATE OR REPLACE FUNCTION public.log_broker_do_not_load_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  INSERT INTO public.broker_do_not_load_history
    (broker_id, previous_value, new_value, reason, changed_by)
  VALUES (NEW.id, OLD.do_not_load, NEW.do_not_load, NEW.do_not_load_reason, public.current_profile_id());
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_broker_do_not_load_change() FROM public, anon;

DROP TRIGGER IF EXISTS log_brokers_do_not_load_change ON public.brokers;
CREATE TRIGGER log_brokers_do_not_load_change
  AFTER UPDATE OF do_not_load ON public.brokers
  FOR EACH ROW
  WHEN (OLD.do_not_load IS DISTINCT FROM NEW.do_not_load)
  EXECUTE FUNCTION public.log_broker_do_not_load_change();

-- Stamp actors on the new child tables too.
CREATE OR REPLACE FUNCTION public.stamp_broker_child_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(v_actor, NEW.created_by);
    NEW.updated_by := NEW.created_by;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(v_actor, OLD.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_broker_child_actor() FROM public, anon;

CREATE TRIGGER stamp_broker_contacts_actor
  BEFORE INSERT OR UPDATE ON public.broker_contacts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_broker_child_actor();

CREATE TRIGGER stamp_broker_notes_actor
  BEFORE INSERT OR UPDATE ON public.broker_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_broker_child_actor();