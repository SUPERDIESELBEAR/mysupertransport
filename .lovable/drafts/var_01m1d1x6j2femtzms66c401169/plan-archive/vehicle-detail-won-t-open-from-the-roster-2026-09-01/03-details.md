## What I'll change

In the fleet roster (cards and table rows alike):

- Narrow the "ignore this click" rule so it only bails on elements that genuinely have their own action — the Edit, Log Update, Reactivate, and photo buttons, plus real links and form controls. Text, the status pill, the repair-cost figure, and whitespace all navigate.
- Mark the action buttons explicitly as opt-out targets instead of relying on tag matching, so the rule can be strict without accidentally catching decorative wrappers.
- Keep keyboard activation (Enter/Space) and the focus ring.

## Verifying

I'll drive the running app and click, in order: driver name, unit number, the status pill, the repair-cost text, and blank card area — confirming each lands on Vehicle Detail — then confirm Edit, Log Update, and the photo buttons still do their own thing and do not navigate.

## Note on the preview

These changes only appear in the main app once you accept this draft. If you want to confirm before accepting, test from the draft preview.
