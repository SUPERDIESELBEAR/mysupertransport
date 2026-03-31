

## Match Progress Ribbon Save Button to Dark Gold Style

### Change
Update the small Save button in the progress ribbon (line 2811) from the current outlined/ghost style to a solid dark gold background matching the main "Save Changes" button.

**Current** (line 2811):
```
border border-gold/60 bg-gold/10 text-gold hover:bg-gold/20
```

**New**:
```
bg-gold text-surface-dark hover:bg-gold-light
```

This matches the main Save Changes button style at line 1760: `bg-gold text-surface-dark font-semibold hover:bg-gold-light`

### File Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Update ribbon save button classes to solid dark gold |

