## Fix: pre-fill the sender's email as a CC chip alongside the owner

**Problem**
When the Notify Safety Advisor dialog opens, the CC row should show two pre-filled chips: **Marcus Mueller (owner, locked)** and **the signed-in staff member** (removable). Right now only the owner chip appears.

**Root cause (to confirm on open)**
The current effect pre-fills CC from `session.user.email`. Two things can suppress the sender chip:
1. `session` isn't hydrated yet when the effect runs, so `senderEmail` is `''` and the `EMAIL_RE.test` check drops it.
2. When the signed-in staff member *is* Marcus, the `Set` dedupes owner + sender into a single chip — which is correct, but reads as "sender missing" if you're logged in as Marcus.

**Changes** — `src/components/staff/NotifySafetyAdvisorDialog.tsx` only

1. Re-run the CC pre-fill when `session?.user?.email` becomes available (add it to the effect deps), not only on `open` / `operatorId`. This fixes the "session not ready on first open" case.
2. Keep owner locked; add sender as a separate removable chip. If sender === owner, keep just the owner chip (already correct behavior — no change needed, but note it in the helper text).
3. Small helper-text tweak under the CC label so staff know both are pre-filled:
   *"Marcus Mueller (owner) and you are pre-filled. The owner can't be removed."*

No edge function or backend changes. No behavior change to the To field, banner, or send flow.
