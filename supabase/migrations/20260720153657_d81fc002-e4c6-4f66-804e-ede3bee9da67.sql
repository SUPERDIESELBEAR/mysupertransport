
-- ============================================================
-- ICA Amendments — schema, RLS, triggers
-- ============================================================

-- 1) Parent amendment table
CREATE TABLE public.ica_amendments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id           UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  parent_ica_id         UUID NOT NULL REFERENCES public.ica_contracts(id) ON DELETE RESTRICT,
  amendment_number      INTEGER NOT NULL,
  action                TEXT NOT NULL CHECK (action IN ('add_unit','replace_unit')),
  effective_date        DATE,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent_to_operator','operator_signed','active','voided')),
  notes                 TEXT,

  -- Operator (contractor) signature
  operator_signature_url   TEXT,
  operator_signed_at       TIMESTAMPTZ,
  operator_typed_name      TEXT,

  -- Carrier signature
  carrier_signature_url    TEXT,
  carrier_signed_at        TIMESTAMPTZ,
  carrier_signed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  carrier_typed_name       TEXT,
  carrier_title            TEXT,

  -- PDF artifact (optional; generated when finalized)
  pdf_path              TEXT,
  pdf_url               TEXT,

  -- Bookkeeping
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at          TIMESTAMPTZ,
  voided_at             TIMESTAMPTZ,
  voided_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (operator_id, amendment_number)
);

CREATE INDEX ica_amendments_operator_idx    ON public.ica_amendments (operator_id);
CREATE INDEX ica_amendments_parent_ica_idx  ON public.ica_amendments (parent_ica_id);
CREATE INDEX ica_amendments_status_idx      ON public.ica_amendments (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ica_amendments TO authenticated;
GRANT ALL ON public.ica_amendments TO service_role;

ALTER TABLE public.ica_amendments ENABLE ROW LEVEL SECURITY;

-- Operator can view their own amendments
CREATE POLICY "Operators can view their own amendments"
ON public.ica_amendments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = ica_amendments.operator_id
      AND o.user_id = auth.uid()
  )
);

-- Operator can sign their own pending amendment (limited via trigger)
CREATE POLICY "Operators can sign their own amendment"
ON public.ica_amendments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = ica_amendments.operator_id
      AND o.user_id = auth.uid()
  )
  AND status IN ('sent_to_operator','operator_signed')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = ica_amendments.operator_id
      AND o.user_id = auth.uid()
  )
);

-- Staff can view all
CREATE POLICY "Staff can view all amendments"
ON public.ica_amendments
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Staff (management/owner) can create/edit/void
CREATE POLICY "Staff can insert amendments"
ON public.ica_amendments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);

CREATE POLICY "Staff can update amendments"
ON public.ica_amendments
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);

CREATE POLICY "Staff can delete draft amendments"
ON public.ica_amendments
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
  AND status = 'draft'
);


-- 2) Amendment unit rows
CREATE TABLE public.ica_amendment_units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amendment_id      UUID NOT NULL REFERENCES public.ica_amendments(id) ON DELETE CASCADE,
  change_type       TEXT NOT NULL CHECK (change_type IN ('added','removed')),
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  unit_number       TEXT,
  truck_year        TEXT,
  truck_make        TEXT,
  truck_model       TEXT,
  truck_vin         TEXT,
  truck_plate       TEXT,
  truck_plate_state TEXT,
  trailer_number    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ica_amendment_units_amendment_idx ON public.ica_amendment_units (amendment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ica_amendment_units TO authenticated;
GRANT ALL ON public.ica_amendment_units TO service_role;

ALTER TABLE public.ica_amendment_units ENABLE ROW LEVEL SECURITY;

-- Operator can read unit rows tied to their own amendments
CREATE POLICY "Operators can view their own amendment units"
ON public.ica_amendment_units
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ica_amendments a
    JOIN public.operators o ON o.id = a.operator_id
    WHERE a.id = ica_amendment_units.amendment_id
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view all amendment units"
ON public.ica_amendment_units
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage amendment units"
ON public.ica_amendment_units
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
)
WITH CHECK (
  public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'owner')
);


