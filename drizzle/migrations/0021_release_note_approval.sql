-- WHAT'S NEW — owner approval, audience, and read receipts.
--
-- Today any management writer's INSERT into release_notes notifies every staff
-- role and fires the email immediately: there is no review step. This pass puts
-- the owner in front of delivery without adding a second announcement channel.
--
-- Additive only: no column is dropped, renamed or retyped. Existing rows are
-- backfilled to 'approved' so nothing already published disappears.
--
-- Undo (for the record, not run here):
--   DROP TRIGGER IF EXISTS aa_enforce_release_note_review ON public.release_notes;
--   DROP TRIGGER IF EXISTS trg_notify_staff_on_release_note_approved ON public.release_notes;
--   CREATE TRIGGER trg_notify_staff_on_release_note AFTER INSERT ON public.release_notes
--     FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_release_note();
--   DROP TABLE IF EXISTS public.release_note_reads;
--   ALTER TABLE public.release_notes DROP COLUMN IF EXISTS status, ... (every column below);
--   DROP TYPE IF EXISTS public.release_note_status; DROP TYPE IF EXISTS public.release_note_category;
--   DELETE FROM public.permission_actions WHERE key = 'release_note.approve';

-- 1. THE TWO NEW VOCABULARIES.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'release_note_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.release_note_status AS ENUM ('draft','pending','approved','denied','archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'release_note_category' AND n.nspname = 'public') THEN
    CREATE TYPE public.release_note_category AS ENUM ('feature','change','fix','reminder');
  END IF;
END $$;

-- 2. THE COLUMNS. Default status is 'pending': an ordinary INSERT by a
-- management writer now waits for the owner and sends nothing.
ALTER TABLE public.release_notes
  ADD COLUMN IF NOT EXISTS status public.release_note_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS category public.release_note_category NOT NULL DEFAULT 'feature',
  ADD COLUMN IF NOT EXISTS target_roles text[] NOT NULL
    DEFAULT ARRAY['onboarding_staff','dispatcher','management','owner']::text[],
  ADD COLUMN IF NOT EXISTS link_route text,
  ADD COLUMN IF NOT EXISTS link_label text,
  ADD COLUMN IF NOT EXISTS requires_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  -- Marks a draft written by the build itself so the owner can tell a
  -- machine-written draft from a hand-submitted one.
  ADD COLUMN IF NOT EXISTS auto_drafted boolean NOT NULL DEFAULT false;

-- Everything already posted was delivered: it is approved history, not a queue.
UPDATE public.release_notes
   SET status = 'approved',
       published_at = COALESCE(published_at, created_at),
       submitted_by = COALESCE(submitted_by, created_by),
       submitted_at = COALESCE(submitted_at, created_at)
 WHERE status = 'pending' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS release_notes_status_created_idx
  ON public.release_notes (status, created_at DESC);

-- 3. WHO MAY APPROVE. Owner only: the owner holds every permission through the
-- short-circuit in has_permission, so no role_permissions row is granted here.
-- Management keeps its existing write access, which now produces pending rows.
INSERT INTO public.permission_actions (key, label, description, category, kind) VALUES
  ('release_note.approve', 'Approve, deny or archive an announcement',
   'Decide whether a staff announcement is sent, sent back, or shelved.',
   'content', 'change')
ON CONFLICT (key) DO NOTHING;

-- 4. THE GATE. Fires only when the status itself moves into a reviewed state,
-- so ordinary edits to a draft are untouched.
CREATE OR REPLACE FUNCTION public.enforce_release_note_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('approved','denied','archived') THEN
    RETURN NEW;
  END IF;

  -- Service-role writers have no auth.uid(); nothing in the product reviews
  -- announcements on their behalf today.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_permission(auth.uid(), 'release_note.approve') THEN
    RAISE EXCEPTION
      'Not authorized to approve, deny or archive an announcement. Releasing an announcement to staff is limited to the owner.'
      USING ERRCODE = '42501';
  END IF;

  NEW.reviewed_by := COALESCE(auth.uid(), NEW.reviewed_by);
  NEW.reviewed_at := now();
  IF NEW.status = 'approved' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_release_note_review() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_release_note_review() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_release_note_review() FROM authenticated;

