## Store deferred "Preview as Operator" feature in memory

### 1. Create `mem://features/_backlog/preview-as-operator.md`

Frontmatter:
- `name`: Preview as Operator (deferred)
- `description`: Deferred enhancement to PwaReminderPreviewModal — personalize in-app + email preview with operator name and binder link
- `type`: feature

Body covers:
- **Status:** Deferred 2026-05-09 — not rejected, revisit later.
- **Idea:** Add an operator picker / toggle to `src/components/management/PwaReminderPreviewModal.tsx` so staff can preview the personalized in-app notification and email for a specific operator instead of the generic version.
- **Tokens considered:** `{{first_name}}`, `{{full_name}}`, `{{unit_number}}`, `{{binder_link}}` (`${APP_URL}/operator?tab=inspection-binder`), `{{coordinator_name}}`, `{{support_email}}`.
- **Scope options:**
  - *Light:* first_name + binder_link only.
  - *Full:* first_name, full_name, unit_number, binder_link, coordinator_name, support_email.
- **Architecture note:** Add `renderPwaReminder(operator?)` to `src/lib/pwaReminderContent.ts` returning `{ inAppTitle, inAppBody, emailSubject, emailHeading, emailHtml }`. Mirror the same merge logic in `supabase/functions/notify-pwa-install/index.ts` (no cross-import from `src/` in Deno) so preview = what is actually sent.
- **Recommendation:** Apply personalization to both preview AND the real send (otherwise preview misleads).
- **Out of scope:** SMS channel, cadence changes, hard Drive cutoff date.

### 2. Update `mem://index.md`

Add a new section after `## Memories`:

```
## Backlog / Deferred
- [Preview as Operator](mem://features/_backlog/preview-as-operator) — Personalize PWA reminder preview (and send) per operator
```

Preserve all existing Core and Memories content verbatim (code--write replaces the whole file).

### Out of scope
- No code changes to components, edge functions, or DB.
- No changes to the active `mem://features/pwa-install-reminders.md` entry.
