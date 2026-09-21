## Order of work

1. The approval workflow — draft, pending, approved, denied, archived — so nothing sends unreviewed.
2. Audience selection, categories, and "Take me there".
3. The sign-in pop-up, the sidebar count, and read receipts.

## What each person sees

- **A management writer:** composes and clicks "Submit for approval". The announcement sits in their list marked Pending, with the denial reason shown if it comes back. They can edit and resubmit; they cannot publish.
- **Marcus:** a Pending Approval section at the top of What's New with the full text, the proposed audience, and three buttons — Approve & send, Deny (reason required), Archive. Archived items live in an "Archived" section, never sent, never deleted. He can also post directly, which skips the queue.
- **Everyone in the audience:** the pop-up on next sign-in, the sidebar count, the bell and email exactly as today, and the full history on What's New. Published items only — drafts, pending, denied, and archived are never visible to them.
- **Drivers:** nothing changes anywhere.

## Technical notes

**Schema, staged as additive migrations in this draft** (they apply when the draft is accepted):

- `release_notes` gains `status` (new enum `release_note_status`: draft / pending / approved / denied / archived, default `pending` so existing rows stay visible as published — existing rows backfilled to `approved`), `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`, `denial_reason`, `published_at`, plus `category` (enum: feature / change / fix / reminder), `target_roles` (text[], default all staff roles), `link_route`, `link_label`, `requires_ack`, `is_pinned`.
- New `release_note_reads` (id, release_note_id FK, user_id, seen_at, acknowledged_at, company_id with the standard stamp trigger). RLS: each person reads and writes only their own rows; owner and management read all. GRANT select/insert/update to `authenticated`, ALL to `service_role`, no `anon`.
- The notify-staff trigger moves from AFTER INSERT to fire only when `status` becomes `approved`, and it targets `target_roles` rather than every staff role. So a draft or pending row sends nothing — this is the change that makes the queue real.
- A BEFORE UPDATE trigger refuses a transition into `approved`, `denied`, or `archived` unless `has_permission(auth.uid(), 'release_note.approve')` is true, following the permissions pattern already in place. The grant goes to owner only (owner passes through the short-circuit); management keeps write access for drafts. Undo noted in the migration header.
- SELECT policy narrows non-approving staff to `status = 'approved'` rows plus their own drafts.

**Client:**

- `ReleaseNotesManager.tsx` splits into a composer (submit for approval / post directly for the owner), a Pending Approval queue, a published list, and an Archived list.
- `useUnreadReleaseNotes` — approved notes matching the viewer's roles with no `release_note_reads` row, plus any `requires_ack` note not yet acknowledged.
- `WhatsNewDialog` rendered once from the management and staff portal shells, suppressed by the existing unsaved-changes guard and in demo mode.
- Sidebar badge on the existing "What's New" nav entry; screen picker options come from `STAFF_HELP_INDEX`, which already lists every staff route and title.

**Untouched:** the email path (`send-release-note`, Staff & Admin routing and per-person preferences), the `release_note` bell type, the FAQ re-verification flagging, and the Staff Help ingest — with ingest limited to approved notes.
