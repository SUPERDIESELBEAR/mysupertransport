## Goal

Make Staff Help the one place where any staff member can find *anywhere* in SUPERDRIVE (management dashboard + driver PWA) and *how* to do the action there — via keyword search with clickable "Go to" links AND an AI assistant whose answers cite live, clickable sources.

## Where the index lives (FAQ vs. Staff Help)

**The index is part of Staff Help.** It lives in the app code (`src/lib/staffHelp/index.ts`) and is rendered in the **Staff Help page** (`src/components/management/StaffHelpPortal.tsx`). It is *not* a visible page in the driver portal; it is a staff-only tool.

**FAQ Manager** keeps its current role: staff (owner/operator + staff audience) can create and edit long-form FAQ articles. Those articles are one of the sources the Staff Help AI can draw from. FAQ Manager is the *content editor*; Staff Help is the *search and navigation experience*.

What a staff member sees in Staff Help:
- A search bar at the top.
- As they type, a dropdown of matching index entries appears — each entry says what page/section and has a **Go →** button that jumps to that location in the app.
- If they press Enter or ask a natural-language question, the AI answers using both the index entries and the FAQ articles, and returns **live clickable sources** that link to the actual pages or FAQ entries.

## Recommendations (my picks for the open questions)

- **Navigation targets → Routes + section anchors (with a lightweight "walk me through it" follow-up).** Deep-link to a route and, when applicable, auto-open the right tab/section (e.g. `/dashboard?tab=onboarding&stage=6`). The AI answer can narrate steps; a "Take me there" button does the routing. Full guided overlays would be too fragile right now.
- **Search index source → Hybrid.** I generate a static baseline index (every sidebar route, driver PWA view, key sub-sections, and each FAQ) that ships with the app, and staff can extend the long-form answers via FAQ Manager. The index itself is code, so it stays in sync with routes.
- **Instant search UX → Command-palette style typeahead.** As the user types, show live matches from the index with a "Go" button. Press Enter with no selection to ask the AI.

## What we're building

### 1. SUPERDRIVE index (`src/lib/staffHelp/index.ts`)
A single typed array of `HelpEntry`:
```ts
type HelpEntry = {
  id: string;
  title: string;              // e.g. "Deactivate a fuel card"
  page: string;               // e.g. "Onboard Systems"
  surface: "management" | "driver-pwa";
  route: string;              // e.g. "/dashboard?tab=onboard-systems&section=fuel-cards"
  keywords: string[];         // synonyms: "fuel card", "wex", "deactivate", "return"
  audience: Array<"owner"|"management"|"onboarding_staff"|"dispatcher">;
  steps?: string[];           // short numbered how-to
  relatedFaqIds?: string[];
};
```
Seeded with ~80–120 entries covering: every sidebar item, every onboarding stage (1–9), Fleet Compliance categories, Dispatch actions (Binder, Decals, History download), Equipment (Onboard Systems, MO Plate Registry), PEI workflow, ICA + ICA Amendments, Notifications, FAQ Manager, Staff Help itself, plus driver PWA views (Home/Status/Documents/Messages/Notifications/Equipment, Truck photos, Pay Setup, Handbook acks, ICA sign, etc.).

### 2. Typeahead search in Staff Help (`StaffHelpPortal.tsx`)
- Composer becomes a search + chat hybrid.
- As the user types (debounced via existing `useDebouncedValue`), a dropdown lists top matches from the index — page name, breadcrumb, keyword highlight, and a **Go →** button that navigates using `useNavigate` (with the query params from `route`).
- Empty query → dynamic starter chips (see #4).
- Pressing Enter with no selection sends the message to the AI (existing flow).

### 3. Clickable, live sources
- Extend `staff-help-chat` edge function to also return matched **index entries** (not just FAQs). Both go into `sources`.
- Render each source as a real `<button>` that either navigates (index entry with `route`) or opens the FAQ Manager entry. This fixes the "sources aren't live" issue.
- The AI system prompt is expanded to include the index snippets for the query so answers can name the exact page and end with a "Go there" cue that maps to a returned source.

### 4. Fix broken suggestion chips + make dynamic per-user
- Root cause: chips currently call `send(s)` which posts to the AI even for simple navigation. We keep AI answers, but also add a "Go to page" quick-action row above chat when the top typeahead match is a clear route hit.
- Chips become **role-aware**: pull the user's role from `useAuth` and pick from role-tagged entries (dispatcher sees Binder/Decals/History; onboarding sees PEI/ICA/Stage tips; owner/management see analytics + compliance). Fallback to a generic set.
- Ensure clicking a chip actually fires — the current bug is that `sending` state can leave chips disabled after an error; also disable pointer-events only during the in-flight send, and refocus after.

### 5. AI answer upgrades
- System prompt gains: "Whenever a step happens on a specific page, name the page and include a `[go:<entry-id>]` marker. The client will render clickable links from these markers."
- Client parses `[go:xyz]` in the markdown and replaces them with inline navigate buttons — so instructions themselves are clickable ("Open **Onboard Systems → Fuel Cards** [Go →]").

### 6. Nice-to-haves I recommend including
- **Recent pages** row (localStorage) under the composer so staff can jump back.
- **"Copy link"** on each answer so staff can paste a deep link into chat/email to another staff member.
- **"Not found? Add to FAQ"** button when the assistant hits its fallback line, deep-linking straight into FAQ Manager with the query prefilled.

### 7. Deferred (call out, don't build now)
- Full guided overlays (spotlight the exact button). Big scope; revisit if staff ask.
- Fuzzy typo tolerance beyond substring match. If needed later, add `fuse.js`.

## Files touched

- **new** `src/lib/staffHelp/index.ts` — the typed entry catalog + search helpers (substring + keyword scoring, role filter).
- **edit** `src/components/management/StaffHelpPortal.tsx` — typeahead dropdown, dynamic chips, clickable sources, `[go:…]` link rendering, recent pages, refocus/enable fix.
- **edit** `supabase/functions/staff-help-chat/index.ts` — accept the top index matches from the client (or recompute), inject them into the system prompt, return them as `sources` alongside FAQs, allow `type: "route" | "faq"` in the response.
- **new** `src/lib/staffHelp/search.ts` — pure scoring function so it's reusable by the composer and (optionally) other search entry points later.
- **no schema changes.**

## Technical notes

- Navigation uses existing React Router `useNavigate`; routes that need a specific tab reuse the current `?tab=` / view-state patterns (see `operatorRoutes.ts` for driver PWA views).
- Debounce reuses `src/hooks/useDebouncedValue.ts`.
- Role source: `useAuth` (already used across staff surfaces).
- Sanitize all rendered markdown via existing `ReactMarkdown` pipeline; `[go:id]` markers are parsed *before* markdown to avoid escape issues.
- Edge function stays on `google/gemini-3.6-flash` (project default).
- Index maintenance: entries live in one file; adding a new page = one entry. FAQ Manager continues to own long-form answers.

## Out of scope

- Rebuilding the chat UI on AI Elements (would be a bigger refactor; current UI works).
- Full-text search over driver/applicant data — Staff Help stays "how to use the platform," per the current system prompt.
