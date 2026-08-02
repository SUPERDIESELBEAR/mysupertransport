## What the reconciliation found (verified against pg_proc, not assumed)

I resolved every SECURITY DEFINER function from the migration set through `resolveMigrationFunctions()` and diffed it against the live catalog's `proconfig`, classifying each into `no pin` / `public only` / `public, extensions`.

- File-resolved definers: **140**. Live definers: **145**. Shared: **139**.
- **Class disagreements on the 139 shared entries: zero.** Every one of the 91 `LEGACY_PUBLIC_ONLY_PINS` entries is `search_path=public` in the live catalog right now, and every function the file guard considers compliant is `public, extensions` live.
- So the drop from 103 → 91 was **real**. The 12 functions removed from the allowlist were repaired by `ALTER FUNCTION ... SET search_path`, and the resolver reading `ALTER` is now describing the state the database is actually in. Before the change the file guard was reporting 12 already-fixed functions as defective.

Three residuals came out of the diff, none of which contradict the above:

1. **`match_staff_help_knowledge` is one function counted as two.** Files key it `(vector,integer,float)`, live keys it `(vector,integer,double precision)`. Same function, same class on both sides — a missing `float` entry in the resolver's `TYPE_ALIASES`.
2. **`handle_new_user()` is a 92nd public-only pin the file guard cannot see.** Live with `search_path=public`, present in no migration — presumably Supabase's own auth hook.
3. **Four more live-only definers**: `email_queue_dispatch()` and `email_queue_wake()` pinned to the empty string (the strictest form), `resolve_officer_packet_token(uuid)` and `resolve_share_token(uuid)` pinned `public, extensions`. All compliant, all invisible to the file guard — the blind spot documented in `docs/eld-mail-queue-acl-2026-08-01.md`.

## Proposed changes

**1. Add `float: "double precision"` to `TYPE_ALIASES`** in `src/test/helpers/migrationFunctions.ts`, and update the one affected `LEGACY_PUBLIC_ONLY_PINS` signature to match. `LEGACY_MAX` stays 91 — no entry added or removed.

**2. Add the missing cross-check to `definer-live-catalog.test.ts`.** The live guard currently only asserts *no pin at all*; it has never asserted anything about public-only pins, which is why the two guards could diverge silently. New test: every live definer pinned to `public` without `extensions` must be accounted for — either its signature appears in the file guard's allowlist, or it appears in `LIVE_ONLY_PUBLIC_PINS`. A live public-only pin in neither place fails.

**3. `LIVE_ONLY_PUBLIC_PINS` is shrink-only, ratcheted the same way as `LEGACY_PUBLIC_ONLY_PINS`.** One entry today — `handle_new_user()` — and a checked-in `LIVE_ONLY_PUBLIC_PINS_MAX = 1` asserted, not advisory. It is a list of exemptions, so it has the ratchet property whether stated or not; without the number, the next out-of-band public-only function can be quietly appended during a red-test fix instead of investigated. Growing it requires a diff on the number.

The comment beside it states what an addition *means*, since that is the part that would otherwise be lost: an entry here is an object that exists in the database and in no migration — created, altered, or granted out of band. That fact is the thing to explain before exempting it. `handle_new_user()` has a reason (Supabase's auth hook, which the migration set does not author); the next one may not, and "it showed up live" is not itself a justification.

**4. Record the out-of-band inventory.** A comment in the live-catalog test listing all five live-only definers with their pins and why each is acceptable, so the next diff between the two guards is a known delta rather than a surprise.

## Technical notes

- The empty-string pin (`search_path=""`) on the two `email_queue_*` functions is stronger than `public, extensions`, not weaker: nothing resolves unqualified. The new check must match on the pin containing `public` and not `extensions` — not on "absence of extensions", which would sweep these in.
- The meaning shift is real and goes in the resolver's doc comment: `resolveMigrationFunctions` no longer describes migration text, it describes the state the migration set resolves to. It still cannot see out-of-band objects, so `definer-live-catalog.test.ts` remains the authority — the new cross-check plus `LIVE_ONLY_PUBLIC_PINS` is what keeps the approximation honest about the gap rather than silent about it.
- No migration. Nothing in the database changes; this is guard alignment only.

After this I return to the §4 walkthrough at step 3, which is still outstanding.
