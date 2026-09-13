# Reducing the cost of stale monitoring findings — what is actually possible

Read-only. Nothing changed. Four answers, then the comments worth writing.

## 1. Does the monitoring read `.lovable/drafts/`?

**Yes, at least once — proven by the finding itself.** The 54023 finding quotes a full path
inside that folder (`.lovable/drafts/var_01m12nzsm1e9zs142jjadcc5pt/migrations/20260827230000_fix_update_load_arg_limit.sql`)
and treats it as the authoritative corrective migration. A scanner cannot cite a path it
did not read. That draft file no longer exists; the real fix, `20260827230239`, has been in
`supabase/migrations` since 2026-08-27 and carries the 54023 explanation in its own header.

**Whether it can be excluded: unknown, and I will not guess.** No monitoring tool exposes
scanner configuration, an ignore file, or a path filter — the whole surface is: list the
pending findings, claim them, resolve them. `.gitignore` does not mention `.lovable`, and
whether the scanner honours `.gitignore` at all is not something I can establish from here.
That question needs Lovable support or documentation, not inference.

**A related fact worth acting on regardless:** 159 files still sit under `.lovable/drafts/`,
including `20260911140000_quarterly_inspection_program.sql` — a migration that was applied
and whose draft copy was reported removed. That is the same trap that produced the 54023
misattribution: two copies of one migration, only one of them live.

## 2. Can a finding be dismissed permanently?

**There is a real dismissal path, and it has not been used.** The tooling offers exactly
this: claim a finding, then record an outcome of `fixed`, `stale`, or `false_positive` with
a short reason. Claimed and resolved findings stop appearing in the pending list.

That explains the largest part of the triage cost. Eight findings were closed in
`docs/tms-build-status.md` — a document the scanner does not read — and never resolved
through the tool, so they stayed pending and arrived again. **Closing a finding in prose is
not closing it.**

What the tooling does **not** offer, as far as its surface shows: an ignore file, a
suppression list, a path exclusion, or any way to pre-empt a future scan. Whether recording
`stale` stops the *same underlying issue* being re-detected by a later scan is **not
documented and I cannot confirm it** — the error-log findings carry stable content hashes
(so a recurring log line would plausibly return), while the code-reading findings are tied
to commit pairs.

## 3. Which of the eight would a comment have killed

Six of the eight cite a code site where a short comment would have answered the finding
before any investigation. Two cite live grants, where no code comment can help.

`InspectionProgramPanel.tsx:49` already carries exactly such a comment, from the pass that
fixed it — and the scanner filed the same class of finding against
`InspectionComplianceSummary.tsx`, which does not.

| # | Finding | Comment site | Would a comment have killed it? |
|---|---|---|---|
| 1 | Load save fails, 54023 | `src/lib/loadSavePayload.ts:5` (doc block) | Yes |
| 2 | Per-ton edit wipes scale ticket | `src/lib/loadRateMath.ts:66` | Yes |
| 3 | Serial guard blocks assign/return/archive | `src/lib/equipmentSync.ts:53` | Yes |
| 4 | Reference numbers duplicated | `src/lib/revisedRateCon.ts:493` | Yes |
| 5 | Compliance summary embed broken | `src/components/inspection/InspectionComplianceSummary.tsx:180` | Yes |
| 6 | `carrier_profile` permission denied | `src/lib/eld/carrierIdentity.ts:4` | Partly — the comment states the grant is live, but only a live check settles it |
| 7 | `profiles` permission denied | `src/hooks/useAuth.tsx:74` | No — grant state, not code |
| 8 | loads / user_roles / `current_profile_id` denied | `src/hooks/useAuth.tsx:148` | No — and `current_profile_id` EXECUTE is genuinely absent for `authenticated` today |

### Drafted comments

1. `src/lib/loadSavePayload.ts`, in the existing doc block:
```text
NOT the 100-argument bug (SQLSTATE 54023). Migration 20260827230239 split the
change-history snapshot across two jsonb_build_object calls; the live function
carries 8 such calls, not one. 20260827222017 is superseded — read the newest
migration for this function, not the one that introduced the keys.
```

2. `src/lib/loadRateMath.ts` above `calcTotalLoadValue`:
```text
confirmed_tons wins over estimated_tons, on both sides. This client math prefers
it, and the live update_load_with_stops references confirmed_tons and calls
recompute_load_total_value itself — so a per-ton total is never rebuilt from the
estimate, even though this payload does not send confirmed_tons.
```

3. `src/lib/equipmentSync.ts` above the archive update:
```text
Deactivating a look-alike duplicate is ALLOWED. enforce_equipment_serial_uniqueness
exits early when NEW.status = 'deactivated', and again on any UPDATE that changes
neither device_type nor the canonical serial — so this pure status write never
consults the serial guard.
```

4. `src/lib/revisedRateCon.ts` above `buildRevisionDiff`:
```text
Reclassification does not duplicate rows. The diff carries a `reclassified` op and
saveLoadReferences moves the class in place before the upsert, so an existing
`other` row and a newly `unclassified` one are one row, not an add plus a remove.
```

5. `src/components/inspection/InspectionComplianceSummary.tsx` above the query:
```text
operators has NO first_name/last_name and no FK to profiles — names come through
the applications embed, which is what this select does. An embed naming those
columns on operators fails the whole request; see postgrestEmbeds.test.ts.
```

6. `src/lib/eld/carrierIdentity.ts`, in the header block:
```text
authenticated holds SELECT on carrier_profile (verified live). A historical
"permission denied for table carrier_profile" in the logs predates the grant
restoration; check the live grant before treating a recurrence as new.
```

## 4. What the stale-issues table is and is not doing

The table under *Reported issues closed as stale* carries **six of the eight**: the 54023
finding, per-ton, the serial guard, reference duplicates, the compliance-summary embed, and
`carrier_profile`. The loads / `user_roles` / `current_profile_id` finding is closed
elsewhere in the document but has **no row in the table**. The `profiles` permission finding
is **not recorded anywhere** — it is a genuinely new object in an old class.

It is being consulted: several rows carry "re-reported 2026-09-03", which only appears if
someone checked before investigating. **But the 2026-09-11 batch left no trace in it** — no
row in that table records a 2026-09-11 occurrence, so the third and fourth reports were
triaged without the occurrence being written down. The table is drifting out of date at
exactly the moment it is meant to be earning its keep.

And the structural point: **the table records; it does not suppress.** The mechanism that
suppresses is the resolve call in section 2, which has never been used. The table's value is
human memory; it cannot stop a report arriving.

## What this establishes, before deciding anything

- The one lever that provably reduces arrivals — resolving findings as `stale` /
  `false_positive` in the tool — exists and is unused.
- Comments would have pre-empted six of the eight; four of those sites are one line of prose
  away.
- Drafts exclusion is unresolved and needs an answer from Lovable, not a guess.
- Two open questions the record does not answer: whether `current_profile_id` lacking
  EXECUTE for `authenticated` is the deliberate revoke the document refers to, and whether
  the leftover draft migration should be deleted.
