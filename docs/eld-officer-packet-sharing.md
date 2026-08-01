# Officer packet sharing and share-token throttling (Pass B §7/§8)

Covers the two roadside link scopes, the rate limit that sits in front of both,
what a throttled holder actually sees, and one near-miss during the build.

---

## 1. The two scopes

| scope | created by | expiry | resolved by | per-token limit | per-IP guard |
| --- | --- | --- | --- | --- | --- |
| `inspection_document` | printed QR sticker in the truck | **none, by design** | `resolve_share_token`, called directly from the browser on `/share/:token` | yes | no |
| `officer_packet` | driver emails an 8-day packet from the roadside screen | 4 hours | `resolve_officer_packet_token`, only via the `officer-packet-download` edge function | yes | in-isolate only, see §4 |

Expiry semantics were not touched. The 693 already-printed stickers have a NULL
`expires_at` and must keep resolving forever; nothing writes to `expires_at`.

## 2. The ceiling: 60 served opens per token per rolling hour

Sized against the worst *legitimate* hour, not against a guess:

| situation | opens in the worst hour |
| --- | --- |
| officer packet, 4-hour link, officer opens + re-opens + forwards to a supervisor | 4–6 |
| QR sticker at a scale house or shop: several officers, a couple of retries on a bad signal, one re-scan per document on the truck | 10–20 |
| **ceiling** | **60** |

That is roughly 3x headroom over the worst honest case. Scripted enumeration of
a leaked token exceeds it inside the first minute.

**Served opens only.** The counter matches `outcome = 'ok'`. The first shipped
version counted `outcome IN ('ok','throttled')`, which meant a client hammering
a link kept extending its own lockout and the driver could never wait it out —
a self-sustaining denial of service on a live compliance document. Throttled
attempts are still written to `share_token_access_log`; they are the abuse
record. They just do not feed the ceiling.

**Fail closed.** If the counter cannot be read, the gate refuses. An unlogged,
uncounted fetch of a driver's complete logs is not something to serve.

## 3. What a throttled holder sees

Throttled is the one outcome that is disclosed. `revoked`, `expired` and
unknown all still return nothing and render identically, so a link holder
cannot probe for existence. Throttled is different because the person who
caused it already knows the link exists, and because "no longer valid" makes an
officer at the roadside give up on a link that will work again in minutes.

- `/share/:token` (QR sticker): a yellow **"Too Many Opens"** card — the link is
  still valid, wait a few minutes and reload. Distinct from the red
  **"Document Not Found"** card.
- `officer-packet-download`: **HTTP 429** with the same wording. Everything else
  non-ok stays **404**.

## 4. The per-IP guard is not a control

`officer-packet-download` keeps an in-memory `Map` of IP → timestamps, 40
requests per 10 minutes. State the limitation rather than the number: the map
lives in one edge isolate. Isolates are short-lived, several run concurrently,
and a cold start empties it. An attacker spreading requests across isolates, or
just arriving after a recycle, is not limited at all. It is a cheap speed bump
against one hammering client and nothing more. **The real limit is the
per-token counter in the database.** It fails open deliberately: a broken
in-memory counter must never be the reason a real officer gets nothing.

`inspection_document` has no per-IP guard at all. Adding one means moving every
already-printed sticker's resolution behind an edge function. That gap is open
and recorded, not closed.

## 5. Near-miss: a live sticker token was rate-limited during the build

**What happened.** Verifying the per-token counter required 60 access rows
against a token. There is no staging copy of this database, so the probe ran
against a real `inspection_document` token — a QR sticker that is physically
stuck in a truck in service. For the few minutes the probe rows existed, that
sticker was throttled. Anyone who had scanned it in that window would have been
shown an error screen at the roadside.

**Blast radius.** One token, a few minutes, no scan recorded in the log during
the window. The probe rows were deleted immediately afterwards and the token
resolves normally.

**Why it was avoidable.** Nothing about verifying a `count(*)` predicate
required a production token. The check that mattered — that the SQL counts the
right rows over the right window — is readable from `pg_get_functiondef`.

**The constraint that came out of it.** `src/test/share-token-throttle.test.ts`
is read-only against the catalog and stays that way. It must not write to
`share_token_access_log`, `share_tokens` or `officer_packet_links`. This is not
a weaker test waiting to be upgraded in place: any behavioural test that
actually drives the counter belongs on a disposable database instance, because
running it here means denying a real roadside inspection. The header comment in
that file says the same thing so it is not "fixed" by someone reading only the
assertions.
