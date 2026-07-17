
# Notifications Restructure — Management Dashboard

Goal: turn the bell dropdown and Notifications page from a flat time‑sorted list into a triage surface that surfaces what needs action, groups related events, and lets a staff user resolve items in place.

Nothing about how notifications are *generated* changes. This is a UX + read‑layer restructure on top of the existing `notifications` table (`type`, `entity_type`, `entity_id`, `read_at`, `sent_at`, `title`, `body`, `link`, `channel`), plus a small schema addition for `priority`, `snoozed_until`, `assigned_to`, and `archived_at`.

---

## 1. Recommended organizing model

Two lenses layered over the same feed:

**Priority tier (primary — drives color and sort):**
- **Action Needed** — items requiring a staff response: new application, docs uploaded awaiting review, pay setup submitted, PEI correction requested, truck down, expiry in ≤30 days, application_denied appeal, message from operator.
- **Watch** — informational but time‑sensitive: onboarding milestone, dispatch status change, compliance_update within 90 days, release_note.
- **FYI** — background chatter: docs_uploaded confirmations already reviewed, older milestones, birthday/anniversary echoes.

Tier is derived from `type` (mapping table in code) with per‑type overrides. Truck Down is always pinned to the top of Action Needed regardless of age.

**Category (secondary — drives grouping and filters):**
Applications · Onboarding · Compliance · Dispatch · Equipment · Messages · System.

**Per‑driver rollup:** When 2+ notifications share the same `entity_type='operator'` + `entity_id` within 24 h, collapse them into one thread card (e.g., "Delease Carter — 3 updates"). Expanding shows the individual events, each still individually markable/actionable. Same idea for `entity_type='application'`.

---

## 2. Bell dropdown redesign (top‑right)

Keep the popover lightweight and focused on triage — power features live on the page.

Layout, top to bottom:
1. **Header row** — "Notifications" · unread count · Mark all read · gear icon → NotificationPreferencesModal.
2. **Segmented tabs** — `Action Needed (n)` · `All` · `Mentions`. Default lands on Action Needed when unread > 0, else All.
3. **Grouped list** (max 12 items visible, scroll):
   - Section headers by tier when on `All`; flat list when on `Action Needed`.
   - Each row: type icon (existing color chip) · title · one‑line body · relative time · unread dot.
   - Per‑driver rollups render as a single card with a small stack indicator (`+2 more`) and a caret to expand inline.
4. **Row hover / long‑press reveals inline actions** (icon buttons, no extra clicks):
   - **Open** (default click behavior — deep link, unchanged)
   - **Mark read / unread**
   - **Snooze** → 1 h / Tomorrow 8 am / Next Monday
   - **Assign** → typeahead of active staff (writes `assigned_to`, keeps in feed but tags "Assigned to …")
   - **Archive** (removes from default views; still queryable on the page)
5. **Footer** — "View all →" (unchanged deep link) and a small "Filters" link that opens the page with the current tab pre‑applied.

Behavior details:
- Popover closes on outside click and on route change (already handled).
- Realtime subscription unchanged; add optimistic update for snooze/assign so the row disappears immediately.
- Empty state per tab (e.g., "Nothing needs your attention right now — nice.").

---

## 3. Notifications page redesign (`view=notifications`)

Three‑pane layout on ≥lg, single column with a collapsible filter sheet on mobile.

**Left rail — Filters (persist per user via localStorage only, not the DB):**
- Tier: Action Needed · Watch · FYI
- Category: Applications · Onboarding · Compliance · Dispatch · Equipment · Messages · System
- State: Unread · Snoozed · Assigned to me · Archived
- Person: driver/applicant combobox (reuses `DriverCombobox`)
- Date: Today · 7d · 30d · Custom range
- Free‑text search across `title` + `body`

**Main pane — Feed:**
- Group by day header ("Today", "Yesterday", "Jul 14"), then priority within the day.
- Per‑driver rollup cards expand inline.
- Multi‑select checkboxes → bulk bar (Mark read · Snooze · Assign · Archive · Delete).
- Row actions same as bell + a "Copy link" for handoff.
- Pagination replaced by infinite scroll with the existing `PAGE_SIZE=25` window.

