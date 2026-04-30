## Goal

Rename the two "Staff Sign In" links on the public recruiting splash page (`/`) to simply "Sign In" so the label is accurate for both staff and drivers (who both authenticate via `/login`).

## Changes

**File: `src/pages/SplashPage.tsx`**

Two edits, both label-only — no behavior, routing, or styling changes.

1. **Header link** (line ~80): change link text from `Staff Sign In` to `Sign In`.
2. **Footer link** (line ~193): change link text from `Staff Sign In` to `Sign In`.

The `/login` route, click handlers, classes, and surrounding markup all stay exactly as they are.

**File: `public/version.json`**

Bump the version string so any user on a cached splash bundle pulls the new label on next visit.

## Out of scope

- No changes to the `/login` page itself.
- No changes to the "Check Application Status" link.
- No new routes, no new pages.
