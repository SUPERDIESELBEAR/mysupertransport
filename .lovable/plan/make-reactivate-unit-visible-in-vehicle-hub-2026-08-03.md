# Make "Reactivate unit" visible in Vehicle Hub

## What's actually in the code today (verified)

The reactivate action **is** shipped in `FleetRoster.tsx`, but it is hidden in two ways:

- It only appears on the **Deactivated** tab (the toggle at the top of Vehicle Hub), never on Active.
- It lives inside the three-dot "More actions" menu on each card/row — there is no visible button, so it looks absent unless you open that menu.
- It renders only for management/owner roles.

So the most likely reason you don't see it: you were on the Active tab, or you didn't open the "..." menu. A stale installed-app cache is also possible — the published build is version `33335a` (built 17:57 UTC today).

## What to change

1. **Surface it as a real button.** On the Deactivated tab, show a gold "Reactivate Unit" button directly on each card and each list row, instead of burying it in the three-dot menu. Keep the menu item too.
2. **Make the tab obvious.** When the Deactivated tab is selected, show a short banner: "These units are off the roster. Use Reactivate Unit to put one back on the active roster."
3. **No behavior change** to the confirmation dialog, the audit entry, or the missing-insurance-date follow-up — those already work as planned.

## Verification

After the change I'll open Vehicle Hub in the preview, switch to Deactivated, and screenshot unit 187 showing the visible Reactivate Unit button. If it renders in preview but still not for you after publishing, the cause is the installed-app cache and a hard refresh clears it.

## Technical notes

Single file: `src/components/fleet/FleetRoster.tsx` — card action row (~line 595) and table action cell (~line 741). No schema, policy, or query changes.
