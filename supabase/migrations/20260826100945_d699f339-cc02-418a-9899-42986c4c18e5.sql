CREATE TYPE public.rate_con_ingest_status AS ENUM (
  'received',
  'pending_parse',
  'parsed',
  'needs_manual',
  'auto_handled',
  'converted',
  'dismissed'
);

CREATE TABLE public.rate_con_ingest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  resend_email_id text UNIQUE,
  from_address text,
  to_address text,
  subject text,
  received_at timestamptz NOT NULL DEFAULT now(),
  sender_allowed boolean NOT NULL DEFAULT true,

  attachment_storage_path text,
  attachment_filename text,
  attachment_mime_type text,
  attachment_bytes integer,
  attachment_sha256 text,
  attachment_page_count integer,

  parsed jsonb,
  parse_build jsonb,
  parse_status text,
  parse_error text,
  broker_load_number text,
  verbatim_checks jsonb,
  text_layer text,
  text_layer_available boolean,

  status public.rate_con_ingest_status NOT NULL DEFAULT 'received',
  matched_load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  converted_load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  dismissed_by uuid,
  dismissed_at timestamptz,
  dismiss_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX rate_con_ingest_queue_attachment_sha256_key
  ON public.rate_con_ingest_queue (attachment_sha256)
  WHERE attachment_sha256 IS NOT NULL;

CREATE INDEX rate_con_ingest_queue_open_idx
  ON public.rate_con_ingest_queue (status)
  WHERE status IN ('received', 'pending_parse', 'parsed', 'needs_manual');

CREATE OR REPLACE FUNCTION public.auto_handle_ingested_rate_con()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.broker_reference_number IS NULL OR btrim(NEW.broker_reference_number) = '' THEN
    RETURN NEW;
  END IF;
  UPDATE public.rate_con_ingest_queue q
     SET status = 'auto_handled',
         matched_load_id = NEW.id,
         updated_at = now()
   WHERE q.status IN ('received', 'pending_parse', 'parsed', 'needs_manual')
     AND q.broker_load_number IS NOT NULL
     AND lower(regexp_replace(q.broker_load_number, '[^0-9A-Za-z]', '', 'g'))
       = lower(regexp_replace(NEW.broker_reference_number, '[^0-9A-Za-z]', '', 'g'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_loads_auto_handle_ingest
  AFTER INSERT OR UPDATE OF broker_reference_number ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_handle_ingested_rate_con();

GRANT SELECT, UPDATE ON public.rate_con_ingest_queue TO authenticated;
GRANT ALL ON public.rate_con_ingest_queue TO service_role;

ALTER TABLE public.rate_con_ingest_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispatch staff read ingest queue"
  ON public.rate_con_ingest_queue FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dispatcher')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Dispatch staff update ingest queue"
  ON public.rate_con_ingest_queue FOR UPDATE TO authenticated
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