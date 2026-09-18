# Pass report — why Mae cannot see the Birthday field in the staff directory

2026-09-18 1927 UTC. BUILD MODE, read-only investigation. Immutable: append
corrections, do not rewrite.

**No migration, no code change, no data change.** Docs and this report only.
**The full suite was SKIPPED deliberately — this pass is documentation only**, so
there is nothing it could regress. The prompt's final line (`END OF PROMPT…`)
arrived intact; the prompt was not truncated.

---

## Answer first

**There is no owner-only condition on the Birthday block anywhere — not in the
panel, not in the caller, not in the edge function.** In the preview today, Mae
Lauron sees the BIRTHDAY block exactly as the owner does. The difference the
owner observed was the build Mae's browser was running, not her permissions.
Delete being absent for Mae IS an owner gate, and it is the only one.

## Step 1 — every condition that could hide the block

`src/components/management/staff-directory/StaffMemberPanel.tsx:631-723`:

```tsx
{/* Birthday */}
<div className="pt-1 border-t border-border">
  <div className="flex items-center justify-between mb-2">
    <p className="…">Birthday</p>
    <span className="…">Month and day only</span>
  </div>
  {birthdayEditActive ? (
    … month/day selects, Save / Clear / cancel …
  ) : (
    … read row: formatBirthday(member.birth_month, member.birth_day)
        or "No birthday on file", with an "Edit" affordance …
  )}
</div>
```

The ONLY condition is `birthdayEditActive`, local state declared at line 39:

```tsx
const [birthdayEditActive, setBirthdayEditActive] = useState(false);
```

`isOwner` appears exactly once in the file — line 936, around the delete
section. Nothing else in the panel is role-gated.

Caller props, `src/components/management/StaffDirectory.tsx:363-371`:

```tsx
<StaffMemberPanel
  member={managingMember}
  currentUserId={user?.id}
  isOwner={isOwner}
  accessToken={session?.access_token}
  onClose={() => setManagingMember(null)}
  onMemberChange={handleMemberChange}
  onMemberDeleted={handleMemberDeleted}
/>
```

No birthday-related prop, no permission prop beyond `isOwner`.

Server, `supabase/functions/get-staff-list/index.ts`. Caller check at the top
(lines 44-54):

```ts
const { data: roleCheck } = await supabaseAdmin
  .from('user_roles').select('role').eq('user_id', callerUser.id)
  .in('role', ['management', 'owner']).limit(1);

if (!roleCheck?.length) {
  return new Response(JSON.stringify({ error: 'Forbidden: management only' }), { status: 403, … });
}
```

`management` is admitted on equal footing with `owner`. The `update_birthday`
branch (lines 298-344) validates the month (1-12) and the day against a fixed
day-count table, writes `profiles.birth_month` / `birth_day` through the admin
client, and inserts a `birthday_updated` audit row. **There is no owner check in
it.** The list response selects `birth_month, birth_day` (line 495) and returns
them for every member (lines 526-527), unfiltered by role.

**Stated plainly: NO owner-only condition exists on birthday, front or back.**

## Step 2 — reproduced in the preview, one sign-in per identity

Headless browser against the running preview; session restored to
`localStorage`; Settings → Staff Directory (`/management?view=staff`); searched
`erika`; clicked her "Manage access" button. Script:
`/tmp/browser/bday/check3.py`; screenshots `/tmp/browser/bday/mae3.png`,
`/tmp/browser/bday/marcus3.png`.

| label present in the open panel | Mae Lauron (management + onboarding_staff) | Marcus Mueller (owner) |
|---|---|---|
| `Birthday` | **True** | **True** |
| `Month and day only` | **True** | **True** |
| `No birthday on file` | **True** | **True** |
| `Suspend Account` | True | True |
| `Send Password Reset` | True | True |
| `Delete Account Permanently` | False (expected) | True |
| `Owner only` | False (expected) | True |

Mae's captured panel text, verbatim (`/tmp/browser/bday/mae3.txt`):

