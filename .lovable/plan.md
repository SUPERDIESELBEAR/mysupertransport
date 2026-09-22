# Per-driver pay — Pass 5 of 5

## Result
Complete the staff-only pay screens without changing any real driver or company rate.

## Build
1. **Driver Linehaul Pay**
   - Add a staff-driver-page card above Settlement Forecast.
   - Show the effective rate, start date, source, dated history, reason, and actor.
   - Management and owner can read it. Only database-confirmed `driver_pay.change` permission reveals the Change action.
   - Add the required percentage/date/reason form, no-past-date guidance, exact before/after confirmation, and a visible unauthorized refusal.
   - Show an amber signed-agreement mismatch with both percentages and clearly identify which rate pays.

2. **Company rate sheets**
   - Add the versioned company pay-policy screen to Management → Accounting → Settlement Settings, beside fuel pass-through because both feed settlements.
   - Show current rates/start date and dated history.
   - Let only database-confirmed `pay_policy.change` permission open a new version through `open_pay_policy_version`.
   - Pre-fill every rate so unchanged values visibly carry forward, then require an exact confirmation sentence before writing.

3. **Agreement builder**
   - Replace the hardcoded 72% default with the driver’s effective dated rate.
   - Preserve saved agreement terms and the existing sent-agreement lock; only owner permission can alter a sent agreement.

4. **Settlement review and detail**
   - Before approval, compare each driver’s signed agreement percentage with the effective paying rate and show an amber staff-only mismatch warning.
   - Show each preview line’s recorded rate source.
   - Add a staff-only stored-settlement detail reader so historical lines show “company rate sheet,” “his rate,” or “not recorded”; never infer missing history.
   - Keep the driver settlement query and screens percentage-free.

5. **Guards and tests**
   - Remove both completed AWAITING reachability entries and lower the ceiling from 4 to 2.
   - Add focused tests for permission-based controls, inherited values, confirmations, mismatch warnings, agreement prefill/lock, provenance labels, and driver exclusion.
   - Run the focused checks, full suite with two workers, typecheck, and the live reachability guard.

6. **Proof and record**
   - Use no-commit confirmations or throwaway data only; do not change a real pay rate.
   - Verify on screen as Marcus, Mae, onboarding-only, Leo, and Steve, capturing screenshots where possible.
   - Confirm the deployed preview, write the dated Pass 5 report with authored files and verbatim suite summary, mark the five-pass work complete, and create one pending staff announcement for owner review.

## Identity expectations
- **Marcus:** sees both screens and both Change actions.
- **Mae:** sees pay information but no Change actions.
- **Onboarding-only:** sees neither internal pay screen.
- **Leo:** sees neither internal pay screen.
- **Steve:** sees no percentage in the driver app.

## Technical notes
- No schema migration is planned; Passes 2–4 already provide both owner-only writers and settlement provenance columns.
- All writes remain enforced by the database permissions and RPCs, never by hidden buttons alone.
- Staff settlement reads stay separate from the driver-safe settlement query.
