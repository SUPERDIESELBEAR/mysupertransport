/**
 * ELD / RODS (duty-status) visibility switch — owner decision (b), 2026-09-17.
 *
 * The feature is HIDDEN, not removed: every table, policy, function, trigger,
 * bucket, component, hook and library stays in the repo and in the database.
 * What was taken away are the ways IN — routes, navigation entries, the PWA
 * shortcut, the two duty-status cron jobs, and the background sync runner.
 *
 * TO RESTORE: flip this to false AND put back the entries listed in the
 * "2026-09-17 ELD/RODS hidden" record entry of docs/tms-build-status.md. This
 * flag alone does not re-create the navigation entries; it only re-arms the
 * offline sync runner and the placeholder screens.
 *
 * The inspection binder is NOT part of this: it is not duty-status data and
 * must stay reachable (driver binder, management binder, /inspect/:token,
 * v_compliance_items, MO plate expiry sync, onboarding's binder writes).
 */
export const ELD_FEATURE_HIDDEN = true;

/** Copy shown wherever a duty-status screen used to be. */
export const ELD_HIDDEN_MESSAGE = 'This feature is not available.';
