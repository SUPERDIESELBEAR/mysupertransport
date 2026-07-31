## Confirmed first

There is **no** test asserting `enqueueCertifyDay` throws on a bad `PreflightResult`. The only references to it anywhere are its own module and `docs/eld-offline-certification.md`; `src/lib/eld/offline/__tests__/` has no `certifyDay.test.ts`. Today the tripwire is unreached code guarding unreached code — a fifth instance of the standing finding, not an exception to it. That test is part of this pass.

## 1. `certifyDay.test.ts` — the tripwire, exercised

New `src/lib/eld/offline/__tests__/certifyDay.test.ts`, mocking `./store`'s `enqueue` so nothing touches Dexie. `enqueue` asserted **un-called** on every refusal — a throw that still queued would satisfy a looser test:

- missing token → throws
- `preflight` for a different `day_id` → throws (the realistic misuse: a preflight from the previously open log)
- `preflight` without `ok: true` → throws
- clean preflight → `enqueue` called once, `kind: 'certify_rods_day'`, `id` defaulting to the token, `preflight_source` / `preflight_at` carried into the payload
- same token twice → same entry id, so the enqueue is idempotent

## 2. Playwright pass, real driver UI

`/tmp/browser/rods-certify/`, one script per case, session restored via `page.evaluate` before navigating to the RODS editor. Each case seeds its own day, purges via `purge_rods_day`, and reports counts.

### (a) the original defect — with a timing assertion

Type into a header field, tap Certify with no artificial wait, and **prove the race was reached**:

- `performance.now()` captured in-page immediately after the final keystroke;
- a `page.route` handler on the `certify_rods_day` RPC records the timestamp at which the request is issued;
- assert `delta < 700ms`.

If the delta is over 700 ms the case **fails as inconclusive** — reported distinctly from a pass and from a defect. It means the debounce fired naturally and the flush had nothing pending, so the race was never exercised.

If that proves consistently unachievable, drive it differently rather than loosening the bound: pre-focus the field and dispatch the keystroke and the Certify tap in a single `page.evaluate` so no round trip sits between them; failing that, hold the debounce open with a `page.clock` fake before the tap. The assertion stays at 700 ms either way.

Then assert the certified row and the `rods_amendments` record both carry the typed value.

### (b) offline — stated for what it proves

`context.set_offline(True)`, certify. Asserts **that `certify()` stops on `'offline'` and the row stays `draft`** — the direct path refusing to certify without a reachable server. It proves nothing about the offline queue: nothing enqueues certifications today, so any "nothing was enqueued" observation is trivially true and will not be recorded as evidence the queued path works.

### (c) backgrounding — Chromium only, and labelled so

Edit a header field, dispatch `visibilitychange`/hidden and `pagehide` with no save tap and no unmount; assert the row holds the edit. Separately, edit a segment, navigate away, and confirm the dirty-flag warning appears rather than a silent write.

Reported as **verified on Chromium, unverified on iOS Safari**. A dispatched event in headless Chromium is a real event loop, real handlers, and a real fetch — materially better than jsdom — but still synthetic, and iOS Safari's `pagehide` semantics are precisely why `beforeunload` was excluded. Chromium cannot settle that.

Added to the hardware checklist in `docs/eld-offline-certification.md`, alongside the existing installed-cold-launch blockers:

> On a real iPhone, installed to the home screen: edit a header field and press Home **within the debounce window**, then reopen the app and confirm the edit persisted.

### (d) lost write

`page.route` fulfils the header `PATCH` 200 with an empty body without applying it. Assert: preflight refuses; the dialog names the field with **both** values present in the DOM (element screenshot of the differences list); **Cancel** leaves the on-screen value intact and the log uncertified; `rods_amendments` gained no row.

### (e) opposite direction

Patch the row out from under the editor by direct write, then certify. Same refusal, and the on-screen value is not overwritten by the saved one.

### (f) double-tap idempotency

Route handler does `await route.fetch()` so the server applies the certify, then aborts — the client never learns. **Before the second tap**, query the row and assert `status='certified'`, `locked=true`, `certification_token` non-null; without this precondition the case passes vacuously. After the second tap: the returned row `id` equals the day under edit (not merely "a certified row" — that is what an amendment-token bug produces), `certification_token` equals the attempt token, and the UI shows success rather than P0014.

## Reporting

Per case: pass / fail / **inconclusive**, the assertion that carried it, screenshot path, console errors, and rows purged. Any real finding that surfaces — a column name where a label belongs, P0014 on the second tap — is fixed in this pass, not noted.

## Technical notes

- Viewport `1280x1800`, headless Chromium, session written with `page.evaluate` after navigating to localhost (never `add_init_script`).
- Route handlers registered and removed per case, so none leak between cases.
- No production-code changes are planned; any that prove necessary come from a failing case.
