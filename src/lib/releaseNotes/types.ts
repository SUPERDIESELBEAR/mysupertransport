/**
 * What's New announcements — shared shapes and vocabulary.
 *
 * The approval columns and the release_note_reads table are staged in this
 * draft's migration and land when the draft is accepted, so the generated
 * database types do not describe them yet. `notesDb` is the ONE place that
 * loosens typing for those reads and writes; every consumer works against the
 * interfaces below instead of guessing shapes at each call site.
 */
import { supabase } from '@/integrations/supabase/client';

export type ReleaseNoteStatus = 'draft' | 'pending' | 'approved' | 'denied' | 'archived';
export type ReleaseNoteCategory = 'feature' | 'change' | 'fix' | 'reminder';

/** Staff roles an announcement can be aimed at. Drivers are deliberately absent. */
export const STAFF_AUDIENCE_ROLES = ['management', 'onboarding_staff', 'dispatcher', 'owner'] as const;
export type StaffAudienceRole = (typeof STAFF_AUDIENCE_ROLES)[number];

export const AUDIENCE_LABELS: Record<StaffAudienceRole, string> = {
  management: 'Management',
  onboarding_staff: 'Onboarding',
  dispatcher: 'Dispatch',
  owner: 'Owner',
};

export const CATEGORY_LABELS: Record<ReleaseNoteCategory, string> = {
  feature: 'New feature',
  change: 'Change',
  fix: 'Fix',
  reminder: 'Reminder',
};

export const STATUS_LABELS: Record<ReleaseNoteStatus, string> = {
  draft: 'Draft',
  pending: 'Pending approval',
  approved: 'Published',
  denied: 'Sent back',
  archived: 'Archived',
};

export interface ReleaseNote {
  id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
  status: ReleaseNoteStatus;
  category: ReleaseNoteCategory;
  target_roles: string[];
  link_route: string | null;
  link_label: string | null;
  requires_ack: boolean;
  is_pinned: boolean;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  denial_reason: string | null;
  published_at: string | null;
  flagged_faq_ids: string[];
  /** True when the build itself wrote the draft (vs. a hand-typed submission). */
  auto_drafted: boolean;
}

export interface ReleaseNoteRead {
  id: string;
  release_note_id: string;
  user_id: string;
  seen_at: string;
  acknowledged_at: string | null;
}

export const RELEASE_NOTE_COLUMNS =
  'id, title, body, created_by, created_at, status, category, target_roles, link_route, link_label, ' +
  'requires_ack, is_pinned, submitted_by, submitted_at, reviewed_by, reviewed_at, denial_reason, ' +
  'published_at, flagged_faq_ids, auto_drafted';

/** Untyped-by-design access to the staged columns and table. See the file header. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const notesDb = supabase as any;

/** Does this viewer fall inside the announcement's chosen audience? */
export function isInAudience(note: Pick<ReleaseNote, 'target_roles'>, roles: string[]): boolean {
  if (!note.target_roles || note.target_roles.length === 0) return true;
  return roles.some(r => note.target_roles.includes(r));
}
