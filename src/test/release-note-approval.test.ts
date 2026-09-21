/**
 * What's New approval workflow.
 *
 * The schema for this feature is staged in the draft and lands when the draft is
 * accepted, so these checks read the staged migration and the client code rather
 * than the live database. They fail on the old behaviour, where every INSERT
 * notified every staff role immediately with no review step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATION = readFileSync(
  join(ROOT, '.lovable/drafts/var_01m32a4twbexev1mjy249yke58/migrations/20260921170000_release_note_approval.sql'),
  'utf8',
);
const MANAGER = readFileSync(join(ROOT, 'src/components/management/ReleaseNotesManager.tsx'), 'utf8');
const HOOK = readFileSync(join(ROOT, 'src/hooks/useUnreadReleaseNotes.ts'), 'utf8');

describe('staged migration', () => {
  it('adds the review vocabulary without dropping anything', () => {
    expect(MIGRATION).toContain("CREATE TYPE public.release_note_status AS ENUM ('draft','pending','approved','denied','archived')");
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS status public\.release_note_status NOT NULL DEFAULT 'pending'/);
    expect(MIGRATION).not.toMatch(/DROP COLUMN(?! IF EXISTS status, \.\.\.)/);
    expect(MIGRATION).not.toMatch(/ALTER COLUMN \w+ TYPE/);
  });

  it('only notifies staff once an announcement is approved', () => {
    // The old trigger fired on every INSERT regardless of status.
    expect(MIGRATION).toContain('DROP TRIGGER IF EXISTS trg_notify_staff_on_release_note ON public.release_notes');
    expect(MIGRATION).toContain("FOR EACH ROW WHEN (NEW.status = 'approved')");
    expect(MIGRATION).toContain("FOR EACH ROW WHEN (NEW.status = 'approved' AND OLD.status <> 'approved')");
  });

  it('sends only to the chosen audience', () => {
    expect(MIGRATION).toContain('ur.role::text = ANY(v_roles)');
    expect(MIGRATION).toContain("ur.role IN ('onboarding_staff', 'dispatcher', 'management', 'owner')");
  });

  it('gates approve, deny and archive on a permission', () => {
    expect(MIGRATION).toContain("'release_note.approve'");
    expect(MIGRATION).toContain("NEW.status NOT IN ('approved','denied','archived')");
    expect(MIGRATION).toContain("public.has_permission(auth.uid(), 'release_note.approve')");
    expect(MIGRATION).toContain("USING ERRCODE = '42501'");
    // No role grant: the owner passes through the short-circuit in has_permission.
    expect(MIGRATION).not.toMatch(/INSERT INTO public\.role_permissions/);
  });

  it('keeps the read table tenant-isolated, owner-scoped and closed to anon', () => {
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS public.release_note_reads');
    expect(MIGRATION).toContain('GRANT SELECT, INSERT, UPDATE ON public.release_note_reads TO authenticated');
    expect(MIGRATION).toContain('REVOKE ALL ON public.release_note_reads FROM anon');
    expect(MIGRATION).toContain('AS RESTRICTIVE FOR ALL TO authenticated');
    expect(MIGRATION).toContain('user_id = auth.uid()');
  });

  it('hides the queue, denials and the archive from ordinary staff', () => {
    expect(MIGRATION).toContain("status = 'approved'");
    expect(MIGRATION).toContain('public.is_staff(auth.uid())');
  });

  it('leaves already published announcements published', () => {
    expect(MIGRATION).toMatch(/UPDATE public\.release_notes[\s\S]*SET status = 'approved'/);
  });
});

describe('composer', () => {
  it('submits as pending for anyone but the owner', () => {
    expect(MANAGER).toContain("status: isOwner ? 'approved' : 'pending'");
    expect(MANAGER).toContain('Submit for Approval');
  });

  it('offers approve, deny with a reason, and archive to the owner only', () => {
    expect(MANAGER).toContain("void review(n.id, 'approved')");
    expect(MANAGER).toContain("void review(id, 'denied', denyReason.trim())");
    expect(MANAGER).toContain("void review(n.id, 'archived')");
    expect(MANAGER).toMatch(/isOwner && \(\s*<div className="flex flex-wrap gap-2">/);
  });

  it('never offers drivers as an audience', () => {
    expect(MANAGER).not.toMatch(/'operator'|'driver'/);
  });
});

describe('unread pop-up', () => {
  it('counts an announcement needing confirmation as unread until acknowledged', () => {
    expect(HOOK).toContain('return n.requires_ack && !read.acknowledged_at');
  });

  it('only ever considers published announcements', () => {
    expect(HOOK).toContain(".eq('status', 'approved')");
  });
});
