-- PERMISSIONS MODULE — foundation + three of the five first-slice actions.
-- Design: docs/passes/2026-09-21-0132-permissions-design.md, decisions P1-P15.
-- Driver deactivation and staff-account suspension are deliberately NOT here.
--
-- UNDO, in this order:
--   DROP POLICY invoices_view_permission ON public.invoices;
--   DROP POLICY dispatch_settlements_view_permission ON public.dispatch_settlements;
--   DROP POLICY settlements_view_permission ON public.settlements;
--   DROP POLICY document_send_log_insert_permission ON public.document_send_log;
--   CREATE POLICY document_send_log_insert_staff ON public.document_send_log
--     FOR INSERT TO authenticated WITH CHECK (
--       has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner')
--       OR has_role(auth.uid(),'dispatcher') OR has_role(auth.uid(),'onboarding_staff'));
--   DROP POLICY lease_terminations_change ON public.lease_terminations;
--   DROP POLICY lease_terminations_view ON public.lease_terminations;
--   CREATE POLICY "Staff manage lease terminations" ON public.lease_terminations
--     FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
--   DROP FUNCTION public.seed_role_permissions(uuid);
--   DROP FUNCTION public.has_permission(text);
--   DROP FUNCTION public.has_permission(uuid, text);
--   DROP TABLE public.user_permission_exceptions;
--   DROP TABLE public.role_permissions;
--   DROP TABLE public.permission_actions;
--   DROP TYPE public.permission_effect; DROP TYPE public.permission_kind;

CREATE TYPE public.permission_kind AS ENUM ('view', 'change');
CREATE TYPE public.permission_effect AS ENUM ('allow', 'deny');

-- 1. THE CATALOGUE. Product-level, deliberately WITHOUT company_id: the set of
--    actions SUPERDRIVE can enforce is decided by the code that enforces them,
--    never by a carrier. Rows arrive by migration; there is no write policy.
CREATE TABLE public.permission_actions (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  category    text NOT NULL,
  kind        public.permission_kind NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_actions TO authenticated;
GRANT ALL    ON public.permission_actions TO service_role;
ALTER TABLE public.permission_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permission_actions_read_authenticated ON public.permission_actions
  FOR SELECT TO authenticated USING (true);

-- 2. ROLE GRANTS — the normal path (P9). Presence of the row IS the grant.
CREATE TABLE public.role_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  role        public.app_role NOT NULL,
  action_key  text NOT NULL REFERENCES public.permission_actions(key),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  UNIQUE (company_id, role, action_key)
);
CREATE INDEX role_permissions_lookup_idx
  ON public.role_permissions (action_key, company_id, role);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

-- 3. PER-PERSON EXCEPTIONS (P15) — layered over role grants, optional expiry.
CREATE TABLE public.user_permission_exceptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL,
  action_key  text NOT NULL REFERENCES public.permission_actions(key),
  effect      public.permission_effect NOT NULL,
  expires_at  timestamptz,
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  UNIQUE (company_id, user_id, action_key)
);
CREATE INDEX user_permission_exceptions_lookup_idx
  ON public.user_permission_exceptions (user_id, action_key, company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_exceptions TO authenticated;
GRANT ALL ON public.user_permission_exceptions TO service_role;

-- 4. THE FUNCTION. Owner short-circuit FIRST (P1); unknown key raises LOUDLY;
--    a known key with no grant and no exception is CLOSED.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company uuid;
  v_known   boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT true INTO v_known
    FROM public.permission_actions a
   WHERE a.key = _action AND a.is_active;
  IF NOT COALESCE(v_known, false) THEN
    RAISE EXCEPTION 'Unknown permission action %', _action USING ERRCODE = '22023';
  END IF;

  -- P1: the owner is unrestricted, always, before any grant table is consulted.
  IF public.has_role(_user_id, 'owner') THEN
    RETURN true;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RETURN false;
  END IF;

  -- P15: the person's own unexpired exception wins over his roles, both ways.
  RETURN COALESCE(
    (SELECT e.effect = 'allow'
       FROM public.user_permission_exceptions e
      WHERE e.user_id = _user_id
        AND e.action_key = _action
        AND e.company_id = v_company
        AND (e.expires_at IS NULL OR e.expires_at > now())),
    EXISTS (SELECT 1
              FROM public.user_roles ur
              JOIN public.role_permissions rp ON rp.role = ur.role
             WHERE ur.user_id = _user_id
               AND rp.action_key = _action
               AND rp.company_id = v_company));
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT public.has_permission(auth.uid(), _action) $$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(text)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text)       FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.has_permission(text)       TO authenticated, service_role;

