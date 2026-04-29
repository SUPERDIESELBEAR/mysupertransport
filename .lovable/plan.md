## Problem

In `src/pages/operator/OperatorPortal.tsx`, both `OperatorMessagesView` and `OperatorDispatchStatus` are imported and listed in the `OperatorView` type and bottom-nav config, but the main content area has **no `view === 'messages'` or `view === 'dispatch'` render branch**.

When a driver taps Messages or Dispatch, nothing renders in the content area — leaving only the centered `<BuildInfo />` footer visible. That's the white screen with the version + date string the user is seeing.

This was likely lost in a previous refactor — the `OperatorView` union, nav config, unread-badge logic, and `?tab=messages` URL handling all still reference these views correctly.

## Fix

Add the two missing render branches to `src/pages/operator/OperatorPortal.tsx`, alongside the existing view branches (around line 1438, between `notifications` and `docs-hub`):

1. **Messages view** — render `<OperatorMessagesView />` when `view === 'messages'`. Component takes optional props only.

2. **Dispatch view** — render `<OperatorDispatchStatus operatorId={operatorId} onMessageDispatcher={() => setView('messages')} />` when `view === 'dispatch' && operatorId`. Add a fallback message ("Your dispatch status will appear here once onboarding is complete.") when `view === 'dispatch'` but `operatorId` is null, matching the pattern already used by `documents` and `forecast`.

## Technical detail

```tsx
{/* ── MESSAGES VIEW ── */}
{view === 'messages' && <OperatorMessagesView />}

{/* ── DISPATCH VIEW ── */}
{view === 'dispatch' && operatorId && (
  <OperatorDispatchStatus
    operatorId={operatorId}
    onMessageDispatcher={() => setView('messages')}
  />
)}
{view === 'dispatch' && !operatorId && (
  <div className="text-center text-sm text-muted-foreground py-12">
    Your dispatch status will appear here once onboarding is complete.
  </div>
)}
```

Single-file change. No nav, routing, or component-internal changes needed — those layers already point at these views correctly.
