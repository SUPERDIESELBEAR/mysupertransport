-- B8 (token / share tables). Shape 1 on seven tables.
--
-- DECISIONS RECORDED THIS PASS (owner, 2026-09-15):
--   * document_short_links takes SHAPE 1. The record calling
--     get_or_create_short_link an anonymous writer was WRONG: it raises
--     'authentication required' before writing and stamps created_by from the
--     caller. It is an ordinary signed-in write behind a definer wrapper.
--   * share_token_access_log STAYS GLOBAL and is NOT in this migration. Its 8
--     not_found rows have no parent and never did — they are the record of
--     someone presenting a bad or guessed token, which is what a security log
--     is for. A cross-carrier abuse log is not tenant data; its most important
--     rows are the ones with no tenant.
--   * The THIRD STAMPING SHAPE therefore covers ZERO tables. It was invented
--     for a case that turned out not to exist.
--   * share_tokens gets company_id AND a company-scoped read policy: both read
--     policies were role tests only, so a second carrier's dispatcher would
--     list this carrier's share links including resource_id, which names its
--     inspection documents.
--
-- Token/code unique indexes stay GLOBAL and are deliberately NOT rescoped:
-- every one of them is probed before any tenant is known.
-- share_tokens_scope_resource_unique (scope, resource_id) also stays global:
-- resource_id names an already carrier-scoped resource, so it cannot collide
-- across carriers.
--
-- NOTED, not blocking: 4 of 693 share_tokens rows point at an
-- inspection_documents row that no longer exists. Shape 1 derives the company
-- from the staff creator, not the resource, so the dangling rows backfill.

DO $$
DECLARE
  v_company uuid;
  v_count   int;
  v_table   text;
  v_null    bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.carrier_profile;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one carrier_profile row, found %. This backfill must be told which company it means.', v_count;
  END IF;
  SELECT id INTO v_company FROM public.carrier_profile;

  FOREACH v_table IN ARRAY ARRAY[
    'share_tokens', 'document_short_links', 'binder_share_bundles',
    'ica_review_links', 'officer_packet_links', 'preview_sessions',
    'passenger_authorizations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', v_table);
    EXECUTE format('UPDATE public.%I SET company_id = $1', v_table) USING v_company;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL', v_table) INTO v_null;
    IF v_null > 0 THEN
      RAISE EXCEPTION '%: % rows still have no company after backfill', v_table, v_null;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', v_table);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT',
      v_table, v_table || '_company_id_fkey');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)',
      'idx_' || v_table || '_company_id', v_table);
    EXECUTE format(
      'CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id()',
      v_table);
  END LOOP;
END $$;

-- share_tokens: scope the staff read (and the management update) by company.
-- The ANONYMOUS RESOLVE PATH IS UNAFFECTED: resolve_share_token and
-- _share_token_gate are SECURITY DEFINER and look the row up by token, so they
-- never pass through these policies.
DROP POLICY IF EXISTS "Staff can view share tokens" ON public.share_tokens;
CREATE POLICY "Staff can view share tokens"
  ON public.share_tokens FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (
      public.has_role(auth.uid(), 'management'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'onboarding_staff'::app_role)
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    )
  );

DROP POLICY IF EXISTS "Management can update share tokens" ON public.share_tokens;
CREATE POLICY "Management can update share tokens"
  ON public.share_tokens FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.has_role(auth.uid(), 'management'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
  );

COMMENT ON TABLE public.share_token_access_log IS
  'GLOBAL by decision (2026-09-15), alongside audit_log and email_send_log: a cross-carrier abuse log is not tenant data. Its not_found rows record tokens that never existed, so they have no parent company and never did; refusing them would delete the log''s most security-relevant class of row and a nullable company_id would conflate "unknown token" with "writer forgot to stamp". Scope reads through the token''s share_tokens row at QUERY TIME if a second carrier appears.';