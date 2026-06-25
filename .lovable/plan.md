## Goal

In the PEI Queue, replace the current single "Send PEI" button + time-gated follow-up logic with a clean two-attempt flow:

- Before anything has been sent → **Send First Attempt**
- After the first send → **Send Second Attempt**
- After the second send → no send button (GFE / Open / Delete remain available)

No Final Notice button. No day-based gating — staff can fire the second attempt whenever they decide.

## Change

Single-file edit: `src/components/pei/PEIQueuePanel.tsx` — update the `actionFor(row)` helper.

| Current `status`               | Button shown            | Email kind sent |
| ------------------------------ | ----------------------- | --------------- |
| `pending`                      | **Send First Attempt**  | `initial`       |
| `sent`                         | **Send Second Attempt** | `follow_up`     |
| `follow_up_sent`               | (none)                  | —               |
| `final_notice_sent`            | (none — legacy rows)    | —               |
| `completed` / `gfe_documented` | (none)                  | —               |

- Removes the 15/25/30-day windows so the second-attempt button appears immediately after the first send.
- Drops the "Send Final Notice" UI entirely.
- GFE button, Open, and Delete actions are unchanged.
- Deadline column ("Due in Nd / Overdue") is unchanged.

## Backend / other surfaces

No backend or template changes. `sendPEIEmail(..., 'follow_up')` already stamps `status = 'follow_up_sent'` + `date_follow_up_sent`, so the button naturally disappears after the second attempt. The `final_notice` send path stays in `sendPEIEmail.ts` (now unreferenced from the queue UI) so nothing else breaks.

## Verification

1. Pending row shows **Send First Attempt**. Click → row flips to `sent` and button becomes **Send Second Attempt**.
2. Click **Send Second Attempt** → row flips to `follow_up_sent` and no send button is shown (GFE / Open / Delete still present).
3. Existing `final_notice_sent`, `completed`, and `gfe_documented` rows show no send button.

## Out of scope

- Renaming the underlying email template files.
- Auto-scheduling the second attempt.
- A third manual attempt.
