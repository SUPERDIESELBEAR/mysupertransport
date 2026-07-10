## Staff Help Portal — searchable how-to knowledge base

Recommendations for every open decision are baked into the plan below.

### Structure — recommended: **hybrid**
Keep authoring in the existing FAQ Manager (Staff audience toggle we just shipped) so there's one place to write and edit. Add a new sidebar item **"Staff Help"** (`/management/help`) that reads the same table but renders a full-page search portal designed for lookup, not editing. One source of truth, two purposes: FAQ Manager = author, Staff Help = consume.

### Search — recommended: **Postgres full-text (tsvector)**
Free, instant, ranks by relevance, handles typos via trigram similarity. No AI credit cost per keystroke. If we later find staff phrase questions very differently from the article body, we can layer AI semantic search on top — but tsvector alone handles ~95% of "how do I ..." lookups well.

Implementation:
- Add generated `search_vector tsvector` column on `faq` = `to_tsvector('english', question || ' ' || answer || ' ' || coalesce(tags,''))`.
- GIN index on `search_vector`.
- Trigram index on `question` for fuzzy fallback.
- Client sends the query → `websearch_to_tsquery`, ordered by `ts_rank_cd`.

### Re-verification — recommended: **both** (time-based baseline + manual flag)
- Add `last_verified_at timestamptz` and `verified_by uuid` columns.
- Any staff FAQ with `last_verified_at` >90 days old shows an amber **"Needs re-verification"** pill in FAQ Manager and in the Help portal (staff view only). One-click **"Mark verified"** button resets it.
- When staff publish a **release note** (already exists) they get a new optional checkbox **"Flag staff FAQs for re-verification"** with a multi-select of related FAQs. Selecting any clears their `last_verified_at`, forcing the pill on. A small banner appears in the Help portal: "X articles flagged after recent release — review".

### Content — recommended: **seed now, accurate to current codebase**
I'll audit the codebase (routes, sidebar items, edge functions, portal features) and generate an initial batch of staff how-to entries covering:
- Onboarding Pipeline stages (add applicant, revert revision, propose changes, approve/deny)
- Driver Hub, Vehicle Hub, DOT Inspection Binder, MO Plate Registry
- Fleet Compliance (thresholds, marking verified, cert reminders)
- Onboard Systems (fuel cards: assign, deactivate, inventory)
- Dispatch Board (assigning drivers, binder button, daily log)
- PEI (send, auto-cadence, add previous employer, auto-GFE)
- ICA management (pre-fill, signing, revoke)
- Document Hub (upload, categorize, gate Go Live)
- Equipment Asset Sheet (verify items, return instructions, receipt upload)
- Audit Log filters, Release Notes publishing, FAQ Manager itself, Preview-as-Operator/Demo Mode
- Roles & permissions (who can see what)

Every entry will be drafted from the actual component/route code so answers reference real button labels and paths — not invented UI. I'll insert them as **unpublished drafts** so you review and publish before staff see them.

### Data model
```sql
ALTER TABLE public.faq
  ADD COLUMN tags text[] DEFAULT '{}',
  ADD COLUMN last_verified_at timestamptz DEFAULT now(),
  ADD COLUMN verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(question,'')), 'A') ||
      setweight(to_tsvector('english', coalesce(answer,'')), 'B') ||
      setweight(to_tsvector('english', array_to_string(coalesce(tags,'{}'::text[]), ' ')), 'C')
    ) STORED;

CREATE INDEX faq_search_vector_idx ON public.faq USING GIN (search_vector);
CREATE INDEX faq_question_trgm_idx ON public.faq USING GIN (question gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_staff_faqs(q text)
RETURNS TABLE (...) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ ... $$;
```
`search_staff_faqs` returns published staff-audience rows, ranked, with snippet highlights (`ts_headline`).

Release note flagging table:
```sql
ALTER TABLE public.release_notes
  ADD COLUMN flagged_faq_ids uuid[] DEFAULT '{}';
```
A trigger on `release_notes` INSERT/UPDATE clears `faq.last_verified_at` for each flagged id.

### UX

**FAQ Manager (existing)** — adds:
- Tags input on the create/edit dialog.
- "Mark verified" button + "Needs re-verification" pill on each staff row.

**Staff Help portal (new page `/management/help`)** — layout:
- Prominent search bar at the top, autofocus, debounced 150ms, hits `search_staff_faqs` RPC.
- Live results list below with highlighted matched terms (from `ts_headline`).
- Category chips on the left as quick filters.
- Empty state suggests popular articles.
- Amber banner at top when any flagged articles exist ("3 articles flagged after v2.4.0 — review").
- Each result expands inline (accordion) — no page navigation, keeps momentum during a lookup.
- URL sync: `?q=fuel+card` deep links.

**Sidebar** — new "Staff Help" item under a new **Knowledge** group with FAQ Manager + Release Notes + Staff Help, gold `LifeBuoy` icon.

### Files touched
- `supabase/migrations/<new>_staff_help_portal.sql` — columns, indexes, RPC, release-notes trigger, `pg_trgm` extension enable, RLS unchanged (Staff read is already gated).
- `src/components/management/FaqManager.tsx` — tags field, verified pill, "Mark verified" button.
- `src/components/management/ReleaseNotesManager.tsx` — flagged-FAQ multi-select in publish dialog.
- `src/pages/management/StaffHelpPortal.tsx` (new) — search UI.
- `src/pages/management/ManagementPortal.tsx` — sidebar entry + route.
- Edge function `supabase/functions/seed-staff-faqs/index.ts` (temporary, one-shot) OR direct SQL seed migration — I'll use a plain seed migration to keep it simple; the drafts insert as `is_published=false, audience='staff'`.

### Deliberately not doing
- No AI semantic search yet — revisit if analytics show low-hit-rate queries.
- No screenshots/rich media in articles yet — markdown answers only (already supported).
- Not exposing staff articles to operators (RLS already blocks it).
