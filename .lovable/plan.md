# Read-only investigation — five findings

No code, migrations or file edits were made. Every count below is from a live query.

## 1. Session loss on the Create Load form

How the session is held:

- `src/integrations/supabase/client.ts` creates the client with `persistSession: true`,
  `autoRefreshToken: true`, and `storage: brokeredPreviewStorage()`.
- On a Lovable preview host inside an iframe, `previewAuthStorage.ts` does NOT use
  localStorage. It brokers every `getItem`/`setItem` to the editor parent frame over
  `postMessage`, with a **2000 ms timeout** per request and one 250 ms retry on the first
  read. If the broker replies with the empty-string tombstone, the local copy is deleted
  and `null` is returned — i.e. a broker reply of `''` is treated as "signed out".
- `useAuth.tsx` subscribes to `onAuthStateChange`. Any event carrying no session
  (`SIGNED_OUT`, which supabase-js emits when a refresh definitively fails) sets
  `user = null`.

Every path to the sign-in route:

| Path | Trigger |
|---|---|
| `App.tsx` route guards (`!user ? <LoginRedirect />` at lines 189, 198, 227, 233, 239, 245, 251, 266, 277) | `user` becomes null for any reason |
| `useAuth.signOut()` → `replaceWithLogin()` (hard `window.location.replace`) | explicit sign out |
| `IdleWarningModal` → `signOut()` | 120 min idle + 5 min countdown |
| `PreviewSessionBanner` → `signOut()` | preview-session marker expired, checked every 30 s |
| `StaffDirectory.tsx:45` → `signOut()` | own-account action |
| `PortalErrorBoundary.tsx:80` → `window.location.assign('/login')` | user clicks after a render crash |

Which can fire while a user sits on Create Load:

- The `!user` guards. They are the realistic cause: they react to `user === null`
  with an immediate `<Navigate replace>`, and the Create Load form state lives only
  in a `useForm` instance inside that subtree, so it is destroyed. The unsaved-changes
  guard only intercepts in-app clicks, not this guard-driven swap.
- `IdleWarningModal` — but the form is long-lived typing, and it warns first, so it does
  not match "reloaded on its own without warning".
- `PreviewSessionBanner` — only if a preview-session marker is present.

Does anything treat a transient error as a reason to sign out? Two observations:

- No application code inspects 401 / `PGRST301` / "JWT expired" and signs out. A grep
  across `src/hooks`, `src/lib`, `src/components`, `src/pages` finds no such handling.
  So a 401 from an unrelated query does not itself log the user out.
- The guards contain no distinction between "no session" and "session state momentarily
  unavailable". `App.tsx` gates on `loading` only during the initial `getSession()`;
  after that, any transition to `user === null` redirects immediately, with no retry
  window and no grace period. Combined with the brokered preview storage — whose reads
  fail over to a 2 s timeout and whose `''` reply deletes the local token — a broker
  hiccup on a preview host is a plausible route to a spurious null session. I could not
  reproduce this live, so I am reporting it as the mechanism that fits, not as proven.

Long-running request outliving a token: `parse-rate-confirmation` is invoked from
`RateConfirmationParser.tsx:296` and `RevisedRateConModal.tsx:206`. The token is attached
when the request is issued, so a long parse cannot fail mid-flight from expiry, and its
failure does not sign anyone out — but a parse that spans a refresh boundary is exactly
the window in which a failed refresh would blank `user` and destroy the form.

## 2. Load number allocation

- `CreateLoadPage.tsx:167` calls `supabase.rpc('generate_load_number')` from a `useEffect`
  that runs **on mount**, before any input, and writes the result into the form field.
  Save happens much later via `create_load_with_stops`, which stores whatever
  `load_number` the payload carries (`loadSavePayload.ts:52`).
- The generator (live definition, `SET search_path TO 'public','extensions'`) selects the
  single `load_number_config` row `FOR UPDATE`, reads `next_sequence`, formats
  `prefix + YY + lpad(seq,3)`, then **unconditionally increments `next_sequence`** and
  commits. There is no reservation, no release, no reuse.
- Therefore: a number allocated to a form that is never submitted is **permanently
  consumed and unrecoverable**. Every abandoned form, every navigate-away, and every
  session loss burns one number. Concurrency does not cause gaps (the row lock serialises
  allocation), but two open Create Load tabs consume two numbers.
- `loads.load_number` is `NOT NULL` with a `UNIQUE` constraint, so a burned number can
  only be reclaimed by typing it back in by hand.

Live data — 16 rows in `loads`; 5 are `ST-TEST-00x`, 11 match `ST26nnn`:

Present: 003, 015, 033, 034, 035, 056, 058, 059, 060, 061, 063.
`load_number_config.next_sequence` = 64 (updated 2026-09-01 23:59:41Z).

Missing in 001–063: 001, 002, 004–014, 016–032, 036–055, 057, 062.
**Gap count: 52 of 63 allocated numbers do not appear on any load.**

I cannot separate "abandoned form" from "load created and later deleted" — no allocation
ledger exists and `loads` has no soft-delete column, so consumed-but-unused numbers leave
no trace anywhere.

