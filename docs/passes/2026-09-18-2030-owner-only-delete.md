# Pass report — permanent account deletion is now genuinely owner-only

2026-09-18 2030 UTC. BUILD MODE. The prompt's final line (`END OF PROMPT…`)
arrived intact; the prompt was not truncated.

Read first, as instructed: `docs/passes/2026-09-18-1944-permissions-decisions-and-inventory.md`
(the UI-only actions) and decisions **P1** (owner unrestricted) and **P8**
(permissions are enforced in the database, a hidden button is not a permission).

Nothing in the prompt contradicted the live system. One refinement worth stating,
because it changes how the gap should be understood — see "One correction to the
picture" below.

**Changed:** one edge function (`supabase/functions/get-staff-list/index.ts`),
`delete_user` branch only. No migration, no schema change, no data change, no
other code.

## Step 1 — the hole was real, and demonstrated before anything changed

Throwaway auth account, created through the public sign-up endpoint with the
publishable key (no roles, no profile, disposable address):

- `perm-probe-1789762069@demo.mysupertransport.com`
- id `d6d38e72-7b83-4552-bfa7-e61605f45d75`

Signed in as **Mae Lauron** (management + onboarding_staff, one sign-in, session
minted with `lovable auth-session --json --user 2cedd3ac-cd90-46fb-8c43-bfe7595264ea`),
calling the live function:

```
POST /functions/v1/get-staff-list
{"action":"delete_user","user_id":"d6d38e72-7b83-4552-bfa7-e61605f45d75","target_name":"perm-probe-1789762069"}

HTTP 200
{"success":true}
```

Live check:

```sql
select id, email, deleted_at from auth.users
where email like 'perm-probe-%' or id = 'd6d38e72-7b83-4552-bfa7-e61605f45d75';
-- []  (0 rows)
```

**A management user permanently deleted an account.** The gap is real.

### One correction to the picture

The Staff Directory's delete button does **not** call this branch. It calls
`delete-user-account` (`StaffMemberPanel.tsx:236`), which already requires the
`owner` role. And `grep -rn "action: 'delete_user'" src/` returns **nothing** —
the `get-staff-list` `delete_user` branch has no caller in the app at all. So the
hole was not "the UI hides a live button"; it was a live, deployed,
management-reachable door with nothing behind it in the app and no lock on it.
The inventory's conclusion (protected by nothing but the UI, and in fact not even
that) stands; only its mechanism needed sharpening.

## Step 2 — the fix

In the `delete_user` branch only, before the self-deletion check:

