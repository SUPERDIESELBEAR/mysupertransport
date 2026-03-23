
## Email Catalog for Management

### What this is

A new **Email Catalog** view inside the Management Portal that shows management a browseable, organized catalog of every automated email the system sends. Each card shows the subject line, recipient type, and a visual preview of the rendered HTML email — exactly as operators, staff, and applicants receive it.

### Email inventory (from the codebase)

**Onboarding Milestones** (10 templates — `notify-onboarding-update`):
- Background Check Cleared
- Background Check Flagged
- ICA Ready to Sign
- ICA Complete
- Drug Screening Scheduled
- MO Registration Filed
- MO Registration Received
- Fully Onboarded
- Document Received
- Go-Live Date Confirmed

**Notifications** (8 templates — `send-notification`):
- New Application Received (→ staff)
- Application Approved (→ applicant)
- Application Denied (→ applicant)
- Onboarding Milestone (staff copy)
- Onboarding Milestone (operator copy, 8 sub-variants)
- Truck Down Alert
- New Message Notification
- Insurance Request

**Compliance Reminders** (2 templates — `check-cert-expiry` / `send-cert-reminder`):
- CDL / Med Cert Expiring (60-day operator)
- CDL / Med Cert Expiring (30-day critical operator)
- CDL / Med Cert Expiring (staff copy)
- CDL / Med Cert Expired

**Invitations** (3 templates):
- Applicant Invite (`invite-applicant`)
- Staff Invite (`invite-staff`)
- Operator Welcome (`invite-operator`)

**Document Hub** (3 templates — `notify-document-update`):
- New Document Published
- Document Updated
- Acknowledgment Reminder

### Implementation

**New component**: `src/components/management/EmailCatalog.tsx`
- All template HTML is defined in this component as static preview data (no live data needed — uses placeholder names like "John Smith", sample dates)
- Each template entry includes: `category`, `title`, `recipient` (operator/staff/applicant), `subject`, and a `renderHtml(name, extra?)` function that calls the same `buildEmail` / helper functions mirrored as client-side helpers (since edge function code can't be imported in the browser)
- The `buildEmail` logic is duplicated client-side as a pure JS helper — same HTML, no Deno imports
- Layout: filter tabs by category at the top, card grid below with subject + recipient badge + "Preview" button
- Preview opens an `<iframe srcDoc={html}>` in a modal dialog (full rendered email, 600px wide, scrollable)
- Each card also shows a "Who receives this" chip: Operator / Staff / Applicant / Management

**Portal changes**: `src/pages/management/ManagementPortal.tsx`
- Add `'email-catalog'` to the `ManagementView` type
- Add nav item: `{ label: 'Email Catalog', icon: <Mail className="h-4 w-4" />, path: 'email-catalog' }`
- Add `{view === 'email-catalog' && <EmailCatalog />}` to the render block

### Files changed
1. `src/components/management/EmailCatalog.tsx` — new component (all catalog logic and previews)
2. `src/pages/management/ManagementPortal.tsx` — add nav item and view render

### What management sees
- Sidebar: "Email Catalog" under the existing nav items
- Page: category filter tabs (All / Onboarding / Invitations / Compliance / Documents / Notifications), then a grid of email cards
- Each card: email title, subject line, recipient chip, "Preview" button
- Preview modal: full rendered email in an iframe — exactly what the operator/staff would see in their inbox, using a sample name and date

### No backend changes needed
All template HTML already exists in the codebase. The catalog renders previews client-side using a mirrored `buildEmail` helper — no edge function calls, no database queries.
