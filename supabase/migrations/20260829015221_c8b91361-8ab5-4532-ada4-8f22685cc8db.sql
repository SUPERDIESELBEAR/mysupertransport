DO $$ BEGIN
  CREATE TYPE public.loadout_sticker_state AS ENUM ('recorded', 'unreadable', 'not_found');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.load_documents
  ADD COLUMN IF NOT EXISTS inspection_sticker_state public.loadout_sticker_state,
  ADD COLUMN IF NOT EXISTS inspection_sticker_expiry date;

ALTER TABLE public.load_documents
  DROP CONSTRAINT IF EXISTS load_documents_sticker_expiry_requires_recorded;
ALTER TABLE public.load_documents
  ADD CONSTRAINT load_documents_sticker_expiry_requires_recorded
  CHECK (inspection_sticker_expiry IS NULL OR inspection_sticker_state = 'recorded');

ALTER TABLE public.load_documents
  DROP CONSTRAINT IF EXISTS load_documents_sticker_pickup_only;
ALTER TABLE public.load_documents
  ADD CONSTRAINT load_documents_sticker_pickup_only
  CHECK (inspection_sticker_state IS NULL OR document_type = 'loadout_pickup_inspection');

CREATE OR REPLACE FUNCTION public.record_loadout_damage_flag(_load_id uuid, _note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_flag_id uuid;
  v_note text := nullif(btrim(coalesce(_note, '')), '');
  v_is_staff boolean;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'No profile for the current user';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'A damage note is required';
  END IF;

  v_is_staff := public.has_role(auth.uid(), 'management'::public.app_role)
             OR public.has_role(auth.uid(), 'owner'::public.app_role)
             OR public.has_role(auth.uid(), 'dispatcher'::public.app_role);

  IF NOT v_is_staff THEN
    PERFORM 1
      FROM public.loads l
      JOIN public.operators o ON o.id = l.operator_id
     WHERE l.id = _load_id AND o.user_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not permitted for this load';
    END IF;
  END IF;

  -- One WATCH flag per load: a second damage note appends to the record it
  -- already has rather than manufacturing a duplicate claim.
  SELECT cf.id INTO v_flag_id
    FROM public.claim_flags cf
   WHERE cf.load_id = _load_id
     AND cf.is_active
     AND cf.flag_level = 'watch'::public.claim_flag_level
     AND cf.claim_type = 'damaged_goods'::public.claim_type
   ORDER BY cf.reported_at
   LIMIT 1;

  IF v_flag_id IS NULL THEN
    INSERT INTO public.claim_flags (
      load_id, flag_level, claim_type, reported_at, description, is_active, created_by, updated_by
    ) VALUES (
      _load_id, 'watch'::public.claim_flag_level, 'damaged_goods'::public.claim_type,
      now(), 'Trailer damage noted on loadout inspection: ' || v_note, true, v_profile, v_profile
    )
    RETURNING id INTO v_flag_id;
  ELSE
    UPDATE public.claim_flags
       SET description = description || E'\n' || v_note,
           updated_by = v_profile,
           updated_at = now()
     WHERE id = v_flag_id;
  END IF;

  RETURN v_flag_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_loadout_damage_flag(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_loadout_damage_flag(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_loadout_damage_flag(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_loadout_damage_flag(uuid, text) TO service_role;