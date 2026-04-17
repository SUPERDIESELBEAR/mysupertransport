

User wants the "Optional · Opt-in per driver" badge replaced with a toggle switch (because the badge covers the Upload button and they don't like the pill style).

Let me check the current rendering location.
<lov-tool-use id="toolu_vrtx_01L2QRGz74WK1DtJubTVsJ6Q" name="code--search_files" integration-id="code" data="{\"query\": \"Optional · Opt-in|isOptional|Opt-in per driver\", \"include_patterns\": \"src/components/inspection/InspectionBinderAdmin.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_018h7y8RzksV6Y8hKjHdVXuV" name="code--search_files" integration-id="code" data="{\"query\": \"Optional · Opt-in|isOptional|Opt-in per driver\", \"include_patterns\": \"src/components/inspection/InspectionBinderAdmin.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01FHDsDLQpMJ4D9brWvsfMnS" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/inspection/InspectionBinderAdmin.tsx\", \"lines\": \"1360-1430\"}">
</lov-tool-use>
I have what I need. The user wants the pill replaced with a Switch toggle that controls visibility, and not overlap the upload button.

<lov-plan>

## Replace "Optional · Opt-in" Badge with a Switch Toggle

### Current issue
The "Optional · Opt-in per driver" badge in the admin Company tab (lines 1392–1396 of `InspectionBinderAdmin.tsx`) is positioned absolutely over the row's top-right corner, where it overlaps the Upload button on the optional doc rows (Hazmat, Overweight/Oversize). The user also doesn't like the pill aesthetic.

### What changes

Replace the absolute-positioned badge with a clean **Switch toggle** placed inline to the **left of the row content** (next to the drag handle), labeled simply **"Optional"**. The toggle visually communicates the same concept (opt-in by default) but stays out of the way of the Upload button.

```text
Before:
┌──────────────────────────────────────────────────┐
│ ⋮⋮  Hazmat            [Optional·Opt-in] [Upload] │  ← overlap
└──────────────────────────────────────────────────┘

After:
┌──────────────────────────────────────────────────┐
│ ⋮⋮  [⊙ Optional]  Hazmat              [Upload]   │  ← clean
└──────────────────────────────────────────────────┘
```

### Behavior
- The toggle on the **Company tab** is **read-only / informational** (shows that this doc is "optional" by default fleet-wide). It cannot be toggled here — global on/off toggling lives on the Per-Driver tab where staff already enables it per driver via the existing checkboxes.
- A small tooltip on the toggle reads: *"Hidden from drivers by default. Enable per driver in the Per-Driver tab."*

If the user prefers the toggle to be **clickable** (e.g. a future "globally enable for all drivers" switch), we can wire that up in a follow-up — but right now there's no fleet-wide opt-in feature requested.

### File changed
| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderAdmin.tsx` | Remove the absolute Badge (lines 1392–1396). Add a small inline Switch + "Optional" label between the drag handle and `AdminDocRow`. Wrap in Tooltip explaining the per-driver opt-in. |

### Why this is safe
- Pure UI change — no logic, no data, no dependencies altered
- `Switch` and `Tooltip` components already exist in the codebase
- Upload button is no longer obscured

