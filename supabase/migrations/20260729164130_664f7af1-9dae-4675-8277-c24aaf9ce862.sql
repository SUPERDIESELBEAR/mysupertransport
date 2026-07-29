
CREATE TABLE public.driver_staff_contact_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, staff_id)
);
CREATE INDEX idx_dscs_driver ON public.driver_staff_contact_suppressions(driver_id);
CREATE INDEX idx_dscs_staff  ON public.driver_staff_contact_suppressions(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_staff_contact_suppressions TO authenticated;
GRANT ALL ON public.driver_staff_contact_suppressions TO service_role;

ALTER TABLE public.driver_staff_contact_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dscs_driver_select_own" ON public.driver_staff_contact_suppressions
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "dscs_staff_select_own" ON public.driver_staff_contact_suppressions
  FOR SELECT TO authenticated USING (staff_id = auth.uid());
CREATE POLICY "dscs_admin_select" ON public.driver_staff_contact_suppressions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "dscs_staff_insert_self" ON public.driver_staff_contact_suppressions
  FOR INSERT TO authenticated WITH CHECK (staff_id = auth.uid());
CREATE POLICY "dscs_staff_delete_self" ON public.driver_staff_contact_suppressions
  FOR DELETE TO authenticated USING (staff_id = auth.uid());
CREATE POLICY "dscs_admin_insert" ON public.driver_staff_contact_suppressions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "dscs_admin_delete" ON public.driver_staff_contact_suppressions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'management'));

