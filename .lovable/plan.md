## Problem

On iOS Safari (and the PWA), any `<input>` with a font-size smaller than 16px triggers an automatic zoom-in when it gains focus. The reply composer in the driver messages view uses `text-sm` (14px), which is why tapping "Reply to Emma Mueller…" zooms the screen.

## Fix

Bump the composer input's font-size to 16px on mobile so iOS no longer zooms. Keep the visual density on larger screens if desired.

**File:** `src/components/messaging/MessageComposer.tsx` (line 134)

Change the input className from:
```
flex-1 h-10 text-sm
```
to:
```
flex-1 h-10 text-base sm:text-sm
```

This keeps the compact 14px appearance on tablet/desktop but renders at 16px on phones, which is the iOS threshold that disables focus-zoom.

## Why not edit the viewport meta

Adding `maximum-scale=1, user-scalable=no` to `index.html` would also stop the zoom, but it disables pinch-zoom app-wide and hurts accessibility. Fixing the input font-size is the standard, targeted fix.

## Verification

Open the driver app on a phone (or iOS simulator), navigate to Messages → a thread, tap the reply box. The keyboard should slide up without the page zooming.
