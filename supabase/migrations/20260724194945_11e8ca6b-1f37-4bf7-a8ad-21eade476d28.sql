
-- =====================================================
-- 1. Enum for sheet status
-- =====================================================
DO $$ BEGIN
  CREATE TYPE public.osas_status AS ENUM ('draft','sent','signed','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.osas_device_type AS ENUM ('eld','dash_cam','bestpass');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- 2. onboard_assignment_sheets
-- =====================================================
CREATE TABLE IF NOT EXISTS public.onboard_assignment_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  unit_number text,
  assignment_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date,
  status public.osas_status NOT NULL DEFAULT 'draft',
  bestpass_included boolean NOT NULL DEFAULT false,
  bestpass_fee_cents integer,
  terms_version text NOT NULL DEFAULT 'v1',
  driver_signature_data_url text,
  driver_signature_name text,
  driver_ip text,
  signed_at timestamptz,
  sent_at timestamptz,
  signed_pdf_url text,
  access_token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osas_operator ON public.onboard_assignment_sheets(operator_id);
CREATE INDEX IF NOT EXISTS idx_osas_status ON public.onboard_assignment_sheets(status);
CREATE INDEX IF NOT EXISTS idx_osas_token ON public.onboard_assignment_sheets(access_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboard_assignment_sheets TO authenticated;
GRANT ALL ON public.onboard_assignment_sheets TO service_role;

ALTER TABLE public.onboard_assignment_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "osas_staff_all"
  ON public.onboard_assignment_sheets FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "osas_operator_select"
  ON public.onboard_assignment_sheets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = onboard_assignment_sheets.operator_id
        AND o.user_id = auth.uid()
    )
  );

-- Operator can only update the signature-related fields on their own sheet.
CREATE POLICY "osas_operator_sign"
  ON public.onboard_assignment_sheets FOR UPDATE
  TO authenticated
  USING (
    status = 'sent'
    AND EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = onboard_assignment_sheets.operator_id
        AND o.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('sent','signed')
    AND EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = onboard_assignment_sheets.operator_id
        AND o.user_id = auth.uid()
    )
  );

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_osas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_osas_updated_at ON public.onboard_assignment_sheets;
CREATE TRIGGER trg_osas_updated_at
BEFORE UPDATE ON public.onboard_assignment_sheets
FOR EACH ROW EXECUTE FUNCTION public.set_osas_updated_at();

-- =====================================================
-- 3. onboard_assignment_sheet_items
-- =====================================================
CREATE TABLE IF NOT EXISTS public.onboard_assignment_sheet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.onboard_assignment_sheets(id) ON DELETE CASCADE,
  device_type public.osas_device_type NOT NULL,
  equipment_id uuid REFERENCES public.equipment_items(id) ON DELETE SET NULL,
  serial_snapshot text NOT NULL,
  driver_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osas_items_sheet ON public.onboard_assignment_sheet_items(sheet_id);
CREATE INDEX IF NOT EXISTS idx_osas_items_equipment ON public.onboard_assignment_sheet_items(equipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboard_assignment_sheet_items TO authenticated;
GRANT ALL ON public.onboard_assignment_sheet_items TO service_role;

ALTER TABLE public.onboard_assignment_sheet_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "osas_items_staff_all"
  ON public.onboard_assignment_sheet_items FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "osas_items_operator_select"
  ON public.onboard_assignment_sheet_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.onboard_assignment_sheets s
      JOIN public.operators o ON o.id = s.operator_id
      WHERE s.id = onboard_assignment_sheet_items.sheet_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "osas_items_operator_confirm"
  ON public.onboard_assignment_sheet_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.onboard_assignment_sheets s
      JOIN public.operators o ON o.id = s.operator_id
      WHERE s.id = onboard_assignment_sheet_items.sheet_id
        AND o.user_id = auth.uid()
        AND s.status = 'sent'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.onboard_assignment_sheets s
      JOIN public.operators o ON o.id = s.operator_id
      WHERE s.id = onboard_assignment_sheet_items.sheet_id
        AND o.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. Retire legacy asset-sheet signature function
-- =====================================================
DROP FUNCTION IF EXISTS public.execute_equipment_asset_signature(uuid, text, text);
