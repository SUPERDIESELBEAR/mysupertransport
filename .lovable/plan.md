

## Improve ICA Signing UX on Mobile

### Problem
After drawing their signature and typing their name in the ICA document (which is embedded inline), the operator must scroll past the full contract to find the "Execute Agreement" button at the very bottom. On a phone, this is easy to miss — the signer doesn't know there's a button below the document.

### Solution
Add a **sticky floating action bar** at the bottom of the screen that appears once the contract is not fully executed. This bar contains:
- The "Execute Agreement" button (always visible, no scrolling needed)
- A brief status line: shows what's still missing ("Type your name & sign" / "Draw your signature" / "Ready to execute")
- The legal disclaimer text

The existing bottom section (lines 249-264) is replaced by this sticky bar so there is no duplication.

### Flow after fix
1. Operator opens ICA tab — sees the gold banner and the contract
2. A sticky bar is always visible at the bottom of the screen with the Execute button (disabled until both name + signature are provided)
3. The status line updates in real time: "Type your name & draw your signature" → "Draw your signature" → "Ready — tap to execute"
4. Operator taps Execute without needing to scroll — the button is always on screen
5. After execution, the sticky bar disappears and the success banner + navigation kick in

### Files changed

| File | Change |
|------|--------|
| `src/components/operator/OperatorICASign.tsx` | Replace the bottom `<div>` block with a `fixed bottom-0` sticky action bar containing the status hint, legal text, and Execute button. Add dynamic status message based on `signedName` and `hasDrawn` state. |

### Technical detail
- Use `fixed bottom-0 left-0 right-0 z-50` with `bg-surface-dark/95 backdrop-blur border-t` for the sticky bar
- Add `pb-28` padding to the main container so content isn't hidden behind the bar
- Status logic:
  - `!signedName && !hasDrawn` → "Type your name & draw your signature below"
  - `!signedName` → "Type your full name to continue"
  - `!hasDrawn` → "Draw your signature to continue"
  - both present → "Ready to execute ✓"

