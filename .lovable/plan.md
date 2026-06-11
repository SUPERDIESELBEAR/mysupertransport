Do I know what the issue is? Yes.

The screenshot is the same symptom, but the live applicant page is still serving an older published JavaScript bundle. I checked the published `/apply` bundle and it still contains both old behaviors:

- `signed_date: new Date().toLocaleDateString(...)`, which can break the draft save payload.
- `String(err)`, which turns the real backend error into `Couldn't save progress: [object Object]`.

The current project source already contains the newer draft-save and readable-error changes, but applicants using the published app have not received that build yet.

Plan:

1. Verify the current source save path one more time
   - Confirm `src/pages/ApplicationForm.tsx` uses the readable save error formatter.
   - Confirm `src/components/application/types.ts` and `utils.ts` send `signed_date` as safe ISO/null values.
   - Confirm the live database `save_application_draft` function has the signed-date guard.

2. Add a stronger public update prompt for applicants
   - Update the version-check logic so it also runs on public applicant routes like `/apply`, not only after login.
   - This will help applicants on stale browser/PWA sessions see a refresh prompt when a newer build exists.

3. Publish/deploy the latest build
   - Push the corrected source to the public app so applicants stop receiving the old `[object Object]` save error.
   - After publishing, verify the published bundle no longer contains the old `String(err)` / localized `signed_date` save logic.

4. Confirm with a save test
   - Open the published `/apply` page.
   - Fill Step 1 with a test email.
   - Click Save Progress.
   - Confirm the applicant sees a real “Progress saved” confirmation with step and timestamp.

Technical details:

- Primary file to adjust: `src/hooks/useVersionCheck.tsx`.
- Already-correct files to verify: `src/pages/ApplicationForm.tsx`, `src/components/application/types.ts`, `src/components/application/utils.ts`.
- No schema/table changes are expected unless final verification finds another backend casting issue.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>