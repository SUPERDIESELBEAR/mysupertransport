Two documentation corrections plus one guard hardening. No change to what any allowlist permits, and no database objects change.

## 1. The deploy timestamp becomes a blank, not a note

`docs/deferred-removals.md`, in the `certify_rods_day(uuid,text,text,text,text,uuid,jsonb)` entry. The removal query keys on a timestamp that currently appears only as the placeholder `'<deploy timestamp>'` inside the SQL — which reads as something to reconstruct later rather than something to record now.

Add a line directly under the entry's heading, above **What:**, so it is seen before the entry is read rather than at the end:

```text
**Deploy timestamp:** ______ (fill on deploy)
```

Then point the removal-trigger prose at that line instead of describing the value in the abstract, and leave the SQL's `'<deploy timestamp>'` placeholder as-is so the query is obviously incomplete until the blank above it is filled.

This convention is added to this entry only. Neither `classifyError` nor `purge_rods_day` keys its removal check on a moment in time, so neither needs it.

## 2. The duplicate allowlist entry gets recorded in the run doc

`docs/eld-certification-playwright-run.md`. Two additions.

**A `(k2)` section**, following the existing `(l)` / `(i)` / `(k)` sections: blank and malformed signatures refused before the render in real Chromium where the pixel pass actually runs, and `commitCertification` refusing blank bytes even when handed a passing validation result for them. This section also closes the "Observation, not a defect here" paragraph that currently ends `(k)` — that paragraph predicted this exact gap ("if a future path ever feeds it a signature from elsewhere... the check belongs at that path's edge"), and the record should say the edge check now exists.

**A note on the allowlist**, recording the mechanism rather than just the fix:

> `KNOWN_ANON_EXECUTABLE` held `certify_rods_day`'s seven-argument form twice. Because the "may only shrink" assertion compares `length` against the MAX rather than distinct membership, the list read one longer than the set it described and the MAX had been sized to the wrong number — leaving the assertion slack by one. Dropping to 58 removes the slack.

The note then points at item 3 as the structural fix.

## 3. Distinctness assertions on all three allowlists

The lists live in two files:

- `src/test/definer-live-catalog.test.ts` — `KNOWN_ANON_EXECUTABLE` (MAX 58) and `KNOWN_AUTHENTICATED_EXECUTABLE` (MAX 66)
- `src/test/definer-search-path.test.ts` — `LEGACY_PUBLIC_ONLY_PINS` (`LEGACY_MAX` 104)

Beside each existing `length <= MAX` check, assert `new Set(list).size === list.length`. On failure, report the duplicated signatures by name rather than just the counts — a bare count mismatch on a 104-entry list is not something anyone wants to diff by eye.

Each assertion is placed with the length check it protects, so the two are read together and a future MAX adjustment can't miss it.

**Why this is the right shape.** These MAXes are ratchets: the number encodes "this list may only shrink." A duplicate breaks that silently, because the length grows without the permitted set growing, and the next person sizes the MAX to the inflated number. The distinctness check makes the count mean what the ratchet assumes it means.

No entry is added or removed from any list, and no MAX changes — 58, 66, and 104 stay as they are. If a distinctness assertion fails on first run, that is a second duplicate we didn't know about, and I'll bring it to you with the specific signature rather than adjusting a MAX to accommodate it.

## Verification

Run both guard files. Item 3 is the only executable change, and its correct result is that all three assertions pass with the MAXes untouched.

## Not in scope

Pass B's remainder — parity fixtures, HEIC upload, officer email merge, and the acceptance sweep — stays queued behind this.