-- 3) updated_at triggers
CREATE TRIGGER trg_ica_amendments_updated_at
BEFORE UPDATE ON public.ica_amendments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_ica_amendment_units_updated_at
BEFORE UPDATE ON public.ica_amendment_units
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4) Auto-assign amendment_number per operator
CREATE OR REPLACE FUNCTION public.assign_ica_amendment_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.amendment_number IS NULL OR NEW.amendment_number = 0 THEN
    SELECT COALESCE(MAX(amendment_number), 0) + 1
      INTO next_num
      FROM public.ica_amendments
      WHERE operator_id = NEW.operator_id;
    NEW.amendment_number := next_num;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_ica_amendment_number
BEFORE INSERT ON public.ica_amendments
FOR EACH ROW EXECUTE FUNCTION public.assign_ica_amendment_number();


-- 5) Enforce: parent ICA must be signed/active; only one pending amendment per operator
CREATE OR REPLACE FUNCTION public.validate_ica_amendment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_status TEXT;
  pending_count INTEGER;
BEGIN
  -- Only validate on INSERT or when a new "pending" row is being created
  IF (TG_OP = 'INSERT') THEN
    SELECT status INTO parent_status
      FROM public.ica_contracts
      WHERE id = NEW.parent_ica_id;

    IF parent_status IS NULL THEN
      RAISE EXCEPTION 'Parent ICA % not found', NEW.parent_ica_id;
    END IF;

    IF parent_status NOT IN ('signed','active','completed') THEN
      RAISE EXCEPTION 'Cannot amend an ICA in status %; parent ICA must be signed/active', parent_status;
    END IF;

    IF NEW.status IN ('draft','sent_to_operator','operator_signed') THEN
      SELECT COUNT(*) INTO pending_count
        FROM public.ica_amendments
        WHERE operator_id = NEW.operator_id
          AND status IN ('draft','sent_to_operator','operator_signed');
      IF pending_count > 0 THEN
        RAISE EXCEPTION 'Operator already has a pending ICA amendment; finalize or void it before creating another';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ica_amendment
BEFORE INSERT ON public.ica_amendments
FOR EACH ROW EXECUTE FUNCTION public.validate_ica_amendment();


