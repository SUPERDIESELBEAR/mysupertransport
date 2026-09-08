CREATE TABLE public.fuel_disagreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.fuel_transactions(id) ON DELETE CASCADE,
  disagreement_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL,
  accepted_by uuid NOT NULL REFERENCES public.profiles(id),
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fuel_disagreement_acceptances TO authenticated;
GRANT ALL ON public.fuel_disagreement_acceptances TO service_role;

ALTER TABLE public.fuel_disagreement_acceptances ENABLE ROW LEVEL SECURITY;

-- Staff read it; nobody writes it through the Data API. The only writer is the
-- SECURITY DEFINER RPC below, which runs as owner and bypasses these policies.
CREATE POLICY fuel_disagreement_acceptances_read_staff
  ON public.fuel_disagreement_acceptances FOR SELECT TO authenticated
  USING ((SELECT public.is_staff(auth.uid())));

CREATE INDEX fuel_disagreement_acceptances_tx_idx
  ON public.fuel_disagreement_acceptances (transaction_id, accepted_at DESC);

-- Acceptance is an annotation, not an erasure: append-only, forever.
CREATE OR REPLACE FUNCTION public.enforce_fuel_acceptance_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RAISE EXCEPTION 'fuel_disagreement_acceptances is append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_fuel_acceptance_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fuel_disagreement_acceptances_append_only
  BEFORE UPDATE OR DELETE ON public.fuel_disagreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fuel_acceptance_append_only();

/*
 * accept_fuel_disagreement — the ONLY writer.
 *
 * A fuel file is a third party's report about what happened at a pump. Letting
 * it edit equipment records would make MultiService authoritative over
 * SUPERTRANSPORT's own data, and the whole matching design rests on the
 * opposite: the card is authoritative, the printed unit and name are
 * confirmation only. Accepting records that a human LOOKED, not that the file
 * was right. It therefore writes ONE row into ONE table and touches nothing in
 * operators, onboarding_status, profiles, equipment_items or
 * equipment_assignments -- not even fuel_transactions, so the row stays flagged.
 */
CREATE OR REPLACE FUNCTION public.accept_fuel_disagreement(_transaction_id uuid, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_tx    public.fuel_transactions;
  v_id    uuid;
BEGIN
  -- 1. actor server-side, never a parameter
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. management or owner, checked in the body
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 3. refuse-only contract
  SELECT * INTO v_tx FROM public.fuel_transactions t WHERE t.id = _transaction_id;
  IF v_tx.id IS NULL THEN
    RAISE EXCEPTION 'Fuel transaction not found';
  END IF;
  IF v_tx.match_status <> 'matched_with_disagreement' THEN
    RAISE EXCEPTION 'That transaction has no disagreement to accept';
  END IF;
  IF NULLIF(btrim(COALESCE(_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A note is required';
  END IF;

  INSERT INTO public.fuel_disagreement_acceptances
    (transaction_id, disagreement_fields, note, accepted_by)
  VALUES (v_tx.id, v_tx.disagreement_fields, btrim(_note), v_actor)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'transaction_id', v_tx.id,
                            'match_status', v_tx.match_status);
END;
$$;

-- 4. reachable only by signed-in callers; PUBLIC and anon revoked explicitly
REVOKE ALL ON FUNCTION public.accept_fuel_disagreement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_fuel_disagreement(uuid, text) TO authenticated;