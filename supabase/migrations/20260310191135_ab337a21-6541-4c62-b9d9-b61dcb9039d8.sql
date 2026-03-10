
-- FAQ edit history table
CREATE TABLE public.faq_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faq_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  changed_by UUID NULL,
  changed_by_name TEXT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL DEFAULT 'update' -- 'create' | 'update' | 'publish' | 'unpublish'
);

ALTER TABLE public.faq_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view faq history"
  ON public.faq_history FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert faq history"
  ON public.faq_history FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

-- Resource document edit history table
CREATE TABLE public.resource_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  category TEXT NOT NULL,
  file_name TEXT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT false,
  changed_by UUID NULL,
  changed_by_name TEXT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL DEFAULT 'update' -- 'create' | 'update' | 'visibility'
);

ALTER TABLE public.resource_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view resource history"
  ON public.resource_history FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert resource history"
  ON public.resource_history FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

-- Indexes for efficient lookups
CREATE INDEX idx_faq_history_faq_id ON public.faq_history(faq_id, changed_at DESC);
CREATE INDEX idx_resource_history_resource_id ON public.resource_history(resource_id, changed_at DESC);