DROP TRIGGER IF EXISTS aa_enforce_release_note_review ON public.release_notes;
CREATE TRIGGER aa_enforce_release_note_review
  BEFORE UPDATE ON public.release_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_release_note_review();

-- 5. DELIVERY MOVES TO APPROVAL. Same body as before, except the audience comes
-- from target_roles instead of every staff role unconditionally.
CREATE OR REPLACE FUNCTION public.notify_staff_on_release_note()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_staff RECORD;
  v_roles text[] := COALESCE(NULLIF(NEW.target_roles, '{}'::text[]),
                             ARRAY['onboarding_staff','dispatcher','management','owner']::text[]);
  v_fn_url CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/send-release-note';
  v_anon   CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  FOR v_staff IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role::text = ANY(v_roles)
      AND ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')
  LOOP
    IF COALESCE(
      (SELECT in_app_enabled FROM public.notification_preferences
       WHERE user_id = v_staff.user_id AND event_type = 'release_note' LIMIT 1),
      TRUE
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_staff.user_id,
        '🆕 ' || NEW.title,
        NEW.body,
        'release_note',
        'in_app',
        '/management?view=whats-new'
      );
    END IF;
  END LOOP;

  PERFORM net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
    body    := jsonb_build_object('release_note_id', NEW.id::text, 'title', NEW.title, 'body', NEW.body)
  );

  RETURN NEW;
END;
$$;

-- The old unconditional AFTER INSERT trigger is what made the queue meaningless.
DROP TRIGGER IF EXISTS trg_notify_staff_on_release_note ON public.release_notes;
CREATE TRIGGER trg_notify_staff_on_release_note
  AFTER INSERT ON public.release_notes
  FOR EACH ROW WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.notify_staff_on_release_note();
DROP TRIGGER IF EXISTS trg_notify_staff_on_release_note_approved ON public.release_notes;
CREATE TRIGGER trg_notify_staff_on_release_note_approved
  AFTER UPDATE OF status ON public.release_notes
  FOR EACH ROW WHEN (NEW.status = 'approved' AND OLD.status <> 'approved')
  EXECUTE FUNCTION public.notify_staff_on_release_note();

-- 6. WHAT STAFF MAY SEE. Approved history, plus their own submissions. The
-- queue, denials and the archive belong to the reviewers.
DROP POLICY IF EXISTS "Staff can read release notes" ON public.release_notes;
CREATE POLICY "Staff can read release notes"
  ON public.release_notes FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (
      status = 'approved'
      OR created_by = auth.uid()
      OR public.has_role(auth.uid(), 'management'::public.app_role)
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

-- 7. WHO HAS SEEN IT.
CREATE TABLE IF NOT EXISTS public.release_note_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_note_id uuid NOT NULL REFERENCES public.release_notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT,
  UNIQUE (release_note_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.release_note_reads TO authenticated;
GRANT ALL ON public.release_note_reads TO service_role;
REVOKE ALL ON public.release_note_reads FROM PUBLIC;
REVOKE ALL ON public.release_note_reads FROM anon;

DROP TRIGGER IF EXISTS aa_stamp_tenant_company_id ON public.release_note_reads;
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT OR UPDATE ON public.release_note_reads
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

ALTER TABLE public.release_note_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.release_note_reads;
CREATE POLICY tenant_isolation ON public.release_note_reads
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));

DROP POLICY IF EXISTS release_note_reads_own ON public.release_note_reads;
CREATE POLICY release_note_reads_own ON public.release_note_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS release_note_reads_read_reviewers ON public.release_note_reads;
CREATE POLICY release_note_reads_read_reviewers ON public.release_note_reads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'management'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS release_note_reads_reviewer_idx
  ON public.release_note_reads (release_note_id);
