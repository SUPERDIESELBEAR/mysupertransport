## Technical

Confirmation reads (already run): `equipment_items` shows no merge-driven deactivations in the recent window; `SerialConflictsPanel.tsx` persists dismissals only to `localStorage` key `onboard_systems_serial_conflicts_dismissed`.

New table, staged as an additive migration (applies when the draft is accepted):

```
equipment_serial_conflict_dismissals
  id uuid pk, conflict_key text unique, device_type text,
  item_ids uuid[], serial_snapshot text[],
  dismissed_by uuid -> profiles, dismissed_at timestamptz default now()
```

- GRANT SELECT, INSERT, DELETE to `authenticated`; GRANT ALL to `service_role`. RLS enabled; staff/management/owner roles via `has_role`, matching the equipment tables.
- `conflict_key` reuses the keys the panel already computes (`<device_type>:<canonicalSerial>` for confusable, `near:<type>:<sortedIds>` for near pairs), so existing logic carries over unchanged.
- `serial_snapshot` stores the two serials at decision time. On load, a dismissal whose snapshot no longer matches the current serials is ignored (and its row deleted lazily), which re-opens the pair after an edit.

`SerialConflictsPanel.tsx`:
- Replace `readDismissed`/`writeDismissed` with a fetch of dismissal rows plus insert/delete calls; keep `dismissed` as the same `Set<string>` so filtering, the Undo toast, `restoreAll`, and the hidden-count footer are untouched.
- One-time migration on mount: if the `localStorage` key still holds keys, insert them as rows (attributed to the current user), then clear the key — the 17 pairs you already reviewed on that browser carry over instead of needing a second pass.
- `guardDemo()` continues to block writes in demo mode.

No change to `mergeEquipmentItems`, the confusable/near detection, or the serial guard trigger.
