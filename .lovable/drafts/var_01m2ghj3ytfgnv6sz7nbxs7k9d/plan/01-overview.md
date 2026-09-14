# Chat window opens where the gold button is

## What's happening today

The message window remembers where it was last dragged and re-opens at that saved spot (clamped to stay on screen). The gold button is always bottom-right, so if the window was ever moved, it pops up somewhere else — exactly what you're seeing.

## The fix

When the gold button is clicked, the window opens anchored to the bottom-right corner — right next to the button, above the "Jump to bottom" pill — every time.

- The saved position is still respected **while the window is open** (drag it, it stays put for that session of use).
- When the window is closed and re-opened, it returns to the bottom-right anchor instead of wherever it was left.
- Saved size, contacts-rail collapse, and filter choices are kept — only the re-open position resets to the corner.
- If the window was dragged smaller or the screen is small, the existing "always fully on screen" clamping still applies.

## What you'll see

Click the gold button → the window appears in the bottom-right of the screen, next to the button, no matter where it was dragged before.
