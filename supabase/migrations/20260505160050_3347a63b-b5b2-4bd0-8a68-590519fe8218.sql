
CREATE TABLE public.operator_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  sent_by uuid REFERENCES auth.users(id),
  recipient_scope text NOT NULL CHECK (recipient_scope IN ('all','selected')),
  recipient_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.operator_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.operator_broadcasts(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','sent','failed','skipped_optout','skipped_no_email')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_obr_broadcast_id ON public.operator_broadcast_recipients(broadcast_id);
CREATE INDEX idx_ob_created_at ON public.operator_broadcasts(created_at DESC);

ALTER TABLE public.operator_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mgmt can view broadcasts"
ON public.operator_broadcasts FOR SELECT
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Mgmt can insert broadcasts"
ON public.operator_broadcasts FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Mgmt can update broadcasts"
ON public.operator_broadcasts FOR UPDATE
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Mgmt can view broadcast recipients"
ON public.operator_broadcast_recipients FOR SELECT
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Mgmt can insert broadcast recipients"
ON public.operator_broadcast_recipients FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Mgmt can update broadcast recipients"
ON public.operator_broadcast_recipients FOR UPDATE
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));
