DO $$
DECLARE
  v_op uuid := 'ee993ec0-e0a2-4d0f-aa05-6d22eb931405';
  v_user uuid := '7e356f94-ce4a-47aa-8883-0e6b01d09aab';
  v_day_a uuid;
  v_day_b public.rods_days;
  v_res public.rods_days;
  v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);
  IF auth.uid() <> v_user THEN RAISE EXCEPTION 'fixture: auth.uid() not established'; END IF;

  -- Day A: keyed log, all twelve guarded header fields populated.
  INSERT INTO public.rods_days (
    operator_id, log_date, record_source, status, locked,
    total_miles_driving_today, truck_number, carrier_name, carrier_usdot, carrier_mc,
    main_office_address, home_terminal_address, home_terminal_timezone,
    from_location, to_location, co_driver_name, shipping_document_no
  ) VALUES (
    v_op, DATE '2001-01-02', 'keyed', 'draft', false,
    412, 'SCRATCH-1', 'SUPERTRANSPORT', '2309365', '788425',
    '1 Main St, Springfield MO', '1 Terminal Rd, Springfield MO', 'America/Chicago',
    'Springfield MO', 'Joplin MO', 'None', 'SCRATCH-BOL-1'
  ) RETURNING id INTO v_day_a;

  -- Events tile 00:00-24:00 except a deliberate 600-720 gap.
  INSERT INTO public.rods_events (rods_day_id, start_minute, end_minute, duty_status, city, state) VALUES
    (v_day_a,   0,  360, 1, 'Springfield', 'MO'),
    (v_day_a, 360,  600, 3, 'Springfield', 'MO'),
    (v_day_a, 720, 1080, 3, 'Joplin', 'MO'),
    (v_day_a,1080, 1440, 1, 'Joplin', 'MO');

  -- Negative case: the gap must be refused.
  BEGIN
    v_res := public.certify_rods_day(v_day_a, 'Scratch Driver', 'scratch/sig.png', NULL, 'audit', gen_random_uuid());
    RAISE EXCEPTION 'fixture: gap was NOT refused';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'fixture:%' THEN RAISE; END IF;
    RAISE NOTICE 'NEGATIVE OK -> %', v_msg;
  END;

  -- Repair the gap, then certify for real.
  INSERT INTO public.rods_events (rods_day_id, start_minute, end_minute, duty_status, city, state)
  VALUES (v_day_a, 600, 720, 2, 'Springfield', 'MO');

  v_res := public.certify_rods_day(v_day_a, 'Scratch Driver', 'scratch/sig.png', NULL, 'audit', gen_random_uuid());
  IF v_res.status <> 'certified' OR v_res.locked IS NOT TRUE THEN
    RAISE EXCEPTION 'fixture: day A not certified/locked (status=%, locked=%)', v_res.status, v_res.locked;
  END IF;
  RAISE NOTICE 'DAY A OK -> id=% status=% locked=% certified_at=%', v_res.id, v_res.status, v_res.locked, v_res.certified_at;

  -- Day B: uploaded ELD document path.
  v_day_b := public.create_eld_document_day(
    v_op, DATE '2001-01-03', 'scratch/eld-day-b.pdf',
    jsonb_build_object(
      'carrier_name','SUPERTRANSPORT','carrier_usdot','2309365','carrier_mc','788425',
      'main_office_address','1 Main St, Springfield MO',
      'home_terminal_address','1 Terminal Rd, Springfield MO',
      'home_terminal_timezone','America/Chicago'),
    gen_random_uuid());

  IF v_day_b.status <> 'certified' OR v_day_b.locked IS NOT TRUE OR v_day_b.pdf_path IS NOT NULL THEN
    RAISE EXCEPTION 'fixture: day B unexpected (status=%, locked=%, pdf_path=%)', v_day_b.status, v_day_b.locked, v_day_b.pdf_path;
  END IF;
  RAISE NOTICE 'DAY B OK -> id=% status=% locked=% pdf_path=%', v_day_b.id, v_day_b.status, v_day_b.locked, v_day_b.pdf_path;
END $$;