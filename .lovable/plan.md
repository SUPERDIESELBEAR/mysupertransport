## What I found (confirmed in code)

`DeactivationWizardContent.tsx` keeps two completely separate sets of state:

- Step 1 "Reason & Date": `deactivationDate`, `deactivationReason`, `deactivationNotes`
- Step 2 "Safety Advisor": `terminationDate`, `safetyReason`, `safetyNotes` (plus `rehire`, To/CC)

They both default to today and both use the same `REASON_OPTIONS` list, but nothing links them. Staff type the same three things twice, and the two values can silently disagree — the audit record saves the Step 1 values while the email to Tracey sends the Step 2 values.

## My recommendation

Don't merge Step 1 and Step 2 into one screen. They are different actions: Step 1 records the internal decision, Step 2 sends an external compliance email with its own recipients and its own rehire question. Merging them makes a long, dense first screen and hides the "send email" action.

Instead: **make Step 1 the single source of truth and let Step 2 inherit from it**, with an explicit override.

## Plan

**1. Carry values forward**
- Remove the separate `terminationDate` / `safetyReason` / `safetyNotes` state. Step 2 reads directly from the Step 1 values.
- Notes: since the Step 1 label is "Internal Notes" (audit log) and Step 2 notes go to an outside party, pre-fill the email notes with the Step 1 text but keep it editable — internal wording shouldn't be sent out unreviewed by accident.

**2. Show them as a read-only summary in Step 2**
- Replace the Termination Date / Reason inputs on Step 2 with a compact read-only summary block: Driver, Unit #, Termination date, Reason — matching the summary card style already used on Step 1.
- Add a small "Edit" link on that block that either jumps back to Step 1 or unlocks the fields inline for a one-off override (default: jump to Step 1, so the record and the email stay in sync).

**3. Step 2 keeps only what is genuinely its own**
- Available for Rehire (required)
- Notes to the Safety Advisor (pre-filled, editable)
- To / CC recipients
- Send Deactivation Notice button

**4. Gate Step 2 on Step 1 being complete**
- Step 2 already can't send without a date and reason; with the carry-over it will simply show a prompt to finish Step 1 if either is blank, instead of offering empty duplicate inputs.

**5. Keep the standalone dialog consistent**
- `NotifySafetyAdvisorDialog.tsx` (used outside the wizard) already accepts `initialReason` / `initialNotes` and keeps its own date field — leave it as is, since there is no Step 1 in that context.

## Technical notes

- File: `src/components/management/DeactivationWizardContent.tsx`
- `handleSendSafetyNotice` currently posts `termination_date: terminationDate, reason: safetyReason, notes: safetyNotes` — repoint to `deactivationDate` / `deactivationReason` / the email-notes field.
- The `canProceed` check for `safety_advisor` and the Send button's `disabled` condition switch to the Step 1 values.
- No database or edge-function changes; `send-deactivation-notice` receives the same payload shape.
