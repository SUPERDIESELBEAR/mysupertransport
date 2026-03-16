
-- ── driver_documents ─────────────────────────────────────────────────────────
CREATE TABLE public.driver_documents (
  id                      UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title                   TEXT NOT NULL,
  description             TEXT,
  body                    TEXT,
  category                TEXT NOT NULL CHECK (category IN ('Onboarding', 'Safety', 'Compliance', 'HR & Pay', 'General')),
  is_visible              BOOLEAN NOT NULL DEFAULT false,
  is_required             BOOLEAN NOT NULL DEFAULT false,
  is_pinned               BOOLEAN NOT NULL DEFAULT false,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  estimated_read_minutes  INTEGER,
  version                 INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view visible documents"
  ON public.driver_documents FOR SELECT
  USING (is_visible = true AND auth.uid() IS NOT NULL);

CREATE POLICY "Staff can view all driver documents"
  ON public.driver_documents FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert driver documents"
  ON public.driver_documents FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update driver documents"
  ON public.driver_documents FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can delete driver documents"
  ON public.driver_documents FOR DELETE
  USING (is_staff(auth.uid()));

CREATE TRIGGER update_driver_documents_updated_at
  BEFORE UPDATE ON public.driver_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── document_acknowledgments ─────────────────────────────────────────────────
CREATE TABLE public.document_acknowledgments (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id       UUID NOT NULL REFERENCES public.driver_documents(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  acknowledged_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  document_version  INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.document_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own acknowledgments"
  ON public.document_acknowledgments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own acknowledgments"
  ON public.document_acknowledgments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all acknowledgments"
  ON public.document_acknowledgments FOR SELECT
  USING (is_staff(auth.uid()));

-- ── document_version_history ─────────────────────────────────────────────────
CREATE TABLE public.document_version_history (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.driver_documents(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  body        TEXT,
  updated_by  UUID,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.document_version_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert version history"
  ON public.document_version_history FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can view version history"
  ON public.document_version_history FOR SELECT
  USING (is_staff(auth.uid()));

CREATE INDEX idx_driver_documents_category ON public.driver_documents(category);
CREATE INDEX idx_driver_documents_is_visible ON public.driver_documents(is_visible);
CREATE INDEX idx_driver_documents_sort_order ON public.driver_documents(sort_order);
CREATE INDEX idx_document_acknowledgments_document_id ON public.document_acknowledgments(document_id);
CREATE INDEX idx_document_acknowledgments_user_id ON public.document_acknowledgments(user_id);
