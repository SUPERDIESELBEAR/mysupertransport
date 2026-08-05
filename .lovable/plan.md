# Remove the "View Driver" button from Pay Setup emails

## Change
In the pay setup notification email, drop the gold **View Driver →** call-to-action button. Everything else (heading, summary table, closing line) stays exactly as it is. The closing sentence is reworded slightly so it no longer points at a button:

- Current: "Open their detail panel to review the full pay setup and send the Everee payroll link."
- New: "Open SUPERDRIVE and go to the driver's detail panel to review the full pay setup and send the Everee payroll link."

## Who receives these emails today, and why

Recipients are computed at send time:

1. Collect every user with the **owner** or **management** role.
2. Look up each of those users' notification preference for the `pay_setup_submitted` event.
3. Include a user if they explicitly turned email on. If they have no preference saved, **owners default to ON and management defaults to OFF**.
4. Resolve each included user's account email and send one copy per recipient.

So in practice only the owner (and any management user who has explicitly enabled email for this event) gets it. Onboarding staff, dispatchers, and truck owners are never included — the role filter excludes them entirely. That's why it looks like "only certain people" receive it: it is role-gated first, then preference-gated.

If the intent is for onboarding staff to receive it too, that's a separate change (add the role to the filter and decide its default) — not included here.

## Technical detail
- File: `supabase/functions/notify-pay-setup-submitted/index.ts`
- Remove the CTA argument passed to `buildEmail(...)` so no button block is rendered, and update the closing paragraph text.
- Redeploy the `notify-pay-setup-submitted` edge function.
