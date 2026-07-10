## FAQ Manager — Owner-Operator vs. Staff views

Split the management FAQ tab into two audiences. Staff FAQs stay internal and never surface to operators.

### UX
- **Segmented pill toggle** at the top of the FAQ Manager: **Owner-Operator FAQs** | **Staff FAQs**. Matches the existing gold-pill styling and keeps search / "Add FAQ" / history in one shared row.
- Each row shows a small audience pill next to the existing category pill so authors always see which audience they're editing.
- "Add FAQ" and "Edit FAQ" dialogs get an **Audience** select (Owner-Operator / Staff), defaulting to the active view.
- Search, sort, publish/unpublish, reorder, and history all scope to the active audience.

### Data model
Add a `faq_audience` enum + column rather than overloading category — keeps the existing eight owner-operator categories intact.

```
CREATE TYPE public.faq_audience AS ENUM ('owner_operator', 'staff');
ALTER TABLE public.faq
  ADD COLUMN audience public.faq_audience NOT NULL DEFAULT 'owner_operator';
ALTER TABLE public.faq_history
  ADD COLUMN audience public.faq_audience;
```

All existing rows stay `owner_operator` via the default.

### Access control
- Operator-facing FAQ (`OperatorResourcesAndFAQ.tsx`) filters `audience = 'owner_operator'` — belt-and-suspenders so staff FAQs never leak to the driver PWA.
- RLS on `faq`:
  - Public read policy scoped to `audience = 'owner_operator' AND is_published = true`.
  - New staff-only read policy for `audience = 'staff'` visible to `admin`, `management`, `dispatch` via `has_role` (matches existing "Staff" gating elsewhere in the app).
  - Existing staff write policies unchanged.

### Files touched
- `supabase/migrations/<new>_faq_audience.sql` — enum, column, backfill, updated RLS + GRANTs.
- `src/components/management/FaqManager.tsx` — toggle, audience filter, audience field in modal, audience pill on rows, pass `audience` on insert/update.
- `src/components/operator/OperatorResourcesAndFAQ.tsx` — add `.eq('audience', 'owner_operator')`.
- `src/integrations/supabase/types.ts` — regenerates after migration.

### Out of scope
- No new categories yet — staff can reuse existing category names; a "Staff — Internal" category can follow later if wanted.
- Driver-app how-to FAQs are not part of this change (management/staff-only scope you selected).
