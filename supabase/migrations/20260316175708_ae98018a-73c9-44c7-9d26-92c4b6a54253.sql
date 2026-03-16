
CREATE TABLE public.service_resource_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  resource_id UUID NOT NULL REFERENCES public.service_resources(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_id)
);

ALTER TABLE public.service_resource_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own views"
  ON public.service_resource_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own views"
  ON public.service_resource_views FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own views"
  ON public.service_resource_views FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own views"
  ON public.service_resource_views FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all resource views"
  ON public.service_resource_views FOR SELECT
  USING (is_staff(auth.uid()));

CREATE INDEX idx_service_resource_views_user_viewed
  ON public.service_resource_views (user_id, viewed_at DESC);
