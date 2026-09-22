/**
 * What's New approval workflow.
 *
 * These checks read the migration that created the review vocabulary plus the
 * client code. They fail on the old behaviour, where every INSERT notified every
 * staff role immediately with no review step.
 *
 * The migration was STAGED in a draft when this file was written, and the path
 * was hard-coded at `.lovable/drafts/<id>/migrations/...`. The draft was accepted
 * on 2026-09-21: the SQL applied as
 * `drizzle/migrations/0021_release_note_approval.sql` and the staged file was
 * deleted, so this file threw ENOENT at import time and every check in it
 * vanished from the run. It now resolves the migration by name through the shared
 * reader, which searches both migration folders in applied order.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appliedMigrationSql } from './helpers/migrationFunctions';

const ROOT = process.cwd();
const MIGRATION = appliedMigrationSql('release_note_approval');
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
    // Approve sits behind its own owner gate…
    expect(MANAGER).toMatch(/\{isOwner && \(\s*<Button[\s\S]{0,300}?Approve &amp; Send/);
    // …and deny/archive share one owner-only fragment.
    expect(MANAGER).toMatch(/\{isOwner && \(\s*<>[\s\S]{0,900}?Deny[\s\S]{0,900}?Archive[\s\S]{0,200}?<\/>/);
  });

  it('lets the owner or the author edit a pending draft before approval', () => {
    expect(MANAGER).toContain('(isOwner || n.created_by === myId) && (');
    expect(MANAGER).toContain('startEdit(n)');
    // Saving an edit updates the same row and it stays pending.
    expect(MANAGER).toContain(".eq('id', editingId)");
    expect(MANAGER).toContain('saveEditThenApprove');
  });

  it('marks machine-written drafts so the owner can tell them apart', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS auto_drafted boolean NOT NULL DEFAULT false');
    expect(MANAGER).toContain('n.auto_drafted');
    expect(MANAGER).toContain('Auto-drafted');
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

/**
 * Owner alert for a pending announcement.
 *
 * These checks fail on the old behaviour, where a pending draft notified nobody
 * at all.
 *
 * 2026-09-22: they used to read the STAGED draft migration under
 * `.lovable/drafts/.../migrations/`. That path disappeared the moment the draft
 * was accepted and the migration landed as 0031, and this file then failed with
 * ENOENT — a test pointing at a staging path is a test with a shelf life. It now
 * reads the applied migration, and 0033 as well, because 0033 is what routes the
 * notice through try_notify so a failed alert cannot abort the owner's update.
 */
const PENDING_MIGRATION =
  readFileSync(join(ROOT, 'drizzle/migrations/0031_notify_owner_pending_release_note.sql'), 'utf8') +
  '\n' +
  readFileSync(
    join(ROOT, 'drizzle/migrations/0033_harness_regrant_hourly_and_owner_notice_isolated.sql'),
    'utf8',
  );
const TAXONOMY = readFileSync(join(ROOT, 'src/lib/notifications/taxonomy.ts'), 'utf8');
const PORTAL = readFileSync(join(ROOT, 'src/pages/management/ManagementPortal.tsx'), 'utf8');

describe('pending announcement alerts the owner', () => {
  it('fires only when a note is pending, on insert and on the move into pending', () => {
    expect(PENDING_MIGRATION).toContain("FOR EACH ROW WHEN (NEW.status = 'pending')");
    expect(PENDING_MIGRATION).toContain("FOR EACH ROW WHEN (NEW.status = 'pending' AND OLD.status <> 'pending')");
  });

  it('writes to the owner role only', () => {
    expect(PENDING_MIGRATION).toContain("WHERE ur.role = 'owner'");
    expect(PENDING_MIGRATION).not.toMatch(/'dispatcher'|'onboarding_staff'|'operator'/);
  });

  it('stays in-app — no email on the pending path', () => {
    expect(PENDING_MIGRATION).not.toMatch(/net\.http_post/);
    expect(PENDING_MIGRATION).toContain("'in_app'");
  });

  it('sends the notice through try_notify so a failed alert cannot abort the update', () => {
    // 0031 shipped a bare INSERT INTO public.notifications, reintroducing the
    // defect the 2026-09-21 20:30 pass fixed for notify_staff_on_release_note():
    // one bad notification row would abort the transaction, so the owner's
    // announcement would fail to save because telling him about it failed.
    // notification-isolation.test.ts caught it; 0033 is the fix.
    expect(PENDING_MIGRATION).toContain('public.try_notify(');
    const finalBody = PENDING_MIGRATION.slice(
      PENDING_MIGRATION.lastIndexOf('CREATE OR REPLACE FUNCTION public.notify_owner_on_pending_release_note'),
    );
    expect(finalBody).not.toContain('INSERT INTO public.notifications');
  });

  it('pins search_path and closes EXECUTE to anon and authenticated', () => {
    expect(PENDING_MIGRATION).toContain('SET search_path = public, extensions');
    expect(PENDING_MIGRATION).toContain('FROM anon');
    expect(PENDING_MIGRATION).toContain('FROM authenticated');
  });

  it('registers the notification type so it is not rendered as a bare notification', () => {
    expect(TAXONOMY).toMatch(/release_note_pending:\s*\{[^}]*label: 'Update Awaiting Approval'/);
  });

  it('shows a waiting-for-approval count on the What\'s New menu entry', () => {
    expect(PORTAL).toContain('pendingCount: pendingReleaseNotes');
    expect(PORTAL).toContain('pendingReleaseNotes > 0');
  });
});
