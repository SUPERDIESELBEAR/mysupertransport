
## Insert 40 FAQs into the Database

**Method**: Use the database insert tool (not a migration — this is data, not schema).

The `faq` table accepts: `question`, `answer`, `category` (enum), `is_published` (bool), `sort_order` (int), `created_by` (nullable uuid).

All 8 valid enum values confirmed from types:
- `application_process`
- `background_screening`
- `documents_requirements`
- `ica_contracts`
- `missouri_registration`
- `equipment`
- `dispatch_operations`
- `general_owner_operator`

**Single INSERT statement** with all 40 rows:
- `is_published = true` on all entries (immediately visible in Operator Portal)
- `created_by = NULL` (seed data, no user context)
- `sort_order` increments by 10 per category (10, 20, 30, 40, 50)

**No code changes required.** The existing `OperatorResourcesAndFAQ.tsx` and `FaqManager.tsx` will render them automatically.

**After insert**: All 40 FAQs will be immediately editable via Management Portal → Content → FAQs.

### Technical Detail

One SQL data insert using the insert tool:

```sql
INSERT INTO public.faq (question, answer, category, is_published, sort_order, created_by) VALUES
-- application_process (5)
('How do I apply...', '...', 'application_process', true, 10, NULL),
...
-- general_owner_operator (5)
('How do I update my contact information...', '...', 'general_owner_operator', true, 50, NULL);
```
