## Deactivate Driver Modal — Updates

File: `src/pages/staff/OperatorDetailPanel.tsx` (deactivate dialog around lines 4080–4112).

### Changes

1. **Reason list** — replace current options with:
   - Resigned
   - Terminated
   - Personal Reasons *(new)*
   - Truck Down *(new)*
   - Not Compliant *(new)*
   - Medical
   - Abandoned
   - Other…
   
   (Removes "No Loads".)

2. **Reason required** — update placeholder to "Select a reason…" (drop "optional"). Disable the **Yes, deactivate** action button until `deactivateReason` is a non-empty value from the list (or a non-empty free-text value when "Other" is chosen).

3. **Always-visible notes field** — render the notes/description `Input` (multi-line `Textarea` for better fit) at all times, not only when "Other" is selected. Label it "Notes (describe why this driver is leaving)". Keep it optional unless "Other" is selected (in which case notes become required as the reason detail).

4. **Persist notes separately** — currently free-text overwrites `deactivateReason`. Add a second state `deactivateNotes` and pass both to the audit log/update payload:
   - `reason`: the selected dropdown value (e.g. "Truck Down")
   - `notes`: free-text description
   
   Update the two call sites at lines ~1909 (update payload) and ~1903 (audit action metadata) to include `notes`. When "Other" is selected, store `reason: 'Other'` plus the required notes.

5. Reset both `deactivateReason` and `deactivateNotes` to empty when the dialog closes.

### Notes
- No DB schema change required; `reason` and `notes` are stored in the update payload / audit metadata JSON.
- Reactivate flow is unchanged.
