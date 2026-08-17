# Show CDL Number in Contact Info (Onboarding Pipeline)

Add the applicant's CDL number, paired with the issuing state, to the Contact Info card in the pipeline detail panel — editable inline, with a one-tap copy button.

## Display (read mode)

A new line in the Contact Info grid, next to Phone/Email:

```text
[card icon]  TX · 123456789   [copy]
```

- Shows `STATE · NUMBER`. If the state is missing, just the number; if there is no CDL number, shows "No CDL number" in muted italics.
- The copy button copies the raw CDL number only (no state prefix) and shows a brief "CDL number copied" confirmation.

## Edit mode

Two new inputs in the Contact Info edit form:

- **CDL State** — dropdown of US states (same list as the address state field).
- **CDL Number** — text input, uppercased as typed.

Saving stores them on the application record along with the other contact fields. If the applicant has no application record yet, the fields are included in the record that gets created on save, same as the existing behavior for phone/address.

## Technical notes

- File: `src/pages/staff/OperatorDetailPanel.tsx`, Contact Info card block.
- `cdl_state` and `cdl_number` are already selected in the operator/application fetch, so no query change is needed.
- Extend `contactDraft` state with `cdl_state` / `cdl_number`; seed them in `handleContactEdit`; include them in both the `applications` update and the fallback `applications` insert in `handleContactSave`, plus the local `setApplicationData` merges.
- Copy uses `navigator.clipboard.writeText` with the existing `toast` for feedback; button rendered as a small ghost icon button with an accessible label.
- No schema, RLS, or backend changes.
