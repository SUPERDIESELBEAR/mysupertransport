# Fix: "Review & Sign Sheet" email button lands on the driver Home screen

## What's wrong

The email button links to:

```text
/dashboard?view=onboard-systems&osas_token=<token>
```

`/dashboard` mounts the driver portal, and the portal immediately normalizes that URL to a real route path. That normalizer only understands the legacy `tab=` parameter — it ignores `view=`. So it treats the link as a bare portal entry and redirects the driver to `/operator/home` (or `/operator/status` if not fully onboarded). The `osas_token` stays in the address bar, but the Onboard Systems screen is never opened, so nothing reads it and the sheet never appears.

The email, the token, and the signing screen itself are all fine — only the landing/redirect step is broken.

## Proposed fix

1. Point the email button at the canonical route instead of the legacy dashboard URL:
   `/operator/onboard-systems?osas_token=<token>`
   Signed-out recipients still work: protected routes bounce to `/login?next=...` with the full path and query preserved, and login honors `next`.
2. Make the portal's URL normalizer honor `view=` (and route aliases), not just `tab=`, so any existing emails already in inboxes still resolve to the right screen instead of Home.
3. Apply the same canonical link to the staff-side "copy link" in the assignment sheet preview modal so both paths match.
4. Verify after the change that the Onboard Systems screen opens with the token-matched sheet ready to sign, both when already signed in and via the login bounce.

## Technical notes

- `supabase/functions/send-osas-to-operator/index.ts` — `signUrl` built with `buildAppUrl`.
- `src/components/equipment/SignOffSheetPreviewModal.tsx` — staff copy-link string.
- `src/pages/operator/OperatorPortal.tsx` — normalization effect that currently checks only `params.has('tab')`; reuse `getViewStateFromSearch`, which already resolves `view=` and aliases.
- `src/components/operator/OperatorOSASSign.tsx` reads `osas_token` from `window.location.search` and is unchanged.
- Side note: the `APP_URL` secret is currently set to an invalid value, so the function logs a warning and falls back to the published URL. Links work, but the secret should be corrected or removed.
