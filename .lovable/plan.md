
## Two fixes in EditProfileModal and nav avatar circles

### Bug 1 — Save button looks disabled after photo upload (gold color missing)

**Root cause:** The Save button's gold styling is gated behind `isDark ? 'bg-gold ...' : ''`. When `EditProfileModal` is opened from `StaffLayout` with no `variant` prop, `isDark` is `false` and the button gets zero custom class — it renders as the default shadcn primary style, which looks inactive/grey.

The button IS actually enabled (firstName/lastName are already seeded from the profile), but visually it never shows gold in the default variant.

**Fix:** Always apply gold styling to the Save button regardless of variant — remove the `isDark` gate on the submit button's className.

**File:** `src/components/EditProfileModal.tsx` — line ~401, change:
```
className={`flex-1 ${isDark ? 'bg-gold text-surface-dark hover:bg-gold-light font-semibold' : ''}`}
```
to:
```
className="flex-1 bg-gold text-surface-dark hover:bg-gold-light font-semibold"
```

---

### Bug 2 — Uploaded photo doesn't fill the circle

**Root cause:** Both the nav avatar button (`StaffLayout` line 173) and the operator portal button use `flex items-center justify-center` on the button element itself, which is also the `overflow-hidden` container. Inside a flex container, an `img` with `h-full w-full` won't stretch to fill unless the flex item is also set to `self-stretch`. The image renders at its natural size constrained by the flex alignment instead of filling the circle.

**Fix:** Wrap the `img` (and fallback span) inside an inner `div` that is the `h-full w-full` fill layer, or add `self-stretch` to the img. The simplest clean fix is to add a full-size inner wrapper div inside each avatar button so the img has a properly sized block parent.

**Files:** 
- `src/components/layouts/StaffLayout.tsx` — the `h-8 w-8` avatar button at line ~173
- `src/pages/operator/OperatorPortal.tsx` — the `h-8 w-8` avatar button at line ~654 and the `h-5 w-5` button at line ~735
- `src/components/EditProfileModal.tsx` — the `h-20 w-20` preview circle at line ~253 (already has inner div, but verify `object-cover` is effective)

**Change pattern for each button:**  
Remove `flex items-center justify-center` from the outer button/container (those are only needed for the fallback initials span), and instead put them on the fallback span's parent div. The img itself gets `block h-full w-full object-cover`.

---

### Summary

| File | Change |
|---|---|
| `EditProfileModal.tsx` | Save button always gold |
| `StaffLayout.tsx` | Fix avatar circle fill |
| `OperatorPortal.tsx` | Fix avatar circle fill (2 spots) |

3 files · visual-only fixes · no logic or data changes.
