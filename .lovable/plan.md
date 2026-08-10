# Fix the "All Clear" flash in CDL & Med Cert Alerts

## What's happening
The Compliance Alerts panel starts with an empty alert list and has no notion of "still loading". Because an empty list is treated as "nothing to worry about", the green "All clear — fleet is compliant" card renders for the split second before the first database fetch returns. Once the data arrives, the real alerts replace it — which reads as a flash/glitch.

Confirmed in `src/components/inspection/ComplianceAlertsPanel.tsx`: the empty-state early return fires purely on `alerts.length === 0`, with no loading guard.

## The fix
1. Track a `loading` flag in the panel, true on mount and until the first data fetch finishes (including the early-exit path when no operators come back, so it can never get stuck).
2. While loading, render a lightweight skeleton placeholder in the panel's shape (same rounded card, muted header line and 2-3 shimmer rows) instead of the green "All clear" card.
3. Only show "All clear — fleet is compliant" after the fetch has completed and there genuinely are zero alerts.
4. Keep subsequent background refreshes (realtime updates, compliance-window changes) silent — they should not re-trigger the skeleton, so the panel never blinks after the first load.

## Technical notes
- File: `src/components/inspection/ComplianceAlertsPanel.tsx`
- Add `const [loading, setLoading] = useState(true)`; clear it in a `finally` inside `fetchData` so the `if (!ops) return;` path also resolves.
- Use a `hasLoadedRef` so only the initial fetch renders the skeleton; realtime-driven refetches leave the current UI in place.
- Skeleton uses existing `Skeleton` / muted tokens — no new colors or hardcoded utilities.
