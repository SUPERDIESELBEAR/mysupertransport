

## Always-Visible PWA Install Status Badge

### Change
Replace the conditional badge (only shown when installed) with an always-visible badge that reflects the current state:

- **Installed**: Green badge — "App Installed M/d/yy" with a check icon
- **Not Installed**: Gray badge — "App Not Installed" with an X/circle icon

### File: `src/pages/staff/OperatorDetailPanel.tsx`
**Lines ~1987-1992** — Remove the `{pwaInstalledAt && ...}` conditional wrapper so the badge always renders. Use a ternary to switch between green (installed) and gray (not installed) styling and text.

```text
Before:  {pwaInstalledAt && <Badge ...green...>App Installed date</Badge>}

After:   <Badge ...conditional styling...>
           {pwaInstalledAt
             ? <>✓ App Installed date</>
             : <>✗ App Not Installed</>}
         </Badge>
```

- Green variant: current emerald styling with `CheckCircle2` icon
- Gray variant: `text-muted-foreground border-muted bg-muted/30` with `XCircle` or `Smartphone` icon

One file, ~10 lines changed. No database or other file changes needed.

