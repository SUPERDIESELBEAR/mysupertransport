## PEI Queue Overhaul

Reorganizes the Previous Employment Investigations queue around applicant status, adds archiving, manual send dates, and staff tooling.

### 1. Status-grouped, collapsible layout
Replace the flat applicant list with four collapsible sections, each showing a count and each applicant's card inside:

```text
▸ Overdue (3)        — any employer past its 30-day deadline, unresolved
▸ Pending (5)        — nothing sent yet for any employer
▸ In Progress (8)    — at least one sent / follow-up / final notice outstanding
▸ Completed (12)     — every employer is Completed or GFE Documented
▸ Archived (4)       — manually archived applicants (collapsed by default)
```

An applicant appears in exactly one section, by highest-severity rule: Archived > Overdue > Pending/In Progress > Completed. Completed and Archived collapse by default; Overdue expands by default. Existing filter chips stay as a cross-cutting quick filter.

### 2. Auto-move to Completed
An applicant lands in Completed when every one of their employer requests is `completed` or `gfe_documented` — this already covers the day-30 auto-GFE from the existing cadence job, so the 30-day cycle naturally resolves into Completed with no extra step. Completed rows keep a "Resolved on {date}" line and remain fully viewable.

### 3. Manual date sent
New "Log send" action on each employer row opens a small dialog with a date picker plus a method selector (Email sent outside app / Fax / Mail / Phone) and an optional note.
- On a `pending` request: marks it Sent using the chosen date and starts the 30-day deadline from that date. No email is sent.
- On an already-sent request: edits the recorded send date and recomputes the deadline.
Both are audit-logged with the staff member's name.

### 4. Archive an applicant
"Archive" action on each applicant header (management only), with a required reason (Applicant withdrew / Did not onboard / Hired elsewhere / Duplicate / Other + free text).
- Moves all of that applicant's PEI requests into the Archived section.
- Stops the auto-cadence job from sending any further follow-ups or creating auto-GFEs for them.
- Fully reversible via "Restore" in the Archived section.
- Archived applicants are excluded from the stat tiles and the compliance counts.

### 5. Additional staff/management tooling (all included)
- **Search box** — filter by applicant name or previous employer name, live.
- **Staff notes per employer request** — a notes field on each row, timestamped and attributed, for logging call attempts and back-and-forth.
- **Phone attempt logging** — "Log phone attempt" records date, who was reached, and outcome, appended to the request's event timeline. Counts as documented good-faith effort.
- **CSV export** — exports the current view (respecting section/filter/search) with applicant, employer, status, date sent, deadline, days remaining, resolution, and GFE reason.
- **Aging indicator** — each in-progress row shows a small day counter (e.g. "Day 12 of 30") so staff can see cadence position at a glance.
- **Stat tiles updated** to: Active Applicants / Awaiting Response / Overdue / Completed this month.

---

### Technical notes

**Database (one migration)**
- Add to `pei_requests`: `send_method text`, `manual_send_logged_by text`, `staff_notes jsonb default '[]'`.
- Add to `applications`: `pei_archived_at timestamptz`, `pei_archived_by uuid`, `pei_archived_by_name text`, `pei_archive_reason text`.
- Extend `pei_request_events` event type enum with `phone_attempt` and `manual_send_logged`.
- Update `get_pei_queue()` to also return `pei_archived_at`, `pei_archive_reason`, `send_method`, and a computed `days_since_sent`.
- Add `set_pei_deadline()` handling so a manually changed `date_sent` recomputes `deadline_date`; keep the existing first-send behaviour.
- New security-definer RPCs `archive_applicant_pei(application_id, reason)` and `restore_applicant_pei(application_id)`, staff-gated via `is_staff()`.
- Grants for `authenticated` and `service_role` on any touched objects; no new tables required.

**Edge function**
- `pei-auto-cadence`: add `pei_archived_at is null` to the candidate filter so archived applicants stop receiving automated follow-ups and auto-GFEs.

**Frontend**
- `src/lib/pei/types.ts` — extend `PEIQueueRow` and `PEIRequest` with the new fields.
- `src/lib/pei/api.ts` — add `logManualSend`, `logPhoneAttempt`, `addStaffNote`, `archiveApplicant`, `restoreApplicant`.
- `src/components/pei/PEIQueuePanel.tsx` — restructure into status sections, add search, export, and section-level expand/collapse state.
- New: `src/components/pei/LogSendModal.tsx`, `src/components/pei/ArchiveApplicantDialog.tsx`, `src/components/pei/StaffNotesPopover.tsx`, `src/lib/pei/exportCsv.ts`.
- Zod validation on all new inputs (date not in the future, reason and note length limits).
</content>
<summary>Restructure the PEI Queue into status-grouped collapsible sections with auto-Completed, applicant archiving, manual send-date logging, staff notes, phone-attempt logging, search, and CSV export.</summary>
</invoke>
