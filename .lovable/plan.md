## 1. Purge the 2026-08-05 scratch chain

Confirmed present (all `is_demo = true`, operator `ee993ec0`, all `locked = true`):

```text
92519fd1  original
b30b9c22  supersedes 92519fd1   (A1)
812eeb89  supersedes b30b9c22   (A2)
```

Pre-state already read: `rods_events` for that date = 0, `rods_amendments` = 0 (the whole table is empty — the chain was recorded through `supersedes_day_id` only), and `pdf_path`, `certification_signature_path`, `source_document_path` are all NULL on all three. No `storage.objects` in `rods-logs` match that date.

1. Invoke `purge-rods-day` as owner/management with `dayIds` in supersede-first order `[812eeb89, b30b9c22, 92519fd1]` and a written reason (>= 12 chars). Amendment-before-original is required: `supersedes_day_id` is a non-deferrable FK at the original.
2. Report verbatim: counts in `rods_days`, `rods_events`, `rods_amendments` for `log_date = '2026-08-05'`, and a `storage.objects` scan of the operator prefix in `rods-logs`.
3. Report the three `rods_day_purged` audit rows with their `storage_disposition` as returned — no assumption of `not_applicable`; if any comes back `pending_caller`, the path list is reported as-is.

## 2. `purge_rods_day` actor attribution — two-migration split

Defect confirmed: `purge_rods_day(uuid,text,text)` gates authorization on the JWT claim role (positively formed, unaffected), but writes `audit_log.actor_id = auth.uid()`, which is NULL under the service-role client `requireStaff` hands back. Every purge is attributed to `actor_name = 'service_role'` with a null actor. Lost human attribution on a compliance-purge record, not an open gate.

Sequenced like the seven-arg `certify_rods_day`, not as a same-migration swap:

- **Migration 1:** add `purge_rods_day(_day_id uuid, _reason text, _storage_owner text, _actor_id uuid DEFAULT NULL)`. The three-arg form stays and delegates to it, so a call carrying the old shape still resolves during the window between the migration applying and the edge function going live. Audit row writes `coalesce(_actor_id, auth.uid())` — so a service-role call with no human behind it (a scheduled sweep) still succeeds and records `service_role` honestly rather than failing. Service-role requirement and the storage-owner gate stay exactly as written.
- **Deploy:** `purge-rods-day` passes `auth.userId` from `requireStaff` as `_actor_id`.
- **Migration 2 (follow-up, not this turn):** `DROP FUNCTION public.purge_rods_day(uuid,text,text)`.

Add a `deferred-removals.md` entry for the three-arg form: trigger is a successful purge whose `rods_day_purged` audit row carries a non-null `actor_id`, with the drop SQL recorded. If the definer catalog guard counts these, its max moves with the pair declared, not tolerated.

## 3. `certify_rods_day` deploy-timestamp blank

Checked — **still blank**, and it cannot be reconstructed from data. Across all of `rods_days`, three rows are certified, all with `certification_signature_validation IS NULL`, latest `certified_at` 2026-08-01 22:31:53Z; zero rows have a non-null validation. So no certification through the eight-arg path has been observed yet, and the removal check in that entry cannot run.

Two consequences to record in the entry rather than paper over:
- The blank gets the real client-deploy timestamp, which has to come from the deploy record — I will fill it with the value you give me, or note explicitly that the deploy is unconfirmed. I will not back-derive one from the data, since a derived timestamp here is a guess.
- Add a line noting the drain check currently has an empty numerator: the only certified rows are the demo ones being purged in §1, so after the purge there is no certification evidence at all and the trigger stays unmet until real certifications accumulate.

## 4. `MAX_ARTIFACTS` / `PART_CEILING_BYTES` labelling

Both constants stay at their current values (`40 * 1024 * 1024`, `400`). Only the comment changes: label the `~300 KB a certified day` basis as derived from attachment-free generated days — the sole chain the export was exercised against is the one being purged here, with zero events and no scanned document, photo, or display sibling anywhere in it. Note that a scanned-document day can be an order of magnitude larger and that the number must be re-derived from a mixed sample before anyone treats it as tuned. No re-tuning on the current evidence.

## 5. `requireStaff` comment

Add a one-line comment at `requireStaff`'s return: `supabase` is service-role; any definer function gating on `auth.uid()` must be called on a caller-built scoped client. The failure is silent — a null `auth.uid()` makes a gate return false or a column go null rather than raise.

Grep result for the record (14 callers):
- **User-scoped, gate intact:** `export-retention-archive` — builds its own client with `auth.authHeader` for `get_eld_compliance_timeline`, `search_retention_archive`, `record_retention_export`. Those are the only three definer functions in the schema that read `auth.uid()` on a staff path.
- **Service-role, nothing downstream reads `auth.uid()`:** `delete-osas-sheet`, `send-return-receipt-pdf`, `send-lease-termination`, `send-insurance-request`, `send-equipment-return-instructions`, `send-osas-to-operator`, `send-dot-consultant-request`, `send-deactivation-notice`, `sweep-rods-orphans` (`record_rods_purge_storage_result` has no `auth.uid()`), `set-demo-flag`, `provision-demo-driver`, `reset-demo-driver`.
- **Service-role with an `auth.uid()` read:** `purge-rods-day` only — fixed in §2.

## Verification

- Post-purge counts, storage scan, and audit rows reported verbatim.
- After the signature change, one purge against a throwaway demo day to confirm `audit_log.actor_id` carries the human's uid; that day is then purged and reported too.
