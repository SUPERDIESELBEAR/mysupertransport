# Share-link throttling: stated numbers, one correction, and the near-miss record

## 1. The numbers, and why

**Per link: 60 opens per rolling hour** (`_share_token_gate`, fails closed)

Measured against what actually happens:

```text
Officer opens a binder link, reads it, opens the PDF again      2-4
Driver re-scans after a failed read in bad signal               2-6
Shop scans the same sticker across a morning inspection         5-10
Worst realistic legitimate hour                                 ~20
Shipped ceiling                                                 60
Scripted pull of a leaked token                                 thousands
```

Roughly 3x headroom over the worst honest hour, and still orders of magnitude
below the traffic that makes a leaked token worth harvesting. Per link rather
than per document: two officers holding two different tokens for the same
driver never contend with each other.

This is the real control on both paths.

**Per IP on the officer packet: 40 per 10 minutes — a coarse in-isolate guard,
not a rate limit**

State it as what it is. The counter is an in-memory map inside one edge
isolate. Isolates are short-lived and several run concurrently, so a caller
looping the stream gets a fresh counter on every cold start and can spread
requests across isolates at the same time. It stops an accidental retry storm
from a single warm isolate — worth keeping, and free — but it does not
throttle a determined caller by source address, and nobody reading the
register should think it does.

The actual protection on the officer-packet path is the **4-hour token expiry**
and the **per-token gate behind it**, which is shared-state and does count.

Upgrade path, recorded rather than built now: a real per-IP limit needs shared
state, and `share_token_access_log` already has it — it stores `ip_hash` and
the per-token gate already counts rows in a window. A per-IP limit is the same
query keyed on `ip_hash` instead of `token`. Notable wrinkle: `ip_hash` is NULL
when the salt is unavailable (`v2_salt_unavailable`) or no IP header is present
(`no_ip`), so that variant has to decide what a NULL fingerprint means before
it can be trusted.

All of this goes into the function comments and the register entry, replacing
the current "per-IP limiting: 40/10min" phrasing.

## 2. Correction: retries must not extend the lockout

The window counts `outcome IN ('ok','throttled')`. Once a token trips, every
refresh logs another `throttled` row inside the window and holds the count at
the ceiling. An officer who refreshes twice a minute never gets back in — the
hour restarts continuously. That is the exact failure the limit was supposed
not to cause.

Change the count to `outcome = 'ok'` only. Throttled attempts are still logged
in full — the access log is the compliance record and loses nothing — they just
stop feeding the counter. A tripped token then recovers on a fixed schedule as
the successful opens age out, and a driver who waits is let back in whether or
not they kept tapping.

## 3. Throttled must not read as "Document Not Found"

Today `resolve_share_token` returns nothing for throttled, revoked, expired and
unknown alike, and the page shows one dead end. The advice differs: throttled
means *wait a few minutes*; revoked means *the driver has to send a new link*.
An officer given the wrong one of those wastes the inspection.

Add a `throttled` signal to the resolver's return and a distinct screen:

```text
Too Many Opens
This link has been opened many times in the last hour and is
temporarily paused. Wait a few minutes and open it again — the
link itself is still valid.
```

Revoked / expired / unknown keep the existing single "Document Not Found"
state. That distinction is not free: it confirms to whoever holds the URL that
the token exists and is live. Taking it anyway, because the holder must already
possess a 122-bit random UUID — guessing one is infeasible, so the confirmation
tells a realistic attacker nothing they did not already know — while the
roadside cost of an unrecoverable-looking dead end is high and immediate.

Same treatment in `officer-packet-download`: its 404 currently says "no longer
valid" for a throttled packet too. Return 429 with the wait-and-retry wording,
keep 404 for the permanent outcomes.

## 4. Record the near-miss

Add to the run doc, under a Near Misses heading rather than buried in the
throttling section:

> **Verification probe rate-limited a live binder token.** Confirming the
> per-token limit required 60 access rows against a real token, and the token
> chosen was a production `inspection_document` token — a QR sticker physically
> on a truck. For the remainder of that hour a real scan of that sticker would
> have returned "Document Not Found". The probe rows were removed by migration
> and the token was reconfirmed as resolving, but the recovery depended on
> noticing, not on anything structural.
>
> **This is why `share-token-throttle.test.ts` is read-only.** The committed
> test asserts on `pg_get_functiondef` bodies and grants rather than driving
> the limit, because driving it against this database means spending a real
> driver's quota on a real sticker. That constraint is not excess caution and
> should not be "improved" into an end-to-end test unless it runs against a
> throwaway token on a throwaway resource.

Register items added:

- The throttle has no test exercising the counting path end to end; closing it
  properly needs a seeded non-production token, not a relaxed read-only rule.
- Officer-packet per-IP protection is an in-isolate guard only; a real one
  needs `share_token_access_log` keyed on `ip_hash`.
- `inspection_document` per-IP gap stays open (unchanged).

## Technical detail

- `_share_token_gate`: count predicate to `outcome = 'ok'`; ceiling reasoning
  as a comment on `c_limit`.
- `resolve_share_token`: return the gate outcome so the client can tell
  `throttled` from the rest. The `inspection_document` row shape is unchanged
  for the `ok` path — the QR sticker flow must not change.
- `resolve_officer_packet_token`: same, so the edge function can pick 429
  versus 404.
- `InspectionSharePage.tsx`: third render state for throttled.
- `officer-packet-download/index.ts`: 429 for throttled; rewrite the per-IP
  comment to describe a coarse in-isolate guard with the shared-state upgrade
  path.
- `share-token-throttle.test.ts`: assert the counter excludes `throttled`, that
  the per-IP guard still fails open, and that `resolve_share_token` returns the
  four existing columns for a live non-expiring token. Verify the 693
  NULL-expiry tokens are untouched, as before.
- Migration touches function bodies only — no change to `share_tokens` rows, no
  change to expiry semantics.

## Not in scope

Closing the `inspection_document` per-IP gap still means moving every printed
sticker's resolution behind an edge function.
