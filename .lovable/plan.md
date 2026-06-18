# Add Last Active Date/Time to Install Status Tooltip

## Goal
On the Management Dashboard → Driver Hub, when hovering the small phone/globe/user icon next to a driver's name, keep the existing "App installed …" / "Web only — last seen …" / "Never signed in" line **and** append a second line showing the driver's last active date and time inside the app.

## Where
`src/components/drivers/DriverRoster.tsx`, lines ~1052–1071 — the `TooltipContent` for the install-status icon. Data is already loaded: each driver row already has `last_web_seen_at` (updated by `mark_operator_seen` on every authenticated session — installed or web).

## Tooltip behavior
Render the tooltip body as two lines:

```text
Line 1 (unchanged):
  • Installed:     "App installed Jun 12, 2026"
  • Web only:      "Web only — last seen Jun 12, 2026"
  • Never:         "Never signed in"

Line 2 (new, only when last_web_seen_at exists):
  "Last active Jun 18, 2026 at 2:34 PM CT"
```

- For installed drivers, line 2 is the meaningful "last time they opened the app" signal (today the install date is the only thing shown — stale and confusing).
- For web-only drivers, line 2 is identical to their last-seen date but adds the time of day, which is genuinely new info.
- For never-signed-in drivers, line 2 is omitted.

## Formatting
- Date: `format(parseISO(last_web_seen_at), 'MMM d, yyyy')`
- Time: `format(parseISO(last_web_seen_at), 'h:mm a')` followed by the literal ` CT` suffix (matches the project's US Central Time standard from memory; `last_web_seen_at` is stored as UTC `timestamptz` and Date formatting renders in the viewer's local zone — staff are on CT, so this label is accurate for them and avoids pulling in a tz library).
- Layout: wrap the tooltip content in a `div` with `text-xs leading-tight`; line 2 in a `div` with `text-muted-foreground text-[11px] mt-0.5`.

## Out of scope
- No schema changes; no new RPC; no changes to the icon itself or to its color logic.
- No changes to the "Excluded" badge tooltip or the reminder button next to it.
- No changes outside `DriverRoster.tsx`.
