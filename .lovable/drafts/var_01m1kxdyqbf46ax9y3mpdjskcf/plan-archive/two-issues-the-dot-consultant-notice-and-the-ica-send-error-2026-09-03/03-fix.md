## The fixes

### ICA send — first, because it is blocking work

Remove the redundant wrapper guard from the ICA contracts table. The rule it was trying to run stays exactly as it is and keeps protecting the table: signers may still only change signature, deposit, and (for truck owners) owner-contact fields. Nothing about who may edit what changes — the only thing removed is a duplicate that cannot legally run.

This is a database change staged in this draft, so it takes effect when you accept the draft. After that, Reginald's saved ICA can be sent normally with no re-entry.

### Deactivation notice — make the confirmation tell the truth

1. **Green confirmation line** — replace the fixed consultant name with the recipients the send actually used. One address reads "Notice sent to marc@mysupertransport.com"; several read "Notice sent to marc@… and 2 others" with the list underneath.
2. **Toast** — same change, so the pop-up and the page always agree.
3. **Flag the test case** — when the saved DOT Consultant is not in the To field, add a quiet note: "DOT Consultant was not included — the driver's notification is still outstanding." The system already records this internally; it is simply never shown.

Who receives the email does not change. Removing Tracey already worked and will keep working.

## Technical notes

**ICA.** `public.enforce_ica_contracts_operator_update()` is a trigger function whose entire body is `RETURN public.enforce_ica_contracts_operator_column_whitelist();` — a direct call to another trigger function, which PL/pgSQL rejects at call time regardless of the caller's role. It is bound to `trg_enforce_ica_contracts_operator_update` (BEFORE UPDATE on `ica_contracts`), alongside `trg_ica_contracts_operator_column_whitelist`, which executes the same whitelist function properly. Staged migration drops the wrapper trigger only; the function and the working trigger are untouched. Insert-path ICAs never hit it, which is why only draft re-sends fail.

**Notice.** `src/components/management/DeactivationWizardContent.tsx` — the `safetySent` block and the success toast interpolate `consultantLabel`, derived from `dot_consultant_email_settings.consultant_name`. The `send-deactivation-notice` function already returns `sent_to` (To + CC) and `consultant_included`; capture that response in state on success and render from it. No edge-function, schema, or delivery-path change.

Both items get added to `roadmap.md` when the build starts.
