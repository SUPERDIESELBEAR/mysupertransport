-- P43 (owner decision 2026-09-23): creating a carrier is a SUPERDRIVE platform
-- power, not a carrier power. Held only by the platform operator. Deliberately
-- company-less: it belongs to no carrier. Rows arrive only by migration.
CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NOT NULL,
  reason     text NOT NULL CHECK (length(btrim(reason)) > 0)
);
COMMENT ON TABLE public.platform_admins IS
  'P43: SUPERDRIVE platform operators. No company_id by design. Written only by migration; a user may read only his own row.';

REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "A user reads only his own platform admin row"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = _user_id)
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

INSERT INTO public.platform_admins (user_id, granted_by, reason)
VALUES ('5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe', 'migration',
        'P43 (2026-09-23): Marcus Mueller, SUPERDRIVE platform operator. Creating a carrier is a platform power, not a carrier power; no carrier owner holds it by default and nothing a carrier does can grant it.');