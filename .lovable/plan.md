## Goal
When staff finishes verifying every assigned equipment line for a driver, automatically alert the driver (in-app) that their Equipment Asset Sheet is ready to sign, and take them straight to it.

## Behavior

- **Trigger:** the moment the last unverified, assigned equipment line flips to Verified (and the sheet is not yet signed).
- **Channel:** in-app only — bell notification + banner on the driver app.
- **Reminders:** none. One-shot per driver per readiness event.
- **Deep link:** tapping the notification/banner opens the driver app straight to the Onboarding Status view with the Equipment Asset Sheet expanded and scrolled into view.
- **Idempotent:** if verification is toggled off and back on, only re-notify if the driver was un-notified since (won't spam on toggle churn).
- **Skip conditions:** already signed, no equipment assigned, or notification already fired for this readiness cycle.

## UI additions (driver app)

1. **Home screen banner** (post-Go-Live drivers): a gold "Action Required — Sign Equipment Receipt" card appears when the sheet is ready to sign but unsigned. Button routes to the sheet.
2. **Onboarding Status banner** (pre-Go-Live drivers): same "ready to sign" card at the top of Progress.
3. **Bell notification** with title "Equipment Asset Sheet ready to sign" and CTA link.
4. Auto-expand the Equipment Asset Sheet card when the driver lands there from the notification.

## Staff-side confirmation

- After the last verify toggle, staff sees a brief toast: "Driver notified — ready to sign."

## Technical notes

- Add a database trigger on `onboarding_status` that fires after any `*_verified_at` column changes. It recomputes whether all *assigned* lines are verified and the sheet is unsigned; if so, and no readiness notification exists for the current cycle, it inserts a row into `notifications` for the driver and stamps `equipment_asset_sheet_ready_notified_at` on `onboarding_status`.
- Clearing verification (unverify) clears the stamp so a future re-verification can notify again.
- The driver banner logic reads the same "all assigned verified + unsigned" condition from `onboarding_status` — no new fetch required.
- Deep link uses the existing `navigateToView('progress')` path plus a query flag (e.g. `?focus=equipment-sheet`) that `EquipmentAssetSheet` reads to open expanded and scroll into view.
- No new tables; reuses existing `notifications` table and driver-portal navigation.