## Problem
When a driver taps **View Document** on the Doc Hub, the DocumentViewer renders in place of the hub but inherits the previous scroll position, so drivers land near the bottom of the article and have to scroll up.

## Fix
Reset the scroll position when `DocumentViewer` mounts (and when the viewed doc changes) so every "View Document" tap starts at the top.

## File
- `src/components/documents/DocumentViewer.tsx` — add a `useEffect` on mount / on `doc.id` change that scrolls the window (and the nearest scrollable ancestor, since the driver app uses a fixed shell with an inner scroll container) to the top. Use `window.scrollTo(0, 0)` plus a walk up from the component root to reset any `overflow-auto` ancestor's `scrollTop`.

## Out of scope
- No changes to the Doc Hub list, PDF flow, or acknowledgment logic.
- No route-level scroll-restoration change.
