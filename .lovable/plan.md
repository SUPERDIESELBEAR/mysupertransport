## Fix "Add" silently failing when an email already exists in the other list

### Root cause
Both `addTo` and `addCc` reject any email that appears in the *other* list and just clear the input with no feedback:

```ts
// addTo (line ~88)
if (ccEmails.includes(email)) { setToInput(''); return; }

// addCc (line ~78)
if (toEmails.includes(email)) { setCcInput(''); return; }
```

Because the dialog now auto-fills CC with **the signed-in user's email + the owner's email**, a staff member who tries to add themselves to **To** (to send themselves a test) hits the guard — their email is already in CC, so the input silently clears and nothing appears in To. Same thing when trying to add someone to CC who happens to already be listed elsewhere.

The session replay confirms this: the user typed `emma@mysupertransport.com` into To, and Emma is the signed-in staffer, so her address was already seeded in CC.

### Fix (scoped to `NotifySafetyAdvisorDialog.tsx`)
Treat cross-list additions as a **move**, not a rejection:

- **`addTo`**: if the email is already in `ccEmails`, remove it from CC and add it to To. If it's already in `toEmails`, just clear the input (true duplicate).
- **`addCc`**: mirror behavior — if it's already in `toEmails`, remove it from To and add it to CC. Marcus (owner) stays locked in CC as before; if someone tries to move him to To we still allow it (the CC lock only prevents the × remove button on his chip, not intentional moves via the To input).
- Show a small inline hint under the input when an email is invalid so the user gets feedback instead of a silent clear. Nothing else needed for the "already in same list" case — clearing is fine.

### Files touched
- `src/components/staff/NotifySafetyAdvisorDialog.tsx` (only)
