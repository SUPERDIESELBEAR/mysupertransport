# Restore dismissed serial conflicts

When you tap "These are different devices", the pair is hidden — but only in this browser, on this computer. Nothing was changed in the database and no records were merged, so the two pairs you dismissed are fully recoverable.

Two parts:

1. Clear the dismissals that were recorded by accident, so both pairs reappear in the serial-conflict panel immediately.
2. Make dismissal reversible going forward, so an accidental tap never needs a fix again.

## Making it reversible

- Dismissing shows a short "Undone?" toast with an **Undo** action for a few seconds.
- When any pairs are hidden, a small line appears under the conflicts panel: "2 pairs marked as different devices — Show". Tapping it brings them back for review.
- If the panel has no active conflicts left but hidden pairs exist, that line still shows, so hidden pairs are never invisible.
