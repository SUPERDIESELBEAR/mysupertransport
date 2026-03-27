

## Rename "Email Catalog" to "Content Manager" and Add Page Previews

### What changes

Rename the "Email Catalog" nav item and component to **"Content Manager"** (or similar — see options below), then add a new "Pages" tab alongside the existing email templates tab. The Pages tab will list the app's public-facing pages (Splash Page, Welcome Operator, Application Form) with preview and edit capabilities.

### Naming options

A few candidates for the renamed section:
- **Content Manager** — broad, covers emails + pages
- **Pages & Emails** — literal and clear
- **Content Catalog** — keeps the "catalog" convention

### How it works

1. **Rename in sidebar nav**: Change `Email Catalog` → `Content Manager` in the Management Portal nav items array (line ~694). Update the icon to something broader (e.g. `LayoutTemplate` or `PanelTop`).

2. **Add tabs inside EmailCatalog component**: The component already uses `Tabs` for filtering email categories. Add a top-level tab switcher: **Emails** | **Pages**. The existing email catalog content goes under the Emails tab.

3. **Pages tab content**: A simple card list showing:
   - **Splash Page** (`/`) — the public application landing page
   - **Welcome Operator** (`/welcome`) — the invited operator setup page
   - **Application Form** (`/apply`) — the multi-step application
   
   Each card shows the page name, description, route, and a "Preview" button that opens the page in a new browser tab (or an iframe dialog).

4. **No breaking changes**: The nav `path` stays `email-catalog` to avoid URL breakage, or we update it to `content-manager` and update all references (type union, URL param checks, view conditionals).

### Files changed

| File | Change |
|------|--------|
| `src/pages/management/ManagementPortal.tsx` | Rename nav label + icon, update view path references if desired |
| `src/components/management/EmailCatalog.tsx` | Add top-level Emails/Pages tab switcher; add Pages card list with preview links |

