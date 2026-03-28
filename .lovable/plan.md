

## Make State a Dropdown Picker in Operator Detail Panel

### Context
- **Driver Hub roster**: State column is read-only display — no input needed
- **Add Driver modal**: Already uses a `<Select>` dropdown — no change needed
- **Operator Detail Panel contact info**: Currently uses a plain text `<Input>` — needs to become a dropdown

### Change

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

Replace the `<Input>` for state (around line 2063-2067) with a `<Select>` dropdown using `US_STATES` from `src/components/application/types.ts`:

```tsx
// Before (plain input)
<Input value={contactDraft.address_state} onChange={...} maxLength={2} />

// After (dropdown)
<Select value={contactDraft.address_state} onValueChange={v => setContactDraft(prev => ({ ...prev, address_state: v }))}>
  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="State" /></SelectTrigger>
  <SelectContent>
    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
  </SelectContent>
</Select>
```

Add imports for `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` and `US_STATES`.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace state `<Input>` with `<Select>` dropdown using `US_STATES` |

