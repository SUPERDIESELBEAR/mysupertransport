

## What's Being Built

Two enhancements to the Inspection Binder admin view:

### 1. Company Docs — Share to Specific Driver
Currently company docs have a "Share with all fleet drivers" toggle. We need to add a secondary action: **Share to a specific driver** — sends a copy of the company doc as a per-driver record for a selected operator (e.g., sharing the Insurance doc specifically with Driver A's binder alongside the fleet-wide copy).

### 2. Driver Doc Staging Area ("Inbox")
A new fourth tab: **Staging** (or "Unassigned Docs"). Staff can upload documents here without selecting a driver first. Each staged document sits in a queue, visible with its file name, upload date, and a "Assign to Driver" action. When ready, staff picks a driver from a dropdown on that card and assigns it — which creates the proper `per_driver` inspection_documents record with the selected `driver_id` and transfers the file.

---

## How the Staging Area Works

### Database
- A new `inspection_documents` row with `scope = 'per_driver'` and `driver_id = NULL` — these are the "staged" (unassigned) documents.
- No schema change needed. The existing table supports `driver_id = NULL` per-driver rows already (the IRP migration even noted this).
- Staged docs are fetched by: `scope = 'per_driver' AND driver_id IS NULL`.

### Staging tab UI
- Upload button at the top — staff uploads a file with a doc name/label (free-text input, since it's not a named slot yet).
- Each staged card shows: filename, label, upload date, a driver dropdown, and an "Assign to Driver" button.
- On assign: updates the `driver_id` on the row to the selected operator's `user_id`, completing the assignment. The file stays in storage at its current path.

### Company → Share to Driver
- On each company doc row in the Company Docs tab, add a small "Share to driver…" button (secondary, below the fleet toggle).
- Opens an inline dropdown: staff picks a driver from the operator list.
- On confirm: inserts a new `per_driver` inspection_documents row for that driver, reusing the same `file_url` and `file_path`, with the same `name`, `expires_at` copied over.
- Toast confirms: "Insurance shared to John Smith's binder."

---

## Files Changed

| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderAdmin.tsx` | Add Staging tab + staged doc upload/assign logic + "Share to driver" on company rows |

No schema changes, no new tables, no type file changes needed.

---

## Tab Layout After Change

```text
[ Company Docs ] [ Driver Docs ] [ Driver Uploads ] [ Staging ]
```

**Staging tab:**
```text
┌─────────────────────────────────────────────┐
│  Unassigned Documents                [+ Upload]  │
│  Documents uploaded but not yet assigned         │
│  to a driver. Assign when ready.                 │
├──────────────────────────────────────────────┤
│ 📄 insurance-renewal.pdf        Mar 12, 2026 │
│    Label: "Insurance (renewal)"               │
│    [Select driver ▾]  [Assign to Driver]      │
├──────────────────────────────────────────────┤
│ 📄 cdl-scan-john.pdf            Mar 18, 2026 │
│    Label: "CDL"                               │
│    [Select driver ▾]  [Assign to Driver]      │
└──────────────────────────────────────────────┘
```

**Company doc row — "Share to driver" addition:**
```text
┌─────────────────────────────────────────────────┐
│ 📄 Insurance       [Expires Jun 2026]  [Fleet] │
│    ─────────────────────────────────────────── │
│    Share with all fleet drivers        [toggle]│
│    Share to specific driver…  [Select ▾][Send] │
└─────────────────────────────────────────────────┘
```

---

## Upload Flow for Staging

When staff uploads a staged doc:
- A small label input appears (pre-filled from filename, editable).
- File uploads to `staging/<timestamp>.<ext>` in the `inspection-documents` bucket.
- Row inserted: `scope = 'per_driver'`, `driver_id = NULL`, `name = label`.

When staff assigns:
- Picks a driver from the inline dropdown on the card.
- Clicks "Assign" → `UPDATE inspection_documents SET driver_id = <selected_user_id>` and optionally updates `name` to a canonical slot name (free-text kept as-is).
- Card disappears from Staging and appears in that driver's Driver Docs tab.