## 3. Dispatcher field renders as plain text

Not a roles bug:

- `useAuth.fetchRoles` selects **all** rows from `user_roles` for the user and stores the
  full array in `roles`. `activeRole` is a separate piece of state; `setActiveRole` never
  touches `roles`. `isManagement = roles.includes('management') || isOwner` is therefore
  unaffected by an active-role switch.
- Live check: Marcus Mueller's `user_roles` rows are
  `{operator, onboarding_staff, dispatcher, management, owner}`. `isManagement` is true
  for that account. `LoadDetailPage.tsx:188` passes it straight through.

The cause is the deployed build. How I determined it:

- `https://gosuperdrive.com/version.json` reports version `36355a`, buildTime
  **2026-09-01T14:16:39Z**. The workspace `public/version.json` is `33345a`,
  2026-09-02T12:18Z.
- The commit that added `DispatcherField.tsx` is `5507153f`, **2026-09-01T20:06:32Z** —
  after the deployed build was cut.
- I walked the live bundle graph (`index-BRT-41DO.js` → `App-DkeQf3C2.js` →
  `DispatchPortal-BW-1kT5o.js`). `set_load_dispatcher` appears **0 times** in the deployed
  dispatch chunk. The two `"Assign Dispatcher"` strings in that chunk are the dispatch
  board's `__unassigned__` filter selects, not `DispatcherField` (which uses
  `__none__` and the `dispatcher-options` query key — neither string is present).

Conclusion: the deployed build does not contain `DispatcherField.tsx`. A user on the
published site sees the pre-change plain-text branch regardless of roles. Nothing to fix
in the code; the build is stale.

## 4. The charge reason is write-only

- `ChargeEntryDialog.tsx:56` sets `reason: ''` on every open, edit included.
- Live `add_load_charge` and `update_load_charge` (both `SECURITY DEFINER`,
  `search_path public, extensions`) require a non-blank `p_reason` and write it into
  `load_change_history(load_id, field_path, previous_value, new_value, is_financial,
  reason, changed_by)`.
- `load_charges` has 14 columns and **no reason column**. The reason is never stored on
  the charge row.
- The only surface that displays it is `ChangeHistoryCard.tsx:53` — "Reason: …" on the
  load's change-history entries, readable by management/owner/dispatcher/onboarding_staff
  per the `load_change_history_staff_read` policy.

So: a user editing an existing charge cannot see the reason previously given from the
dialog. It exists only as a history entry on the load, and each edit demands a fresh one.

## 5. Funding source is not asked for a lumper

Live `load_charges` — 2 rows total:

| charge_type | rows | NULL funding_source |
|---|---|---|
| detention | 1 | 1 |
| lumper | 1 | 1 |

Both rows are NULL: **2 of 2 (100%)**. The detention row came from
`parsed_rate_confirmation`, the lumper row from `manual`.

What `add_load_charge` stores when `p_funding_source` is NULL: it inserts
`nullif(p_funding_source,'')` — a plain NULL. No default, no sentinel, no distinction
between "company funded", "never asked" and "cleared".

Downstream behaviour:

- Settlement engine (`settlementEngine.ts:459-462`): only for classes whose pay class is
  `reimbursement` does it check `charge.funding_source !== 'driver' → skip`. NULL and
  `'company'` are treated identically — pay nothing. A confirmed company-funded charge and
  a never-asked charge are indistinguishable to the engine.
- Charge list (`LoadChargesCard.tsx`): the "unconfirmed reimbursement — still missing …"
  banner is likewise gated on `payClassOf(...) === 'reimbursement'`. A revenue-class charge
  with NULL funding is shown with no warning at all.
- Driver view: settlement lines carry no funding attribution, so nothing surfaces there.

Can another charge type reach 100% pay while skipping the funding question? Yes. The
single live pay policy, "SUPERTRANSPORT Standard", has `charge_pay_classes` marking only
`reimbursement` as a reimbursement; everything else is `revenue`. Its percentages include
`lumper_reimbursement_pct = 100.00` and `detention_pct = 100.00`. So **lumper and
detention both pay the driver 100% of the charge amount** through the revenue path, with
the funding-source selector never rendered and `funding_source` left NULL. The live lumper
row ($200, NULL funding) and detention row ($500, NULL funding) are both in that state.

## Contradictions with `docs/tms-build-status.md`

- Line 4236: "**Load Detail UI.** `DispatcherField.tsx` renders the dispatcher as editable
  text for management and owner". True of the repository; **not true of the deployed
  build**, which predates the file. The doc records the code state as though it were the
  live state.
- Line 3517 records that "a `funding_source` that is not the driver pays nothing" as the
  reimbursement rule. That is accurate for the reimbursement class, but the doc does not
  record that the revenue classes — lumper and detention at 100% under the live policy —
  pay the driver in full without the funding question ever being asked, and that NULL is
  indistinguishable from a confirmed "company". Findings 4 and 5 are otherwise
  unrecorded, as is the load-number consumption behaviour in finding 2 and the
  session-loss surface in finding 1.

Nothing else I found contradicts the record.