```ts
// Permanent deletion is owner-only, enforced here and not by hiding the
// button (decisions P1 and P8). Same shape as
// delete-user-account/index.ts:44-53.
const { data: ownerCheck } = await supabaseAdmin
  .from('user_roles')
  .select('id')
  .eq('user_id', callerUser.id)
  .eq('role', 'owner')
  .limit(1);

if (!ownerCheck || ownerCheck.length === 0) {
  return new Response(JSON.stringify({ error: 'Only the owner can delete accounts' }), {
    status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

The function's top-level `.in('role', ['management','owner'])` check is
**unchanged** and still governs every other action.

## Step 3 — the fix bites

Second throwaway: `perm-probe-1789762167@demo.mysupertransport.com`, id
`81d10947-0845-4167-9205-db0839b7461c`.

As **Mae**:

```
HTTP 403
{"error":"Only the owner can delete accounts"}
```

```sql
select id, email from auth.users where id = '81d10947-0845-4167-9205-db0839b7461c';
-- perm-probe-1789762167@demo.mysupertransport.com  (still there)
```

As **Marcus Mueller (owner)**, same id:

```
HTTP 200
{"success":true}
```

```sql
select count(*) from auth.users where email like 'perm-probe-%';
-- 0
```

**The owner's Staff Directory path, how it was confirmed:** signed in as the
owner in the preview, `/management?view=staff` loaded with 15 "Manage access"
buttons; opening a member panel showed **Delete Account Permanently** alongside
Suspend Account and Send Password Reset Link. I did **not** click it — it deletes
a real colleague's account and the probe rule forbids that — and its target,
`delete-user-account`, was not touched by this pass and already carried the owner
check this pass copied. The owner's route through `get-staff-list` was exercised
for real, above.

## Step 4 — cleanup

```
auth_users(perm-probe-%) = 0
profiles(both probe ids)  = 0
user_roles(both probe ids) = 0
company_members(both probe ids) = 0
```

Nothing left to remove. Two `audit_log` rows (`action = 'staff_deleted'`,
`entity_label like 'perm-probe-%'`) remain: those are the deliberate record of
the two deletions, and deleting them would be falsifying the log.

## Step 5 — the same hole elsewhere (queue only, nothing fixed)

How I looked: every `supabase/functions/*/index.ts` grepped for `'role'`,
`has_role` and `is_staff`; those with no match filtered for deletion
(`admin.deleteUser`, `.delete()`, purge), export/archive, decryption, and
outbound mail; then each survivor checked for whether it reads `Authorization`
at all and whether it requires a cron secret.

**Read no `Authorization` header at all — anyone with the publishable key:**

- `purge-rods-day` — deletes a day of logs.
- `sweep-rods-orphans` — deletes orphaned log rows.
- `delete-osas-sheet` — deletes an onboard assignment sheet.
- `file-executed-ica` — files an executed contract, removing the prior file.
- `set-demo-flag` — flips a driver between demo and real.
- `send-ica-review-link` — emails a contract review link.
- `send-equipment-return-instructions` — emails return instructions.
- `send-osas-to-operator` — emails an assignment sheet and replaces the stored copy.

**Any signed-in session:**

- `decrypt-ssn` — returns a decrypted SSN.
- `encrypt-ssn` — writes an encrypted SSN.
- `export-retention-archive` — exports a retention archive of a person's records.
- `purge-deleted-operator-documents` — purges rows and storage objects (a cron secret exists, but a session reaches it too).
- `reset-demo-driver` — wipes and re-seeds a demo driver's data.
- `download-qpassport` — fetches and removes a fuel-passport artefact.
- `send-lease-termination` — emails a lease termination outside the company.
- `send-insurance-request` — emails an insurance request with attachments.
- `send-return-receipt-pdf` — emails a return receipt PDF.
- `send-release-note` — emails a release note to every user.
- `send-transactional-email` — sends arbitrary transactional mail.
- `send-dot-consultant-request` — emails a consultant outside the company.
- `send-test-email` — sends mail to an arbitrary address.
- `notify-owner-transfer` — emails an ownership transfer notice.
- `pei-auto-cadence` — sends previous-employer enquiries outside the company.

23 functions. Nothing on this list was changed.

## Step 6 — record and list

- `docs/tms-build-status.md` — one dated entry, 2026-09-18 2030 UTC: the
  demonstrated gap, the fix, both probes, the cleanup, the Step 5 queue, and the
  inventory row for permanent deletion marked CLOSED citing P1 and P8.
- `docs/tms-wish-list.md` — the permissions follow-up line now reads "build
  STARTED" with deletion closed; DECIDED, NOT BUILT gained "irreversible or
  outbound edge functions with no role check" with all 23 named.

## Step 7 — suite, typecheck, deployment

`npx vitest run --maxWorkers=4`, verbatim:

```
 Test Files  4 failed | 198 passed | 2 skipped (204)
      Tests  4 failed | 2017 passed | 16 skipped (2037)
     Errors  2 errors
   Start at  20:13:58
   Duration  410.38s (transform 9.02s, setup 33.29s, collect 52.57s, tests 810.80s, environment 201.60s, prepare 31.35s)
```

Every failure is a `psql` call inside a live-schema test (`execFileSync('psql', …)`),
plus two `[vitest-worker]: Timeout calling "onTaskUpdate"` errors — the known
pooler and reporter contention. Files:
`dispatch-settlement-schema`, `equipment-receipt-confirmation`,
`parked-and-termination-guardrail`, `payments-schema`, `settlement-foundation`.

Re-run alone, `--maxWorkers=1` over those five:

```
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 106 passed (107)
   Duration  98.65s
```

The remaining one, again a `psql` call. That file entirely on its own:

```
 Test Files  1 passed (1)
      Tests  32 passed (32)
   Duration  43.53s
```

Green. No failure involves the changed function.

`npx tsgo -p tsconfig.app.json --noEmit` → clean, exit 0.

**Deployment:** `get-staff-list` deployed; confirmed by the deploy report
("Successfully deployed edge functions: get-staff-list") and, decisively, by the
live 403 with the new message and the owner's 200 in Step 3 — that message exists
only in the new build.

## Files this pass authored

The platform commits each change as it is made; `git commit` is not available to
the agent.

- `supabase/functions/get-staff-list/index.ts`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-18-2030-owner-only-delete.md` (this report)
