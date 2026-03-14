
## Current Logo Audit

**Splash/centered pages** (Login, Reset Password, Welcome error/success states):
- Currently `h-16 max-w-[240px]` — this is 64px tall

**Header ribbon pages with left sidebar** (StaffLayout — Staff Portal, Management Portal, Dispatch Portal):
- Collapsed sidebar: `h-8` (32px), no max-width constraint
- Expanded sidebar: `h-10` (40px), no max-width constraint
- Issue: no `object-contain` and no `max-w` — the logo can be squished inside the narrow `w-16` collapsed sidebar slot

**Header ribbon pages without left sidebar** (Operator Portal, Application Form):
- Currently `h-10 max-w-[180px] object-contain shrink-0` — this is what the user likes

---

## Plan

### Two categories of changes:

**Category 1 — Splash/centered pages: increase logo size**
Bump from `h-16` (64px) to `h-20` (80px) and from `max-w-[240px]` to `max-w-[320px]` across:
- `src/pages/LoginPage.tsx` — line 70
- `src/pages/ResetPassword.tsx` — line 100 (expired state) and line 131 (main form)
- `src/pages/WelcomeOperator.tsx` — line 168 (token error), line 242 (success), line 278 (main left panel)

**Category 2 — Left sidebar pages (StaffLayout): fix squished logo**
In `src/components/layouts/StaffLayout.tsx` line 70–74, the logo sits inside a `h-16` flex row inside the sidebar. When collapsed the sidebar is only `w-16` (64px) with `px-4` padding leaving ~32px of space, which crushes the image.

Fix approach:
- Collapsed sidebar (`!sidebarOpen && !isMobileDrawer`): show a square cropped/contained icon version — use `h-8 w-8 object-contain` so it fits cleanly in the tight slot
- Expanded sidebar (`sidebarOpen || isMobileDrawer`): use `h-10 w-auto max-w-[150px] object-contain` — slightly larger and properly constrained
- Add `object-contain` to both states (currently missing)

This mirrors the fix the user liked on the Apply page ribbon bar.

---

## Files to change

| File | Change |
|---|---|
| `src/pages/LoginPage.tsx` | `h-16 max-w-[240px]` → `h-20 max-w-[320px]` |
| `src/pages/ResetPassword.tsx` | Both instances `h-16 max-w-[240px]` → `h-20 max-w-[320px]` |
| `src/pages/WelcomeOperator.tsx` | All 3 instances `h-16 max-w-[240px]` → `h-20 max-w-[320px]` |
| `src/components/layouts/StaffLayout.tsx` | Fix collapsed/expanded logo sizing with `object-contain` and proper constraints |

No database changes needed.