-- 5. THE CARRIER SEED. Whatever provisions a carrier MUST call this, or its
--    staff hold nothing under the closed-by-default rule.
CREATE OR REPLACE FUNCTION public.seed_role_permissions(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_count integer;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'seed_role_permissions requires a company_id' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.carrier_profile c WHERE c.id = _company_id) THEN
    RAISE EXCEPTION 'No carrier_profile row %', _company_id USING ERRCODE = '22023';
  END IF;

  -- The owner appears NOWHERE below: P1 lives in has_permission, not in rows.
  INSERT INTO public.role_permissions (company_id, role, action_key)
  SELECT _company_id, d.role::public.app_role, d.action_key
    FROM (VALUES
      ('management',       'lease_termination.view'),
      ('dispatcher',       'lease_termination.view'),
      ('onboarding_staff', 'lease_termination.view'),
      ('management',       'lease_termination.change'),
      ('management',       'company_document.view'),
      ('dispatcher',       'company_document.view'),
      ('onboarding_staff', 'company_document.view'),
      ('management',       'company_document.send'),
      ('dispatcher',       'company_document.send'),
      ('management',       'settlement.view'),
      ('dispatcher',       'settlement.view'),
      ('management',       'invoice.view'),
      ('dispatcher',       'invoice.view')
    ) AS d(role, action_key)
  ON CONFLICT (company_id, role, action_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_role_permissions(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_role_permissions(uuid) TO service_role;

-- 6. THE ACTIONS THIS PASS ENFORCES.
INSERT INTO public.permission_actions (key, label, description, category, kind) VALUES
  ('lease_termination.view',  'View lease terminations', 'See termination records and their paperwork.', 'drivers',   'view'),
  ('lease_termination.change','Terminate a lease',       'Create or change a lease termination.',        'drivers',   'change'),
  ('company_document.view',   'View company documents',  'See the carrier W-9, COI and MC certificate.', 'documents', 'view'),
  ('company_document.send',   'Send a company document', 'Send a company document to a broker.',         'documents', 'change'),
  ('settlement.view',         'View settlements',        'See driver settlements and dispatch settlements.', 'money',  'view'),
  ('invoice.view',            'View invoices',           'See customer invoices.',                       'money',     'view');

-- Seed the defaults for every carrier that exists today (one). Done BEFORE the
-- stamp trigger is attached: stamp_tenant_company_id resolves the CALLER's
-- company and this connection has no JWT, so it would refuse these rows. The
-- trigger is created immediately below and governs every later write.
SELECT public.seed_role_permissions(c.id) FROM public.carrier_profile c;

CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT OR UPDATE ON public.user_permission_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.role_permissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY role_permissions_read_staff ON public.role_permissions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- Owner-only writes, checked with has_role and NEVER with a permission, so no
-- grant can ever remove the owner's ability to fix permissions (P1).
CREATE POLICY role_permissions_write_owner ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

ALTER TABLE public.user_permission_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.user_permission_exceptions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
CREATE POLICY user_permission_exceptions_read_staff ON public.user_permission_exceptions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY user_permission_exceptions_write_owner ON public.user_permission_exceptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- 7a. LEASE TERMINATIONS (P6). Was one FOR ALL policy on is_staff() — any staff
--     role could terminate a lease. View and change now separate (P13).
DROP POLICY "Staff manage lease terminations" ON public.lease_terminations;
CREATE POLICY lease_terminations_view ON public.lease_terminations
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('lease_termination.view')));
CREATE POLICY lease_terminations_change ON public.lease_terminations
  FOR ALL TO authenticated
  USING      ((SELECT public.has_permission('lease_termination.change')))
  WITH CHECK ((SELECT public.has_permission('lease_termination.change')));

-- 7b. COMPANY DOCUMENT SEND (P7). The send is the INSERT into document_send_log;
--     onboarding staff loses it. company_documents SELECT is left exactly as it
--     is — every staff role may still view, which is what the design says.
DROP POLICY document_send_log_insert_staff ON public.document_send_log;
CREATE POLICY document_send_log_insert_permission ON public.document_send_log
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_permission('company_document.send')));

-- 7c. SETTLEMENT AND INVOICE VIEW (P2). Purely ADDITIVE: the management FOR ALL
--     policies and the operators' own-row SELECT policies are untouched.
CREATE POLICY settlements_view_permission ON public.settlements
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('settlement.view')));
CREATE POLICY dispatch_settlements_view_permission ON public.dispatch_settlements
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('settlement.view')));
CREATE POLICY invoices_view_permission ON public.invoices
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('invoice.view')));