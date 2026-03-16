
-- ============================================================
-- SERVICE LIBRARY TABLES
-- ============================================================

-- 1. services
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo_url text,
  support_phone text,
  support_email text,
  support_chat_url text,
  support_hours text,
  known_issues_notes text,
  is_visible boolean NOT NULL DEFAULT false,
  is_new_driver_essential boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage services"
  ON public.services FOR ALL
  USING (is_staff(auth.uid()));

CREATE POLICY "Operators can view visible services"
  ON public.services FOR SELECT
  USING (is_visible = true AND auth.uid() IS NOT NULL);

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. service_resources
CREATE TABLE public.service_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  resource_type text NOT NULL CHECK (resource_type IN ('Setup Guide','Tutorial Video','PDF','FAQ','External Link','Contact & Support')),
  url text,
  body text,
  is_start_here boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  estimated_minutes integer,
  last_verified_at timestamp with time zone,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage service resources"
  ON public.service_resources FOR ALL
  USING (is_staff(auth.uid()));

CREATE POLICY "Operators can view visible service resources"
  ON public.service_resources FOR SELECT
  USING (
    is_visible = true AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_resources.service_id AND s.is_visible = true
    )
  );

CREATE TRIGGER update_service_resources_updated_at
  BEFORE UPDATE ON public.service_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_service_resources_service_id ON public.service_resources(service_id);

-- 3. service_resource_completions
CREATE TABLE public.service_resource_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.service_resources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(resource_id, user_id)
);

ALTER TABLE public.service_resource_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON public.service_resource_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own completions"
  ON public.service_resource_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions"
  ON public.service_resource_completions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all completions"
  ON public.service_resource_completions FOR SELECT
  USING (is_staff(auth.uid()));

CREATE INDEX idx_completions_user_id ON public.service_resource_completions(user_id);
CREATE INDEX idx_completions_resource_id ON public.service_resource_completions(resource_id);

-- 4. service_resource_bookmarks
CREATE TABLE public.service_resource_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.service_resources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(resource_id, user_id)
);

ALTER TABLE public.service_resource_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON public.service_resource_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks"
  ON public.service_resource_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.service_resource_bookmarks FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all bookmarks"
  ON public.service_resource_bookmarks FOR SELECT
  USING (is_staff(auth.uid()));

CREATE INDEX idx_bookmarks_user_id ON public.service_resource_bookmarks(user_id);
CREATE INDEX idx_bookmarks_resource_id ON public.service_resource_bookmarks(resource_id);

-- 5. service_help_requests
CREATE TABLE public.service_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.service_resources(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.service_help_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own help requests"
  ON public.service_help_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own help requests"
  ON public.service_help_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view all help requests"
  ON public.service_help_requests FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can update help request status"
  ON public.service_help_requests FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE INDEX idx_help_requests_user_id ON public.service_help_requests(user_id);
CREATE INDEX idx_help_requests_service_id ON public.service_help_requests(service_id);

-- 6. Storage bucket for service logos (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-logos', 'service-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-logos');

CREATE POLICY "Staff can upload service logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'service-logos' AND is_staff(auth.uid()));

CREATE POLICY "Staff can update service logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'service-logos' AND is_staff(auth.uid()));

CREATE POLICY "Staff can delete service logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'service-logos' AND is_staff(auth.uid()));
