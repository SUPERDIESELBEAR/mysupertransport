DO $$
DECLARE
  v_count bigint;
BEGIN
  IF to_regclass('public.broker_contacts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.broker_contacts' INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Rollback halted: broker_contacts contains % row(s).', v_count;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'load_charges'
      AND column_name = 'driver_paid_amount'
  ) THEN
    SELECT count(*) INTO v_count
    FROM public.load_charges
    WHERE driver_paid_amount IS NOT NULL;

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Rollback halted: load_charges.driver_paid_amount contains % non-null value(s).', v_count;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'brokers'
      AND column_name = 'do_not_load'
  ) THEN
    SELECT count(*) INTO v_count
    FROM public.brokers
    WHERE do_not_load IS TRUE
       OR do_not_load_reason IS NOT NULL
       OR do_not_load_date IS NOT NULL
       OR dispatcher_notes IS NOT NULL
       OR rating IS NOT NULL
       OR carrier_packet_status IS NOT NULL
       OR broker_agreement_status IS NOT NULL;

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Rollback halted: broker extension fields contain data on % broker row(s).', v_count;
    END IF;
  END IF;
END;
$$;

DO $$
DECLARE
  v_sql text;
BEGIN
  SELECT pg_get_functiondef('public.create_load_with_stops(jsonb,jsonb,jsonb)'::regprocedure)
    INTO v_sql;

  v_sql := replace(
    v_sql,
    'load_id, load_stop_id, charge_type, description, amount, driver_paid_amount, source',
    'load_id, load_stop_id, charge_type, description, amount, source'
  );

  v_sql := replace(
    v_sql,
    E'        COALESCE(NULLIF(v_charge->>''amount'','''')::numeric, 0),\n        NULLIF(v_charge->>''driver_paid_amount'','''')::numeric,\n        COALESCE(NULLIF(v_charge->>''source'',''''), ''manual'')',
    E'        COALESCE(NULLIF(v_charge->>''amount'','''')::numeric, 0),\n        COALESCE(NULLIF(v_charge->>''source'',''''), ''manual'')'
  );

  EXECUTE v_sql;
END;
$$;

DO $$
DECLARE
  v_sql text;
BEGIN
  SELECT pg_get_functiondef('public.update_load_with_stops(uuid,jsonb,jsonb,jsonb,text)'::regprocedure)
    INTO v_sql;

  v_sql := replace(
    v_sql,
    'load_id, load_stop_id, charge_type, description, amount, driver_paid_amount, source, created_by, updated_by',
    'load_id, load_stop_id, charge_type, description, amount, source, created_by, updated_by'
  );

  v_sql := replace(
    v_sql,
    E'        COALESCE(NULLIF(v_charge->>''amount'','''')::numeric, 0),\n        NULLIF(v_charge->>''driver_paid_amount'','''')::numeric,\n        COALESCE(NULLIF(v_charge->>''source'',''''), ''manual''),',
    E'        COALESCE(NULLIF(v_charge->>''amount'','''')::numeric, 0),\n        COALESCE(NULLIF(v_charge->>''source'',''''), ''manual''),'
  );

  EXECUTE v_sql;
END;
$$;

DROP TABLE IF EXISTS public.broker_contacts;
DROP FUNCTION IF EXISTS public.stamp_broker_contacts_actor();

DROP INDEX IF EXISTS public.load_charges_driver_paid_amount_idx;
ALTER TABLE public.load_charges
  DROP COLUMN IF EXISTS driver_paid_amount;

DROP INDEX IF EXISTS public.brokers_do_not_load_idx;
DROP INDEX IF EXISTS public.brokers_carrier_packet_status_idx;
ALTER TABLE public.brokers
  DROP COLUMN IF EXISTS do_not_load,
  DROP COLUMN IF EXISTS do_not_load_reason,
  DROP COLUMN IF EXISTS do_not_load_date,
  DROP COLUMN IF EXISTS dispatcher_notes,
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS carrier_packet_status,
  DROP COLUMN IF EXISTS broker_agreement_status;

REVOKE ALL ON FUNCTION public.create_load_with_stops(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_load_with_stops(jsonb, jsonb, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_load_with_stops(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_with_stops(uuid, jsonb, jsonb, jsonb, text) TO authenticated, service_role;