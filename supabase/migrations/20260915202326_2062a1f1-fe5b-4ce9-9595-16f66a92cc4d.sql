-- B6 GROUP 3 -- the driver-written remainder: 31 tables.
-- Shapes: EMPTY (nullable -> NOT NULL), BACKFILL (nullable -> derived UPDATE -> NOT NULL),
-- CONSTANT-DEFAULT-THEN-DROP (tables whose UPDATE fires history/notification/immutability
-- triggers; read-only derivation check first, NO trigger suspended).
-- No new function is created, so there is nothing new to REVOKE; every table reuses
-- public.stamp_tenant_company_id().
DO $$
DECLARE v_n int; v_id uuid;
BEGIN
  SELECT count(*) INTO v_n FROM public.carrier_profile;
  IF v_n <> 1 THEN RAISE EXCEPTION 'B6 Group 3 constant-default route assumes exactly one carrier, found %', v_n; END IF;
  SELECT id INTO v_id FROM public.carrier_profile;
  IF v_id <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid THEN RAISE EXCEPTION 'carrier id is %, not the recorded sole carrier', v_id; END IF;
END $$;

-- message_threads: EMPTY.
ALTER TABLE public.message_threads ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.message_threads;
  IF v > 0 THEN RAISE EXCEPTION 'message_threads is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.message_threads ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.message_threads
  ADD CONSTRAINT message_threads_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX message_threads_company_id_idx ON public.message_threads(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- thread_participants: EMPTY.
ALTER TABLE public.thread_participants ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.thread_participants;
  IF v > 0 THEN RAISE EXCEPTION 'thread_participants is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.thread_participants ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.thread_participants
  ADD CONSTRAINT thread_participants_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX thread_participants_company_id_idx ON public.thread_participants(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.thread_participants
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- message_reactions: EMPTY.
ALTER TABLE public.message_reactions ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.message_reactions;
  IF v > 0 THEN RAISE EXCEPTION 'message_reactions is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.message_reactions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX message_reactions_company_id_idx ON public.message_reactions(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- service_resource_bookmarks: EMPTY.
ALTER TABLE public.service_resource_bookmarks ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.service_resource_bookmarks;
  IF v > 0 THEN RAISE EXCEPTION 'service_resource_bookmarks is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.service_resource_bookmarks ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.service_resource_bookmarks
  ADD CONSTRAINT service_resource_bookmarks_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX service_resource_bookmarks_company_id_idx ON public.service_resource_bookmarks(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.service_resource_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- roadside_stops: EMPTY.
ALTER TABLE public.roadside_stops ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.roadside_stops;
  IF v > 0 THEN RAISE EXCEPTION 'roadside_stops is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.roadside_stops ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.roadside_stops
  ADD CONSTRAINT roadside_stops_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX roadside_stops_company_id_idx ON public.roadside_stops(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.roadside_stops
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- roadside_stop_documents: EMPTY.
ALTER TABLE public.roadside_stop_documents ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.roadside_stop_documents;
  IF v > 0 THEN RAISE EXCEPTION 'roadside_stop_documents is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.roadside_stop_documents ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.roadside_stop_documents
  ADD CONSTRAINT roadside_stop_documents_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX roadside_stop_documents_company_id_idx ON public.roadside_stop_documents(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.roadside_stop_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- roadside_stop_violations: EMPTY.
ALTER TABLE public.roadside_stop_violations ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.roadside_stop_violations;
  IF v > 0 THEN RAISE EXCEPTION 'roadside_stop_violations is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.roadside_stop_violations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.roadside_stop_violations
  ADD CONSTRAINT roadside_stop_violations_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX roadside_stop_violations_company_id_idx ON public.roadside_stop_violations(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.roadside_stop_violations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- documents: EMPTY.
ALTER TABLE public.documents ADD COLUMN company_id uuid;
DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.documents;
  IF v > 0 THEN RAISE EXCEPTION 'documents is no longer empty (% rows); it needs a backfill', v; END IF; END $$;
ALTER TABLE public.documents ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX documents_company_id_idx ON public.documents(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- service_resource_completions: BACKFILL.
ALTER TABLE public.service_resource_completions ADD COLUMN company_id uuid;
UPDATE public.service_resource_completions x SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.user_id AND w.company_id IS NOT NULL LIMIT 1));
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.service_resource_completions WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'service_resource_completions backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.service_resource_completions;
  IF v > 1 THEN RAISE EXCEPTION 'service_resource_completions derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.service_resource_completions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.service_resource_completions
  ADD CONSTRAINT service_resource_completions_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX service_resource_completions_company_id_idx ON public.service_resource_completions(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.service_resource_completions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- service_resource_views: BACKFILL.
ALTER TABLE public.service_resource_views ADD COLUMN company_id uuid;
UPDATE public.service_resource_views x SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.user_id AND w.company_id IS NOT NULL LIMIT 1));
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.service_resource_views WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'service_resource_views backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.service_resource_views;
  IF v > 1 THEN RAISE EXCEPTION 'service_resource_views derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.service_resource_views ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.service_resource_views
  ADD CONSTRAINT service_resource_views_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX service_resource_views_company_id_idx ON public.service_resource_views(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.service_resource_views
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- notification_preferences: BACKFILL.
ALTER TABLE public.notification_preferences ADD COLUMN company_id uuid;
UPDATE public.notification_preferences x SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.user_id AND w.company_id IS NOT NULL LIMIT 1));
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.notification_preferences WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'notification_preferences backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.notification_preferences;
  IF v > 1 THEN RAISE EXCEPTION 'notification_preferences derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.notification_preferences ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX notification_preferences_company_id_idx ON public.notification_preferences(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- service_help_requests: BACKFILL.
ALTER TABLE public.service_help_requests ADD COLUMN company_id uuid;
UPDATE public.service_help_requests x SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.user_id AND w.company_id IS NOT NULL LIMIT 1));
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.service_help_requests WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'service_help_requests backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.service_help_requests;
  IF v > 1 THEN RAISE EXCEPTION 'service_help_requests derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.service_help_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.service_help_requests
  ADD CONSTRAINT service_help_requests_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX service_help_requests_company_id_idx ON public.service_help_requests(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.service_help_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- message_notification_throttle: BACKFILL.
ALTER TABLE public.message_notification_throttle ADD COLUMN company_id uuid;
UPDATE public.message_notification_throttle x SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.recipient_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.recipient_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.recipient_id AND w.company_id IS NOT NULL LIMIT 1));
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.message_notification_throttle WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'message_notification_throttle backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.message_notification_throttle;
  IF v > 1 THEN RAISE EXCEPTION 'message_notification_throttle derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.message_notification_throttle ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.message_notification_throttle
  ADD CONSTRAINT message_notification_throttle_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX message_notification_throttle_company_id_idx ON public.message_notification_throttle(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.message_notification_throttle
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- ica_driver_acknowledgments: BACKFILL.
ALTER TABLE public.ica_driver_acknowledgments ADD COLUMN company_id uuid;
UPDATE public.ica_driver_acknowledgments x SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.driver_user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.driver_user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.driver_user_id AND w.company_id IS NOT NULL LIMIT 1));
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.ica_driver_acknowledgments WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'ica_driver_acknowledgments backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.ica_driver_acknowledgments;
  IF v > 1 THEN RAISE EXCEPTION 'ica_driver_acknowledgments derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.ica_driver_acknowledgments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.ica_driver_acknowledgments
  ADD CONSTRAINT ica_driver_acknowledgments_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX ica_driver_acknowledgments_company_id_idx ON public.ica_driver_acknowledgments(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.ica_driver_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- operator_broadcast_recipients: BACKFILL.
ALTER TABLE public.operator_broadcast_recipients ADD COLUMN company_id uuid;
UPDATE public.operator_broadcast_recipients x SET company_id = (SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id);
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.operator_broadcast_recipients WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'operator_broadcast_recipients backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.operator_broadcast_recipients;
  IF v > 1 THEN RAISE EXCEPTION 'operator_broadcast_recipients derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.operator_broadcast_recipients ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.operator_broadcast_recipients
  ADD CONSTRAINT operator_broadcast_recipients_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX operator_broadcast_recipients_company_id_idx ON public.operator_broadcast_recipients(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.operator_broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- dispatch_status_history: BACKFILL.
ALTER TABLE public.dispatch_status_history ADD COLUMN company_id uuid;
UPDATE public.dispatch_status_history x SET company_id = (SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id);
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.dispatch_status_history WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'dispatch_status_history backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.dispatch_status_history;
  IF v > 1 THEN RAISE EXCEPTION 'dispatch_status_history derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.dispatch_status_history ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.dispatch_status_history
  ADD CONSTRAINT dispatch_status_history_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX dispatch_status_history_company_id_idx ON public.dispatch_status_history(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.dispatch_status_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- load_status_history: BACKFILL.
ALTER TABLE public.load_status_history ADD COLUMN company_id uuid;
UPDATE public.load_status_history x SET company_id = (SELECT p.company_id FROM public.loads p WHERE p.id = x.load_id);
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.load_status_history WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'load_status_history backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.load_status_history;
  IF v > 1 THEN RAISE EXCEPTION 'load_status_history derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.load_status_history ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.load_status_history
  ADD CONSTRAINT load_status_history_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX load_status_history_company_id_idx ON public.load_status_history(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.load_status_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- load_change_history: BACKFILL.
ALTER TABLE public.load_change_history ADD COLUMN company_id uuid;
UPDATE public.load_change_history x SET company_id = (SELECT p.company_id FROM public.loads p WHERE p.id = x.load_id);
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.load_change_history WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'load_change_history backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.load_change_history;
  IF v > 1 THEN RAISE EXCEPTION 'load_change_history derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.load_change_history ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.load_change_history
  ADD CONSTRAINT load_change_history_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX load_change_history_company_id_idx ON public.load_change_history(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.load_change_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- onboard_assignment_sheet_items: BACKFILL.
ALTER TABLE public.onboard_assignment_sheet_items ADD COLUMN company_id uuid;
UPDATE public.onboard_assignment_sheet_items x SET company_id = (SELECT o.company_id FROM public.onboard_assignment_sheets s JOIN public.operators o ON o.id = s.operator_id WHERE s.id = x.sheet_id);
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.onboard_assignment_sheet_items WHERE company_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION 'onboard_assignment_sheet_items backfill left % unresolved rows', v; END IF;
  SELECT count(DISTINCT company_id) INTO v FROM public.onboard_assignment_sheet_items;
  IF v > 1 THEN RAISE EXCEPTION 'onboard_assignment_sheet_items derived % companies; a multi-carrier review is owed', v; END IF;
END $$;
ALTER TABLE public.onboard_assignment_sheet_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.onboard_assignment_sheet_items
  ADD CONSTRAINT onboard_assignment_sheet_items_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX onboard_assignment_sheet_items_company_id_idx ON public.onboard_assignment_sheet_items(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.onboard_assignment_sheet_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- contractor_pay_setup: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.contractor_pay_setup x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'contractor_pay_setup: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.contractor_pay_setup ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.contractor_pay_setup ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.contractor_pay_setup ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.contractor_pay_setup
  ADD CONSTRAINT contractor_pay_setup_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX contractor_pay_setup_company_id_idx ON public.contractor_pay_setup(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.contractor_pay_setup
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- forecast_deductions: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.forecast_deductions x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'forecast_deductions: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.forecast_deductions ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.forecast_deductions ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.forecast_deductions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.forecast_deductions
  ADD CONSTRAINT forecast_deductions_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX forecast_deductions_company_id_idx ON public.forecast_deductions(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.forecast_deductions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- forecast_expenses: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.forecast_expenses x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'forecast_expenses: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.forecast_expenses ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.forecast_expenses ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.forecast_expenses ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.forecast_expenses
  ADD CONSTRAINT forecast_expenses_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX forecast_expenses_company_id_idx ON public.forecast_expenses(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.forecast_expenses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- forecast_loads: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.forecast_loads x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'forecast_loads: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.forecast_loads ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.forecast_loads ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.forecast_loads ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.forecast_loads
  ADD CONSTRAINT forecast_loads_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX forecast_loads_company_id_idx ON public.forecast_loads(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.forecast_loads
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- ica_contracts: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.ica_contracts x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'ica_contracts: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.ica_contracts ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.ica_contracts ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.ica_contracts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.ica_contracts
  ADD CONSTRAINT ica_contracts_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX ica_contracts_company_id_idx ON public.ica_contracts(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.ica_contracts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- onboarding_status: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.onboarding_status x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'onboarding_status: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.onboarding_status ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.onboarding_status ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.onboarding_status ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.onboarding_status
  ADD CONSTRAINT onboarding_status_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX onboarding_status_company_id_idx ON public.onboarding_status(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.onboarding_status
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- operator_offboarding_steps: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.operator_offboarding_steps x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'operator_offboarding_steps: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.operator_offboarding_steps ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.operator_offboarding_steps ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.operator_offboarding_steps ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.operator_offboarding_steps
  ADD CONSTRAINT operator_offboarding_steps_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX operator_offboarding_steps_company_id_idx ON public.operator_offboarding_steps(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.operator_offboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- onboard_assignment_sheets: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.onboard_assignment_sheets x WHERE COALESCE((SELECT p.company_id FROM public.operators p WHERE p.id = x.operator_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'onboard_assignment_sheets: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.onboard_assignment_sheets ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.onboard_assignment_sheets ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.onboard_assignment_sheets ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.onboard_assignment_sheets
  ADD CONSTRAINT onboard_assignment_sheets_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX onboard_assignment_sheets_company_id_idx ON public.onboard_assignment_sheets(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.onboard_assignment_sheets
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- load_stops: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.load_stops x WHERE COALESCE((SELECT p.company_id FROM public.loads p WHERE p.id = x.load_id), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'load_stops: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.load_stops ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.load_stops ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.load_stops ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.load_stops
  ADD CONSTRAINT load_stops_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX load_stops_company_id_idx ON public.load_stops(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.load_stops
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- messages: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.messages x WHERE COALESCE(COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.sender_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.sender_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.sender_id AND w.company_id IS NOT NULL LIMIT 1)), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'messages: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.messages ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.messages ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.messages ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX messages_company_id_idx ON public.messages(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- staff_ui_preferences: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.staff_ui_preferences x WHERE COALESCE(COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.user_id AND w.company_id IS NOT NULL LIMIT 1)), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'staff_ui_preferences: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.staff_ui_preferences ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.staff_ui_preferences ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.staff_ui_preferences ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.staff_ui_preferences
  ADD CONSTRAINT staff_ui_preferences_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX staff_ui_preferences_company_id_idx ON public.staff_ui_preferences(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.staff_ui_preferences
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- user_view_preferences: CONSTANT-DEFAULT-THEN-DROP (UPDATE fires triggers). Derivation checked read-only first.
DO $$ DECLARE v bigint; BEGIN
  SELECT count(*) INTO v FROM public.user_view_preferences x WHERE COALESCE(COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = x.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = x.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT w.company_id FROM public.truck_owners w WHERE w.user_id = x.user_id AND w.company_id IS NOT NULL LIMIT 1)), '00000000-0000-0000-0000-000000000000'::uuid) <> '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
  IF v > 0 THEN RAISE EXCEPTION 'user_view_preferences: % rows do not derive to the sole carrier', v; END IF;
END $$;
ALTER TABLE public.user_view_preferences ADD COLUMN company_id uuid DEFAULT '6b54d0e6-8743-4284-b55b-8cd094b093dd'::uuid;
ALTER TABLE public.user_view_preferences ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.user_view_preferences ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.user_view_preferences
  ADD CONSTRAINT user_view_preferences_company_id_fkey FOREIGN KEY (company_id)
  REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX user_view_preferences_company_id_idx ON public.user_view_preferences(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.user_view_preferences
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
