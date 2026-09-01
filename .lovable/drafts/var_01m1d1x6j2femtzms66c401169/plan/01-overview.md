# Vehicle Detail won't open from the roster

Two separate things are going on.

**1. What you are looking at.** The card-click fix lives in this draft. The preview you tested is the main app, which does not have the draft's code yet. Until the draft is accepted, clicking a card there behaves exactly as it did before — nothing to fix in code for that half.

**2. The click target itself.** In the draft, the whole card is one activation target, but the click is discarded whenever the click lands inside any `button`, `a`, `input`, `select`, `textarea`, dialog, or opted-out node. Several parts of the card you named (the status pill at top right, the "Repair Cost" figure) sit inside wrapper elements that can match that guard, so the click gets swallowed instead of navigating. That is worth tightening regardless of which preview you use.