```
Edit

BIRTHDAY

Month and day only
No birthday on file
Edit

EMAIL ADDRESS
```

**No edit was attempted, and that is a deliberate refusal, not an omission.**
Saving a birthday writes to Erika Iroma's real `profiles` row, and the standing
probe rule (2026-09-17, widened) forbids writing to a real row of ANY table
outside a transaction that raises — an edge-function call cannot be rolled back.
The save path is fully quoted in Step 1 and contains no owner gate, so nothing
about permissions turns on the untried write.

Two harness false starts, recorded rather than hidden: `?page=staff` is not the
parameter — the portal reads `?view=` (`ManagementPortal.tsx:215`) and Staff
Directory lives under **Settings**, not its own sidebar entry, so the first run
landed on Overview and reported "no Birthday" for the wrong reason. And clicking
the driver's name or email does nothing: the panel opens from the
`title="Manage access"` button in the ACCESS column
(`StaffDirectory.tsx:337-345`).

## Step 3 — which build, and what the published app contains

- **Added 2026-09-07**, commit `6ce06558a`
  (`git log -S "No birthday on file" -- …/StaffMemberPanel.tsx`); the file was
  last touched 2026-09-12 (`6a95fcb55`).
- **Published build:** `https://gosuperdrive.com/version.json` →
  `{"version": "32315a", "buildTime": "2026-09-15T12:15:41.921Z"}`.
  `https://mysupertransport.lovable.app/` answers `302` and serves no asset
  directly, so the custom domain is what was measured. Nothing was published.
- **The published bundle CONTAINS the editor.** How that was determined: fetched
  `https://gosuperdrive.com/assets/index-CTO9S0hM.js` (named in the live
  `index.html`), extracted every chunk filename it references, fetched each, and
  found the strings in `assets/ManagementPortal-Dd_uE5D_.js` — one match for
  `"Month and day only"` and one for `"No birthday on file"`. The surrounding
  minified code shows the same unconditional block:

```js
…:e.jsxs("div",{className:"flex items-center justify-between px-3 py-2 rounded-lg border border-dashed …",
onClick:()=>N(!0),children:[…,Qo(t.birth_month,t.birth_day)?e.jsx("span",…):e.jsx("span",{…,children:"No birthday on file"…
```

No role test in the shipped code either.

- Preview at the time of this pass: `v.36335a`, built `2026-09-18T18:29:18Z`.

**Conclusion:** the field is in the source (since 2026-09-07), in the preview for
both identities (verified above), and in the live published build (2026-09-15).
The only remaining explanation for a panel rendered WITHOUT it is a stale copy of
the app in the browser Mae was using — an older bundle held by the browser, or a
page left open across a deploy. `public/service-worker.js` is a one-release
cleanup worker that deletes stale caches and then unregisters itself, and
`useVersionCheck` polls `/version.json` and offers a reload, so a hard reload
resolves it; a long-lived tab does not update itself.

It is NOT a permissions gate, so no fix is proposed and none is needed. Had it
been one, the fix would have been to remove the condition from the block and, if
the server also gated it, to widen the branch's role test to match the top-level
`['management', 'owner']` check — neither is present.

## Step 4 — RECORD

- `docs/tms-build-status.md` — new dated entry "2026-09-18 1927 UTC — why Mae
  could not see the Birthday field (read-only investigation)", sections (a)-(e).
- `docs/tms-wish-list.md` — one line added to the OWNER FOLLOW-UP LIST: confirm
  the field appears for Mae after a hard reload of the published app; if it still
  does not, capture her browser's `version.json` and bundle hash before anything
  else, because this finding would then be wrong.

## Files this pass authored

The platform commits each change as it is made — `git status --porcelain` is
empty and `git commit` is not available to the agent, so there is no commit of
this pass alone to paste.

- `docs/tms-build-status.md` (one appended entry)
- `docs/tms-wish-list.md` (one follow-up line)
- `docs/passes/2026-09-18-1927-staff-birthday-visibility.md` (this report)

No application file, migration, or database row was touched.
