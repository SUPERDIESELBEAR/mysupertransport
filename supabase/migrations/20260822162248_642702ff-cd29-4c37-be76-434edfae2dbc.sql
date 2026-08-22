-- Verbatim capture of broker-authored text, plus structured load references.
--
-- Why: re-parsing a revised rate confirmation produced a different condensed
-- rewrite of the broker's terms and stop comments on every run, so an unchanged
-- document reported changes that were not on the page, and the rewrite was
-- lossy (a phone number and an email address went missing between passes).
-- Broker-authored text is now stored exactly as printed; any condensed version
-- is derived at render time.
--
-- References move out of the single reference_number column into rows keyed on
-- (class, value), with a citation for every stop the value is printed against.
-- One number printed as BOL, PRO and load number is three separate lookups to a
-- broker's AP and tracing desks, and each has to survive.

ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS special_instructions_verbatim text,
  ADD COLUMN IF NOT EXISTS broker_terms_verbatim text,
  -- Categorical attribute printed in a References table ("Mode: TL"). Not an
  -- identifier: storing it as a reference row would fire duplicate warnings
  -- across unrelated loads.
  ADD COLUMN IF NOT EXISTS mode text;

ALTER TABLE public.load_stops
  ADD COLUMN IF NOT EXISTS stop_notes_verbatim text;

COMMENT ON COLUMN public.loads.special_instructions_verbatim IS
  'The Special Instructions block exactly as printed. System of record; loads.special_instructions is a display summary.';
COMMENT ON COLUMN public.loads.broker_terms_verbatim IS
  'The broker terms paragraph exactly as printed. Kept separate from special instructions on purpose.';
COMMENT ON COLUMN public.loads.mode IS
  'Categorical transport mode as printed (TL, LTL, ...). Never stored as a reference.';

CREATE TABLE IF NOT EXISTS public.load_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  -- Normalized identifying class: bol, pro, pickup, po, delivery, order,
  -- shipment, appointment, seal, trailer, other.
  reference_class text NOT NULL,
  -- The label as printed, so the document can be read back faithfully.
  label text NOT NULL,
  value text NOT NULL,
  -- Case/punctuation-insensitive form, used for matching and dedup.
  value_key text NOT NULL,
  source text NOT NULL DEFAULT 'rate_confirmation',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (load_id, reference_class, value_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.load_references TO authenticated;
GRANT ALL ON public.load_references TO service_role;
ALTER TABLE public.load_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatch staff manage load references"
  ON public.load_references FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'owner')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'owner')
  );

CREATE POLICY "Operators read references on their own loads"
  ON public.load_references FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loads l
     WHERE l.id = load_references.load_id
       AND l.operator_id IN (SELECT o.id FROM public.operators o WHERE o.user_id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS load_references_load_idx ON public.load_references(load_id);
CREATE INDEX IF NOT EXISTS load_references_value_idx ON public.load_references(value_key);

-- Where a reference is printed. A load-level References row that also appears in
-- a stop comment is ONE reference with a citation, not two rows.
CREATE TABLE IF NOT EXISTS public.load_reference_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES public.load_references(id) ON DELETE CASCADE,
  load_stop_id uuid REFERENCES public.load_stops(id) ON DELETE CASCADE,
  -- Stop sequence as printed, kept for documents whose stop rows are not saved yet.
  stop_sequence int,
  printed_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.load_reference_citations TO authenticated;
GRANT ALL ON public.load_reference_citations TO service_role;
ALTER TABLE public.load_reference_citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatch staff manage reference citations"
  ON public.load_reference_citations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'owner')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'management')
    OR public.has_role(auth.uid(),'owner')
  );

CREATE POLICY "Operators read citations on their own loads"
  ON public.load_reference_citations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.load_references r
      JOIN public.loads l ON l.id = r.load_id
     WHERE r.id = load_reference_citations.reference_id
       AND l.operator_id IN (SELECT o.id FROM public.operators o WHERE o.user_id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS load_reference_citations_ref_idx
  ON public.load_reference_citations(reference_id);