-- 6) On status → 'active': auto-terminate removed units, mirror primary added unit to onboarding_status
CREATE OR REPLACE FUNCTION public.on_ica_amendment_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u RECORD;
  primary_added RECORD;
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    NEW.activated_at := now();

    -- Set cascade flag so onboarding_status self-update guard is bypassed
    PERFORM set_config('app.ica_sync_cascade', 'true', true);

    -- 1. For each removed unit → create a lease_terminations row
    FOR u IN
      SELECT * FROM public.ica_amendment_units
      WHERE amendment_id = NEW.id AND change_type = 'removed'
    LOOP
      INSERT INTO public.lease_terminations (
        operator_id,
        ica_contract_id,
        effective_date,
        reason,
        notes,
        truck_year, truck_make, truck_model, truck_vin,
        truck_plate, truck_plate_state, trailer_number,
        carrier_signature_url,
        carrier_signed_at,
        carrier_signed_by,
        carrier_typed_name,
        carrier_title,
        contractor_signature_url,
        contractor_signed_at,
        contractor_typed_name,
        contractor_label,
        lease_effective_date
      ) VALUES (
        NEW.operator_id,
        NEW.parent_ica_id,
        COALESCE(NEW.effective_date, CURRENT_DATE),
        'unit_replaced',
        'Partial termination — unit replaced via ICA Amendment #' || NEW.amendment_number,
        u.truck_year, u.truck_make, u.truck_model, u.truck_vin,
        u.truck_plate, u.truck_plate_state, u.trailer_number,
        NEW.carrier_signature_url,
        COALESCE(NEW.carrier_signed_at, now()),
        NEW.carrier_signed_by,
        NEW.carrier_typed_name,
        NEW.carrier_title,
        NEW.operator_signature_url,
        NEW.operator_signed_at,
        NEW.operator_typed_name,
        'Contractor',
        (SELECT lease_effective_date FROM public.ica_contracts WHERE id = NEW.parent_ica_id)
      );
    END LOOP;

    -- 2. Mirror primary added unit → onboarding_status
    SELECT * INTO primary_added
      FROM public.ica_amendment_units
      WHERE amendment_id = NEW.id AND change_type = 'added'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1;

    IF primary_added.id IS NOT NULL THEN
      UPDATE public.onboarding_status
      SET truck_year        = COALESCE(NULLIF(primary_added.truck_year, ''), truck_year),
          truck_make        = COALESCE(NULLIF(primary_added.truck_make, ''), truck_make),
          truck_vin         = COALESCE(NULLIF(primary_added.truck_vin,  ''), truck_vin),
          truck_plate       = COALESCE(NULLIF(primary_added.truck_plate,''), truck_plate),
          truck_plate_state = COALESCE(NULLIF(primary_added.truck_plate_state,''), truck_plate_state),
          trailer_number    = COALESCE(NULLIF(primary_added.trailer_number,''), trailer_number),
          unit_number       = COALESCE(NULLIF(primary_added.unit_number,   ''), unit_number),
          updated_at        = now()
      WHERE operator_id = NEW.operator_id;

      UPDATE public.operators
      SET unit_number = COALESCE(NULLIF(primary_added.unit_number, ''), unit_number),
          updated_at  = now()
      WHERE id = NEW.operator_id;
    END IF;

    -- 3. Audit log
    INSERT INTO public.audit_log (
      actor_id, action, entity_type, entity_id, entity_label, metadata
    ) VALUES (
      auth.uid(),
      'ica_amendment_activated',
      'ica_amendment',
      NEW.id,
      'Amendment #' || NEW.amendment_number,
      jsonb_build_object(
        'operator_id', NEW.operator_id,
        'parent_ica_id', NEW.parent_ica_id,
        'action', NEW.action,
        'effective_date', NEW.effective_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_ica_amendment_activated
BEFORE UPDATE ON public.ica_amendments
FOR EACH ROW EXECUTE FUNCTION public.on_ica_amendment_activated();


-- 7) Convenience view: currently-active units per operator (parent ICA + all active amendments minus removed)
CREATE OR REPLACE VIEW public.v_operator_active_units
WITH (security_invoker = on)
AS
WITH base_units AS (
  -- Original ICA unit
  SELECT
    c.operator_id,
    c.id                    AS source_id,
    'ica_contract'::text    AS source_type,
    NULL::integer           AS amendment_number,
    NULL::text              AS unit_number,
    c.truck_year, c.truck_make, c.truck_model, c.truck_vin,
    c.truck_plate, c.truck_plate_state, c.trailer_number,
    c.lease_effective_date  AS added_on
  FROM public.ica_contracts c
  WHERE c.status IN ('signed','active','completed')

  UNION ALL

  -- Units added by active amendments
  SELECT
    a.operator_id,
    u.id                    AS source_id,
    'amendment_added'::text AS source_type,
    a.amendment_number,
    u.unit_number,
    u.truck_year, u.truck_make, u.truck_model, u.truck_vin,
    u.truck_plate, u.truck_plate_state, u.trailer_number,
    a.effective_date        AS added_on
  FROM public.ica_amendments a
  JOIN public.ica_amendment_units u ON u.amendment_id = a.id
  WHERE a.status = 'active' AND u.change_type = 'added'
),
removed_vins AS (
  SELECT a.operator_id, LOWER(REPLACE(u.truck_vin, ' ', '')) AS vin_norm
  FROM public.ica_amendments a
  JOIN public.ica_amendment_units u ON u.amendment_id = a.id
  WHERE a.status = 'active' AND u.change_type = 'removed' AND u.truck_vin IS NOT NULL
)
SELECT b.*
FROM base_units b
WHERE NOT EXISTS (
  SELECT 1 FROM removed_vins r
  WHERE r.operator_id = b.operator_id
    AND b.truck_vin IS NOT NULL
    AND LOWER(REPLACE(b.truck_vin, ' ', '')) = r.vin_norm
);

GRANT SELECT ON public.v_operator_active_units TO authenticated, service_role;
