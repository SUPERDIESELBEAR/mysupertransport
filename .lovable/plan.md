

## Verify ScrollJumpButton on every Applicant Pipeline subview

I'll exercise each subview state in the live preview with a short viewport so any list naturally exceeds the 400px threshold, then confirm the floating button renders (and flips between "Jump to bottom" and "Back to top").

### Checklist of subviews to verify

1. **Default Active list** — `/staff?view=pipeline` on load (no filters)
2. **All meaningful filter / section states**, exercised in this order:
   - Search results (type a partial name in the search box)
   - ICA filter active (Stage 3 — ICA chip)
   - Truck Down filter (set via the Truck Down banner / chip)
   - On Hold section expanded
   - Owner Test section expanded (if present)

### How I'll verify each one

For every subview:
1. `set_viewport_size` to **1280 × 600** so even short lists overflow past 400px.
2. `navigate_to_sandbox` to `/staff?view=pipeline` (or click the right filter from the active page — session state is preserved across viewport changes).
3. Apply the subview state (toggle filter, expand section, etc.).
4. `screenshot` at scroll-top → expect "Jump to bottom" pill in bottom-right.
5. Scroll the page past 300px → `screenshot` again → expect the same pill flipped to "Back to top".
6. Record pass/fail per subview.

### What "pass" means

- Pill is visible, fixed in the bottom-right of the viewport.
- Label/icon flips correctly after scrolling >300px.
- Pill correctly **hides** if a subview happens to be shorter than viewport + 400px (this is by-design behavior — I'll call those out separately rather than as failures).

### Expected outcome

The button is page-level (only checks `document.documentElement.scrollHeight`), so all six subviews should pass at 1280×600. If any subview fails to show the button despite the page being scrollable, I'll flag it and propose a fix in a follow-up plan (no code changes in this verification pass).

### Deliverable

A short report in chat:
- Subview → Pass / Fail / Hidden-by-design (with screenshot reference)
- Any anomalies (e.g., button overlapping a sticky element, wrong z-index, label not flipping)
- No code changes unless a real bug surfaces — in which case I'll stop and call it out before editing.

