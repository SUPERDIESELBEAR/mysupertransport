# Messages upgrade: staff contacts, new-message menu, settings panel, read state

## 1. Staff contacts tab

The Messages contacts list only builds threads from the `operators` table, so staff can never see each other. Add a two-tab rail:

- **Drivers** — today's operator list, unchanged.
- **Staff** — every user with an `owner`, `management`, `onboarding_staff`, or `dispatcher` role (excluding yourself), with their role as the subtitle.

Groups stay in their own section above both tabs. Unread counts show per tab so a staff DM never gets lost behind the driver list. Direct messages between two staff members are already permitted by the database rules, so this is a UI/data-loading change only.

## 2. "+" opens a menu: New message or New group

Today "+" jumps straight into the group builder. It becomes a small dropdown:

- **New message** — searchable single-person picker across Staff and Drivers; picking someone opens (or creates) that DM thread.
- **New group** — the existing group builder, with the candidate list split into Staff and Drivers sections and "select all staff" convenience, so mixed staff+driver groups are easy.

## 3. Group message vs. Bulk message

They should stay separate — they solve different problems:

| | Group chat | Bulk message |
|---|---|---|
| Shape | One shared thread everyone sees | Many separate 1-on-1 threads |
| Replies | Visible to the whole group | Come back privately to you only |
| Recipients | A small named, persistent roster | A filtered audience (by stage, dispatch status, etc.), one-shot |
| Use it for | Coordinating a load, an onboarding case, a staff huddle | Announcements, reminders, policy blasts |

Merging them would either expose every driver's reply to all other drivers (a privacy problem) or turn group chat into a broadcast tool with no conversation. Instead of merging, they get clearer signposting: the Bulk Message button gains the subtitle "Announcement to many — private replies", and the group builder says "Shared thread — everyone sees replies". A "Convert to group chat" action on the bulk recipient list is a nice future add-on but is out of scope here.

## 4. Settings popover overlapping the dashboard menu

The availability settings render in a `Popover` anchored to a narrow left-hand column, so it drifts left over the management sidebar and is cut off. Replace it with a right-hand slide-over sheet (`Sheet`, ~420px, scrollable) titled "Message settings". It sits above the page, never overlaps the sidebar, and has room for the extra settings below.

## 5. Additional staff message settings

In the same sheet, grouped into sections:

- **Availability** (existing): who can message you, short note, auto-assigned drivers.
- **Working hours / away message** — optional hours and an auto-reply note shown at the top of a thread when someone messages you outside them.
- **Out of office** — toggle with an optional backup staff member; shows "Away — contact <name>" on your threads.
- **Alerts** — sound on/off, desktop notification on/off (reuses the existing preference), and email digest cadence for missed messages.
- **Default view** — open Messages on Unread vs. All.
- **Read receipts** — allow drivers to see when you've read their message.

## 6. Read / unread handling

Yes — worth adding, and it makes the inbox scannable:

- **Filter chips** at the top of the rail: All / Unread / Groups (counts on each).
- **Unread rows** get a gold left bar, bold name, and a count badge (already partly present) — plus a subtle unread dot in the collapsed rail.
- **Mark as read / Mark as unread** on each row (right-click or a hover "..." menu) so staff can flag threads they need to come back to.
- **"Unread only" toggle persists** per user.
- **New-message divider** inside a thread showing where you left off.

## 7. Other UX improvements worth adding

- Typing indicator and delivered/read ticks in the thread.
- Search across message *content*, not just contact names.
- Quick replies / saved snippets (the bulk templates table can back these).
- Attachment previews inline instead of filename-only.
- Pin a thread to the top of the rail (message pinning already exists).
- "Snooze" / follow-up reminder on a thread.
- Jump-to-driver-record link from the thread header.

These are listed for prioritization; the build below covers sections 1, 2, 4, 5 (Alerts + Default view only), and 6.

## Technical notes

- `src/components/staff/MessagesView.tsx`: add a `contactTab: 'drivers' | 'staff'` state; load staff via `user_roles` + the existing `get_staff_contact_info` RPC (same pattern as `NewGroupModal`); reuse `buildThreads` with a generic contact list instead of the operator-only list; add All/Unread filter chips and per-row mark read/unread (updating `messages.read_at` for inbound rows).
- `src/components/messaging/NewGroupModal.tsx`: section the candidate list by `kind`, add select-all-staff.
- New `src/components/messaging/NewDirectMessageModal.tsx` for the single-person picker; the "+" becomes a `DropdownMenu`.
- `src/components/staff/MessagesView.tsx` settings trigger: swap `Popover` for `Sheet` (`side="right"`), keeping `StaffAvailabilityCard` as the first section.
- `StaffAvailabilityCard`: append an "Alerts" section wired to `getDesktopNotifPreference`/`setDesktopNotifPreference` plus a localStorage sound toggle and default-view preference. Working hours / out-of-office / read receipts need new columns on the staff message settings table — called out separately and not built in this pass unless you want them now.
- No new database policies required: DM policies already allow any authenticated sender/recipient pair.