CREATE OR REPLACE FUNCTION public.list_driver_contacts(_driver UUID)
RETURNS TABLE (
  staff_id UUID, full_name TEXT, first_name TEXT, last_name TEXT,
  avatar_url TEXT, role TEXT,
  availability_mode public.staff_availability_mode, availability_note TEXT, source TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH raw_pool AS (
    SELECT s.staff_id, s.availability_mode, s.availability_note, 'all_drivers'::TEXT AS source
    FROM public.staff_messaging_settings s
    WHERE s.availability_mode = 'all_drivers'

    UNION

    SELECT s.staff_id, s.availability_mode, s.availability_note, 'specific'::TEXT AS source
    FROM public.staff_messaging_settings s
    JOIN public.driver_staff_contacts dsc ON dsc.staff_id = s.staff_id
    WHERE s.availability_mode = 'specific_drivers' AND dsc.driver_id = _driver

    UNION

    SELECT o.assigned_onboarding_staff AS staff_id,
           COALESCE(s.availability_mode, 'none'::public.staff_availability_mode),
           s.availability_note,
           'assigned_onboarding'::TEXT AS source
    FROM public.operators o
    LEFT JOIN public.staff_messaging_settings s ON s.staff_id = o.assigned_onboarding_staff
    WHERE o.user_id = _driver AND o.assigned_onboarding_staff IS NOT NULL

    UNION

    SELECT ad.assigned_dispatcher AS staff_id,
           COALESCE(s.availability_mode, 'none'::public.staff_availability_mode),
           s.availability_note,
           'assigned_dispatcher'::TEXT AS source
    FROM public.active_dispatch ad
    JOIN public.operators o ON o.id = ad.operator_id
    LEFT JOIN public.staff_messaging_settings s ON s.staff_id = ad.assigned_dispatcher
    WHERE o.user_id = _driver
      AND ad.assigned_dispatcher IS NOT NULL
      AND ad.id = (
        SELECT ad2.id FROM public.active_dispatch ad2
        WHERE ad2.operator_id = o.id AND ad2.assigned_dispatcher IS NOT NULL
        ORDER BY ad2.updated_at DESC NULLS LAST
        LIMIT 1
      )
  ),
  ranked AS (
    SELECT rp.*,
      ROW_NUMBER() OVER (
        PARTITION BY rp.staff_id
        ORDER BY CASE rp.source
          WHEN 'assigned_dispatcher' THEN 1
          WHEN 'assigned_onboarding' THEN 2
          WHEN 'specific'            THEN 3
          WHEN 'all_drivers'         THEN 4
          ELSE 5
        END
      ) AS rn
    FROM raw_pool rp
  ),
  dedup AS (SELECT * FROM ranked WHERE rn = 1)
  SELECT d.staff_id,
    TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) AS full_name,
    p.first_name, p.last_name, p.avatar_url,
    (SELECT ur.role::TEXT FROM public.user_roles ur
      WHERE ur.user_id = d.staff_id
        AND ur.role IN ('owner','management','dispatcher','onboarding_staff')
      ORDER BY CASE ur.role
        WHEN 'owner' THEN 1 WHEN 'management' THEN 2
        WHEN 'dispatcher' THEN 3 WHEN 'onboarding_staff' THEN 4 ELSE 5
      END
      LIMIT 1) AS role,
    d.availability_mode, d.availability_note, d.source
  FROM dedup d
  LEFT JOIN public.profiles p ON p.user_id = d.staff_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.driver_staff_contact_suppressions x
    WHERE x.driver_id = _driver AND x.staff_id = d.staff_id
  )
  ORDER BY full_name NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.can_driver_message_staff(_driver UUID, _staff UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _mode public.staff_availability_mode;
  _is_auto BOOLEAN;
  _suppressed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.driver_staff_contact_suppressions
    WHERE driver_id = _driver AND staff_id = _staff
  ) INTO _suppressed;
  IF _suppressed THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.user_id = _driver AND o.assigned_onboarding_staff = _staff
  ) INTO _is_auto;
  IF _is_auto THEN RETURN TRUE; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.active_dispatch ad
    JOIN public.operators o ON o.id = ad.operator_id
    WHERE o.user_id = _driver
      AND ad.assigned_dispatcher = _staff
      AND ad.id = (
        SELECT ad2.id FROM public.active_dispatch ad2
        WHERE ad2.operator_id = o.id AND ad2.assigned_dispatcher IS NOT NULL
        ORDER BY ad2.updated_at DESC NULLS LAST
        LIMIT 1
      )
  ) INTO _is_auto;
  IF _is_auto THEN RETURN TRUE; END IF;

  SELECT availability_mode INTO _mode FROM public.staff_messaging_settings WHERE staff_id = _staff;
  IF _mode IS NULL OR _mode = 'none' THEN RETURN FALSE; END IF;
  IF _mode = 'all_drivers' THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.driver_staff_contacts
    WHERE driver_id = _driver AND staff_id = _staff
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_staff_auto_assigned_drivers(_staff UUID)
RETURNS TABLE (
  driver_id UUID,
  full_name TEXT,
  unit_number TEXT,
  source TEXT,
  suppressed BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH pool AS (
    SELECT o.user_id AS driver_id, o.unit_number, 'assigned_onboarding'::TEXT AS source
    FROM public.operators o
    WHERE o.assigned_onboarding_staff = _staff AND o.user_id IS NOT NULL

    UNION

    SELECT o.user_id AS driver_id, o.unit_number, 'assigned_dispatcher'::TEXT AS source
    FROM public.active_dispatch ad
    JOIN public.operators o ON o.id = ad.operator_id
    WHERE ad.assigned_dispatcher = _staff
      AND o.user_id IS NOT NULL
      AND ad.id = (
        SELECT ad2.id FROM public.active_dispatch ad2
        WHERE ad2.operator_id = o.id AND ad2.assigned_dispatcher IS NOT NULL
        ORDER BY ad2.updated_at DESC NULLS LAST
        LIMIT 1
      )
  ),
  dedup AS (
    SELECT DISTINCT ON (driver_id) driver_id, unit_number, source FROM pool
    ORDER BY driver_id, CASE source WHEN 'assigned_dispatcher' THEN 1 ELSE 2 END
  )
  SELECT d.driver_id,
    TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) AS full_name,
    d.unit_number,
    d.source,
    EXISTS (
      SELECT 1 FROM public.driver_staff_contact_suppressions x
      WHERE x.staff_id = _staff AND x.driver_id = d.driver_id
    ) AS suppressed
  FROM dedup d
  LEFT JOIN public.profiles p ON p.user_id = d.driver_id
  ORDER BY full_name NULLS LAST;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_staff_contact_suppressions;
