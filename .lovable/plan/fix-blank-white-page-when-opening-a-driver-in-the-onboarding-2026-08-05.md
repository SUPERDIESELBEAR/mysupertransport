# Fix: blank white page when opening a driver in the Onboarding Pipeline

## What's happening

Reproduced it: clicking a driver crashes the detail panel and React unmounts the page, leaving a white screen. The console error is:

```text
Rendered more hooks than during the previous render.
The above error occurred in the <OperatorDetailPanel> component
```

Cause: the Internal Notes auto-save added last turn placed two React hooks (the `saveNotesOnly` callback and the 1.5s auto-save timer effect) below the panel's `if (loading) return <spinner/>` early exit. On the first render the panel is loading and those hooks never run; once data arrives they do, so the hook count changes between renders and React throws.

## The fix

In `src/pages/staff/OperatorDetailPanel.tsx`:

- Move the `saveNotesOnly` `useCallback` and the notes auto-save `useEffect` above the `if (loading)` early return, so every render calls the same hooks in the same order.
- Keep the non-hook derived values (`notesDirty`, `notesStatus`, `hasUnsavedChanges`) where they are — they are plain expressions and don't affect hook order.
- Guard the auto-save effect so it does nothing while the panel is still loading (no saved snapshot yet), preserving current behavior.

## Verification

Reopen a driver from the pipeline in a headless browser: the detail panel renders, no page error is thrown, and typing in Internal Notes still shows Unsaved -> Saving -> Saved and persists.