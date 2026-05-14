## Goal

Add a "Find email with AI" button next to each PEI employer's email field. Staff click it; the AI searches the web for the employer's company website and a likely PEI/HR/safety contact email, then auto-fills the field.

## UX

In `ApplicationPEITab.tsx` (and optionally inline in `PEIQueuePanel` row edit), beside the email input:

- New ✨ "Find with AI" button (sparkles icon, ghost variant).
- Click → button shows spinner + "Searching…".
- On success: email auto-fills, toast shows: *"Found info@pinchtransport.com on pinchtransport.com"* with a "Use this" / "Try again" option if the field already has a value.
- If multiple candidates returned, show a small popover with the top 2–3 (e.g., `safety@`, `hr@`, `info@`) so staff can pick the best fit.
- If nothing found, toast: *"No email found — please enter manually."*

Only enabled for staff (already gated by the PEI tab).

## Backend — new edge function `lookup-employer-email`

Input: `{ employer_name, city?, state? }`
Output: `{ website?: string, candidates: Array<{ email, source_url, confidence: 'high'|'medium'|'low', label?: string }>, reasoning?: string }`

Steps inside the function:
1. **Find the company website** — use Lovable AI (Gemini with web grounding) OR a web search connector to resolve `"<employer> trucking <city> <state>"` → best matching official domain.
2. **Scrape the contact/about pages** — fetch homepage + `/contact`, `/about`, `/contact-us` and extract `mailto:` links and plain-text emails matching the company domain.
3. **Rank candidates** — prefer role-based addresses likely to handle PEI verifications: `safety@`, `compliance@`, `hr@`, `recruiting@`, `dispatch@`, then generic `info@`/`contact@`. Filter out `noreply@`, vendor/CDN domains, and addresses on domains that don't match the company domain.
4. Return top 3 with confidence levels.

Implementation choice (recommend): **Lovable AI Gateway with `google/gemini-3-flash-preview`** using a tool-calling schema to enforce the JSON shape, plus a built-in `fetch` step in the edge function to scrape the chosen domain's contact page (HTML → regex `mailto:` + email regex). This keeps it free under existing Lovable AI credits — no new API key required.

If web grounding via Gemini is insufficient for finding the right domain, fall back to **Firecrawl** (`/v2/search` then `/v2/scrape`). That requires connecting the Firecrawl connector — only suggest if the Gemini-only path proves unreliable in testing.

CORS + auth: standard pattern (verify staff JWT via `getClaims`, check role in `user_roles`).

## Frontend wiring

- New helper `src/lib/pei/lookupEmail.ts` → `supabase.functions.invoke('lookup-employer-email', { body: {...} })`.
- `ApplicationPEITab.tsx`: add button beside email input in the edit row + (optionally) in the read-only row when email is missing. State per row: `lookingUpId`, `candidatesFor`.
- Small `EmailCandidatesPopover` component shows ranked candidates with their source URL.

## Auditing

Log each lookup to a new `pei_email_lookups` table (employer, query, candidates, picked email, staff_id, created_at) so we can review accuracy over time and refine the ranking logic. Optional but recommended.

## Out of scope

- Bulk "find emails for all empty rows" — can be added later once single-lookup quality is verified.
- Verifying the email is deliverable (would require an email-verification API).

## Open questions

1. OK to default to **Lovable AI** (Gemini web grounding + edge-function scrape) and only add Firecrawl if accuracy is poor?
2. Add the lookup button to **PEIQueuePanel** row inline-edit too, or only on the application's PEI tab?
3. Want the audit table (`pei_email_lookups`) now, or skip until needed?
