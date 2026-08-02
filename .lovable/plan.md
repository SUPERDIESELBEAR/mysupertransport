## 1. Canonical definer header as a copy target

Add a fenced block immediately under the `# Database security conventions` title in `docs/database-security-conventions.md`, above §0, so it is the first thing on the page:

```sql
CREATE OR REPLACE FUNCTION public.<name>(<args>)
RETURNS <type> LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ ... $$;
REVOKE EXECUTE ON FUNCTION public.<name>(<argtypes>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<argtypes>) TO <authenticated|service_role>;
```

Framed as "paste this, then fill the blanks" — not as a rule. Three supporting edits:

- §0's post-migration step gets a line before the `npm run test:guards` block pointing at the template by name, so the checklist reads copy-then-verify rather than verify-only.
- §1 currently states only the `search_path` half of the rule. Add the `REVOKE`/`GRANT` half there, since a definer created without an explicit REVOKE inherits `PUBLIC EXECUTE` by default — that default is the actual mechanism behind the recurring miss, and it is not stated anywhere in the doc today.
- Update §0's "broken three separate times" line to five, and name the five batches. The paragraph's argument is that detection latency is the defect; an accurate count is what makes it land.

No code, schema, or test changes. Documentation only.

### On making it automatic

It cannot be. Migrations are authored by writing SQL directly into the migration tool — there is no scaffold step, no template file the tool reads, and no pre-apply hook to inject a header into. The doc itself already records that this project has no CI and no git hooks, and that git is platform-managed. `npm run test:guards` remains post-apply by construction. So the copy target is what there is, and its only enforcement is that someone opens the file. I will state that plainly in the doc rather than implying stronger coverage.

## 2. `is_retention_admin` — what anon-callable would have permitted

Confirmed against the live catalog; this is report content, no change to make. The function returns a bare boolean and reads no retention data, so no archive record, driver row, or log was reachable through it. But `_user_id` is caller-supplied rather than `auth.uid()`, so an anonymous caller passing a known uuid learns whether that user holds management or owner — a bounded role-membership oracle over `user_roles`, which anon cannot otherwise read. Worth stating rather than rounding down to "returns false for anon".

## 3. Register the `has_role` / `is_staff` deferral

The same oracle is still open through the two parent functions, and `has_role` is strictly worse — it takes the role as a parameter, so it tests any of the seven `app_role` values. The entry text is written and handed over; you are adding it to `docs/deferred-removals.md` yourself, so this plan does not edit that file.

What the entry commits to, so it is visible here too: the pickup order is enumerate policies calling either function → determine which are anon-reachable → confirm each has a path not depending on the anon EXECUTE grant → only then revoke, re-pinning `search_path` in the same migration and dropping both from the live-catalog legacy allowlist. Revoke-and-see-what-breaks is the inverse order and fails silently at the read path.

I have not run the enumeration, so neither the entry nor this plan claims how many policies are involved or whether any is anon-reachable.
