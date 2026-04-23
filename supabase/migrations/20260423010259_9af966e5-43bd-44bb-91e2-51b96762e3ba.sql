CREATE TABLE public.lease_terminations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id              uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  ica_contract_id          uuid REFERENCES public.ica_contracts(id),
  effective_date           date NOT NULL,
  reason                   text NOT NULL CHECK (reason IN ('voluntary','mutual','cause')),
  notes                    text,
  -- Snapshot of equipment + parties at time of signing
  truck_year               text,
  truck_make               text,
  truck_model              text,
  truck_vin                text,
  truck_plate              text,
  truck_plate_state        text,
  trailer_number           text,
  contractor_label         text,
  lease_effective_date     date,
  -- Carrier signature
  carrier_signed_by        uuid REFERENCES auth.users(id),
  carrier_typed_name       text,
  carrier_title            text,
  carrier_signature_url    text,
  carrier_signed_at        timestamptz NOT NULL DEFAULT now(),
  -- Reserved for optional contractor countersign (Phase 2)
  contractor_typed_name    text,
  contractor_signature_url text,
  contractor_signed_at     timestamptz,
  -- PDF storage + insurance tracking
  pdf_url                  text,
  pdf_path                 text,
  insurance_notified_at    timestamptz,
  insurance_recipients     text[],
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lease_terminations_operator ON public.lease_terminations (operator_id);
CREATE INDEX idx_lease_terminations_effective_date ON public.lease_terminations (effective_date DESC);

ALTER TABLE public.lease_terminations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage lease terminations"
  ON public.lease_terminations
  FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Operators view own terminations"
  ON public.lease_terminations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.operators
      WHERE id = lease_terminations.operator_id
        AND user_id = auth.uid()
    )
  );

CREATE TRIGGER set_lease_terminations_updated_at
  BEFORE UPDATE ON public.lease_terminations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();