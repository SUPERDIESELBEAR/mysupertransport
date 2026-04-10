

## Default Sort: Hot → Cold with Progress Tiebreaker

### What changes
The Pipeline Dashboard will load with temperature sorting active by default (Hot → Cold). Within each temperature tier, applicants will be further sorted by their onboarding progress percentage (highest first), so the furthest-along Cold applicant appears before one who just started.

### How it works

Currently the sort state initializes as:
```typescript
const [sortKey, setSortKey] = useState<SortKey | null>(null);
const [sortDir, setSortDir] = useState<SortDir>('asc');
```

This will change to:
```typescript
const [sortKey, setSortKey] = useState<SortKey | null>('temperature');
const [sortDir, setSortDir] = useState<SortDir>('desc');
```

And the temperature sort comparator (line ~1699) will add a progress-based tiebreaker when two operators share the same temperature level:
```typescript
if (sortKey === 'temperature') {
  const cmp = TEMP_ORDER[aTemp] - TEMP_ORDER[bTemp];
  if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
  // Tiebreak: higher progress first
  const pCmp = computeProgressFromConfig(b, stageConfigs) - computeProgressFromConfig(a, stageConfigs);
  return sortDir === 'asc' ? -pCmp : pCmp;
}
```

### Result
- Page loads sorted Hot → Cold automatically
- Within each tier (e.g., all "Cold" operators), whoever is furthest along in onboarding appears first
- The Temp button shows the active 🔥 Hot → Cold state on load
- Users can still click to toggle to Cold → Hot or clear the sort

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/PipelineDashboard.tsx` | Set default `sortKey` to `'temperature'` and `sortDir` to `'desc'`; add progress tiebreaker to temperature sort comparator |

