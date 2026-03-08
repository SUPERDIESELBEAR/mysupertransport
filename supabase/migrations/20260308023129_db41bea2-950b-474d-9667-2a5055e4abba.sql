CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid,
  actor_name    text,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  entity_label  text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_actor_id_idx   ON public.audit_log (actor_id);
CREATE INDEX audit_log_action_idx     ON public.audit_log (action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can read audit log"
  ON public.audit_log FOR SELECT
  USING (has_role(auth.uid(), 'management'::app_role));