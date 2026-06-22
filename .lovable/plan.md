## Goal
Prevent driver phone numbers in the Driver Hub table from wrapping onto multiple lines in production (SUPERDRIVE), so each phone number renders on a single continuous line.

## Cause
In `src/components/drivers/DriverRoster.tsx` (line ~1147), the phone cell renders a `<a>` with `flex items-center gap-1` but no whitespace control. When the viewport / column is tight (Mac browser at certain widths), the digits and dashes wrap. Lovable's preview happens to be wider, so it looks fine there.

## Change
One small edit in `src/components/drivers/DriverRoster.tsx`:

- Add `whitespace-nowrap` to the phone `<TableCell>` (line 1145) and to the inner `<a>` (line 1147) so the icon + number stay on one line.
- Keep the existing `hidden sm:table-cell` so the column still hides on the smallest screens.

No other files, no logic changes, no header changes needed.

## Technical details
```tsx
<TableCell className="hidden sm:table-cell whitespace-nowrap">
  {driver.phone
    ? <a
        href={`tel:${driver.phone}`}
        className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 whitespace-nowrap"
        onClick={e => e.stopPropagation()}
      >
        <Phone className="h-3 w-3 shrink-0" />
        {driver.phone}
      </a>
    : <span className="text-muted-foreground text-xs">—</span>}
</TableCell>
```

Adding `shrink-0` to the `Phone` icon is a tiny safety net so the icon never shrinks if the row gets pinched.

## Verification
After implementation, reload the management Driver Hub on the Mac browser at the widths you saw the issue (sidebar open and collapsed) and confirm the phone number is a single line.