**Right rail — Context peek (desktop only, appears when a row is focused):**
- Renders the linked entity summary: for an operator, name + stage + current status chips + jump buttons (Open Detail, Open Binder, Open Messages). For an application, applicant name + stage. Uses lookups already used elsewhere.
- Removes the need to leave the page for common triage decisions.

**Analytics strip at top** (small, muted):
- 4 counts: Action Needed · Unread today · Snoozed · Assigned to me. Each is a filter shortcut.

---

## 4. New capabilities the plan introduces

- **Snooze** — hide a notification until a chosen time; it flips to unread again automatically.
- **Assign to teammate** — reroute an item to another staff member's queue; original recipient still sees it tagged "Assigned to …".
- **Archive** — remove from default views without deleting; recoverable via the Archived filter.
- **Bulk actions** on the page.
- **Per‑driver rollups** so a burst of doc uploads or milestone events for one operator reads as one thread.
- **Per‑category preferences** in NotificationPreferencesModal: for each category, choose Bell / Email / Both / Off. (SMS stays out per your earlier pause.)
- **Snoozed & Assigned queues** get their own filter chips.
- **"Assigned to me" mentions tab** in the bell.

---

## 5. What the plan explicitly does NOT change

- Notification producers (edge functions, DB triggers) — no touching what gets created or when.
- The bell in the operator, dispatch, and staff portals — this pass is management‑only. Same component (`NotificationBell.tsx`) picks up improvements automatically since those portals reuse it; behavior is gated by role so no regression.
- Deep‑link routing (`resolveRoute`) — kept as is, just called from the new row actions.
- Realtime channel structure and unread‑count logic.

---

## Technical details

**Schema additions (single migration):**
- `notifications.priority` — `text` (`'action'|'watch'|'fyi'`), default `'watch'`, backfilled from a `type → tier` mapping.
- `notifications.snoozed_until` — `timestamptz null`.
- `notifications.assigned_to` — `uuid null` referencing `auth.users(id)`.
- `notifications.archived_at` — `timestamptz null`.
- Indexes: `(user_id, read_at, snoozed_until)`, `(user_id, priority, sent_at desc)`, `(assigned_to) where assigned_to is not null`.
- Grants + RLS: extend existing `UPDATE` policy so a user can update these new columns only on rows where they're the recipient or the newly assigned staff.

**Type → tier + category mapping** lives in `src/lib/notifications/taxonomy.ts` (single source used by both bell and page). Shape:
```
{ type: 'truck_down', tier: 'action', category: 'dispatch', label: 'Truck Down' }
```

**Component work:**
- `src/components/NotificationBell.tsx` — add tabs, inline row actions, rollup rendering. Split JSX into `<NotifRow>` and `<NotifRollupRow>` subcomponents to keep file readable.
- `src/components/management/NotificationHistory.tsx` — replace flat list with 3‑pane layout: filter rail, feed with grouping + bulk bar, context peek pane. Reuse `DriverCombobox`, existing `FilePreviewModal`.
- `src/components/management/NotificationPreferencesModal.tsx` — add per‑category matrix (Bell / Email / Off).
- New helpers: `src/lib/notifications/rollup.ts` (24 h grouping), `src/lib/notifications/actions.ts` (snooze/assign/archive/bulk mutations wrapping `supabase.from('notifications').update(...)`).

**Filtering approach:** All filters resolved client‑side against a paginated server query filtered by `user_id`, `archived_at is null` (unless Archived tab), and `(snoozed_until is null or snoozed_until <= now())` for default views. Search uses `ilike` on `title`/`body` server‑side when a query is present.

**Backwards compatibility:** Existing notifications without `entity_type`/`entity_id` still route via the legacy `link` parser already in `resolveRoute` — no regression to older records.

---

## Rollout order (suggested)

1. Migration + taxonomy file + `actions.ts` helpers (no UI change yet).
2. Bell redesign — ship first, low risk, immediate daily UX win.
3. Notifications page rebuild.
4. Per‑category preferences in the modal.

Each step is independently shippable; nothing here forces a big‑bang release.
