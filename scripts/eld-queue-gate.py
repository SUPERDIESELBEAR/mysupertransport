"""
ELD queue gate — Playwright cases (l), (i), (k).

Runs the REAL modules in a real browser against real IndexedDB. Modules are
pulled in through the Vite dev server's module graph (`import('/src/...')`), so
nothing has to be exported onto `window` and no test-only code ships.

Every Supabase call these cases make is intercepted at the network layer and
fulfilled locally. That is deliberate: all three cases are about what the
DEVICE does on failure paths, and none of them may mutate live compliance rows
to find out.

  (l) Queue-side replay      — a 504 on certify, then a replayed success.
                               Server keeps the FIRST attempt's paths; the
                               second attempt's uploads are deleted, and a path
                               that IS on the returned row is never deleted.
  (i) Coalescing in_flight   — a header edit issued while the upsert is on the
                               wire must not overtake it.
  (k) Render failure         — a malformed signature must not orphan bytes and
                               must not advance the lock.
  (k2) Signature refusal     — blank and malformed signatures are refused
                               BEFORE the render, in a real browser where the
                               pixel pass actually runs, and commitCertification
                               refuses blank bytes even when handed a passing
                               validation result for them.
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"; SHOTS.mkdir(exist_ok=True)
BASE = "http://localhost:8080"
DATE = "2026-07-21"
DAY_ID = "11111111-1111-4111-8111-111111111111"
OP_ID = "22222222-2222-4222-8222-222222222222"

# Paths the FIRST attempt uploaded and which the certified row therefore keeps.
LIVE_SIG = f"{OP_ID}/{DATE}/signature-1000.png"
LIVE_PDF = f"{OP_ID}/{DATE}/log-1000.pdf"
# Paths THIS (second) attempt uploaded. Orphans once the replay returns.
SENT_SIG = f"{OP_ID}/{DATE}/signature-2000.png"
SENT_PDF = f"{OP_ID}/{DATE}/log-2000.pdf"

RESET = """
async () => {
  await new Promise((res) => { const r = indexedDB.deleteDatabase('superdrive_roadside');
    r.onsuccess=res; r.onerror=res; r.onblocked=res; });
}
"""

# ---------------------------------------------------------------- case (l)
CASE_L = """
async (a) => {
  const store = await import('/src/lib/eld/offline/queue/store.ts');
  const runner = await import('/src/lib/eld/offline/queue/runner.ts');
  const { roadsideDb } = await import('/src/lib/eld/offline/db.ts');

  const entry = await store.enqueue({
    kind: 'certify_rods_day',
    payload: {
      day_id: a.dayId, legal_name: 'Marcus A. Mueller',
      signature_path: a.sentSig, pdf_path: a.sentPdf,
      device_info: 'harness', token: a.token, changes: [],
    },
  });

  // First drain hits the 504 the route serves; second gets the replay.
  await runner.drainQueue({ force: true });
  const afterFail = await store.getEntry(entry.id);
  // Clear the backoff so the retry is observable without waiting it out.
  await roadsideDb.sync_queue.update(entry.id, { next_attempt_at: new Date(0).toISOString() });
  await runner.drainQueue({ force: true });
  const afterReplay = await store.getEntry(entry.id);

  const cached = await roadsideDb.rods_days_cache.get(a.logDate);
  return {
    firstStatus: afterFail?.status, firstClass: afterFail?.last_error_class,
    firstAttempts: afterFail?.attempts,
    finalStatus: afterReplay?.status,
    cachedPdfPath: cached?.day?.pdf_path ?? null,
    cachedSigPath: cached?.day?.certification_signature_path ?? null,
  };
}
"""

# ---------------------------------------------------------------- case (i)
CASE_I = """
async (a) => {
  const store = await import('/src/lib/eld/offline/queue/store.ts');
  const runner = await import('/src/lib/eld/offline/queue/runner.ts');

  const key = `save_draft_day:${a.logDate}`;
  const first = await store.enqueueCoalesced({
    kind: 'save_draft_day', coalesce_key: key,
    payload: { operator_id: a.opId, log_date: a.logDate, day_id: a.dayId, version: 1 },
  });
  // Put it on the wire and leave it there: the route holds the response open
  // until the test releases it, so the second edit lands during in_flight.
  await store.markInFlight(first.id);
  const second = await store.enqueueCoalesced({
    kind: 'save_draft_day', coalesce_key: key,
    payload: { operator_id: a.opId, log_date: a.logDate, day_id: a.dayId, version: 2 },
  });

  const sameEntry = second.id === first.id;
  const dependsOnInFlight = (second.depends_on ?? []).includes(first.id);

  // While the first is still in_flight the second must not be picked up.
  const dueWhileInFlight = (await store.dueEntries()).map((e) => e.id);
  const blocked = !dueWhileInFlight.includes(second.id);

  await store.markSucceeded(first.id);
  const resolved = (await store.resolveBlocked()).map((e) => e.id);
  const dueAfter = (await store.dueEntries()).map((e) => e.id);

  return {
    sameEntry, dependsOnInFlight, blocked,
    releasedAfterFirst: dueAfter.includes(second.id) || resolved.includes(second.id),
    secondVersion: second.payload.version,
  };
}
"""

# ---------------------------------------------------------------- case (k)
CASE_K = """
async (a) => {
  const { renderRodsDay } = await import('/src/lib/eld/renderRodsDay.ts');
  const { roadsideDb } = await import('/src/lib/eld/offline/db.ts');
  const store = await import('/src/lib/eld/offline/queue/store.ts');
  const { putCachedDay } = await import('/src/lib/eld/offline/cache.ts');

  const day = {
    id: a.dayId, operator_id: a.opId, log_date: a.logDate, record_source: 'keyed',
    status: 'draft', locked: false, is_reconstructed: false,
    supersedes_day_id: null, amendment_reason: null,
    carrier_name: 'SUPERTRANSPORT LLC', carrier_usdot: '1234567', carrier_mc: 'MC-7654',
    home_terminal_address: '100 Terminal Way', truck_number: '4412', trailer_numbers: null,
    co_driver_name: null, shipping_document_no: null, from_location: null, to_location: null,
    total_miles_driving_today: 0, total_mileage_today: 0,
    recap_on_duty_today: null, recap_last_7_days: null,
    recap_available_tomorrow: null, recap_last_8_days: null,
    total_off_duty_minutes: 1440, total_sleeper_minutes: 0,
    total_driving_minutes: 0, total_on_duty_minutes: 0,
    source_document_path: null, pdf_path: null,
    certified_at: null, certification_legal_name: null,
    certification_signature_path: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await putCachedDay({
    day, operator_id: a.opId, log_date: a.logDate, unsynced: true, version: 1,
    local_certified_at: null, sync_rejected: false, sync_stalled: false,
  });

  const queuedBefore = (await store.allEntries()).map((e) => e.id);
  const results = {};
  for (const [label, sig] of Object.entries(a.signatures)) {
    let threw = null, size = null;
    try {
      const blob = await renderRodsDay({
        day, events: [], driverName: 'Marcus Mueller', signatureDataUrl: sig,
      });
      size = blob.size;
    } catch (e) { threw = String(e && e.message ? e.message : e); }
    results[label] = { threw, size };
  }

  const after = await roadsideDb.rods_days_cache.get(a.logDate);
  const sigRows = await roadsideDb.signature_images.toArray();
  const pdfRows = await roadsideDb.rods_pdfs.toArray();
  // Only entries this case produced. (l) and (i) leave their own behind.
  const queued = (await store.allEntries())
    .filter((e) => !queuedBefore.includes(e.id)).map((e) => e.kind);
  return {
    results,
    lockedAfter: !!after?.day?.locked,
    localCertifiedAfter: after?.local_certified_at ?? null,
    signatureRows: sigRows.length,
    pdfRows: pdfRows.length,
    queued,
  };
}
"""

# --------------------------------------------------------------- case (k2)
# (k) proved the RENDERER survives a bad signature. That leaves the worse
# outcome it exposed: a clean PDF with a blank signature line, certified. The
# validator has to refuse those bytes before the render, in a real browser —
# jsdom has no canvas, so the pixel pass only ever runs for real here.
CASE_K2 = """
async (a) => {
  const { validateSignatureImage, sha256Hex } =
    await import('/src/lib/eld/signatureIntegrity.ts');
  const { commitCertification } = await import('/src/lib/eld/offline/commitCertification.ts');
  const { roadsideDb } = await import('/src/lib/eld/offline/db.ts');
  const store = await import('/src/lib/eld/offline/queue/store.ts');

  function canvasPng(draw) {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0D0D0D';
    draw(ctx);
    return c.toDataURL('image/png');
  }

  // What a signature pad exports when the driver touches nothing.
  const blank = canvasPng(() => {});
  // A single tap: real ink, not a signature.
  const speck = canvasPng((ctx) => { ctx.beginPath(); ctx.arc(300, 100, 2, 0, 7); ctx.stroke(); });
  // A name written across the pad.
  const signed = canvasPng((ctx) => {
    ctx.beginPath();
    for (let x = 40; x < 560; x += 4) {
      ctx.lineTo(x, 100 + Math.sin(x / 9) * 34 + Math.sin(x / 2.3) * 9);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 150); ctx.lineTo(560, 150); ctx.stroke();
  });

  const cases = Object.assign({ blank, speck, signed }, a.signatures);
  const validations = {};
  for (const [label, sig] of Object.entries(cases)) {
    let v = null, threw = null;
    try { v = await validateSignatureImage(sig); }
    catch (e) { threw = String(e && e.message ? e.message : e); }
    validations[label] = { threw, ok: v ? v.ok : null, mode: v ? v.mode : null,
                           reason: v ? v.reason ?? null : null,
                           inkPixels: v ? v.ink_pixels ?? null : null };
  }

  // And the commit edge refuses the blank one even if a caller ignores the
  // validator and hands it a hand-built passing result.
  const day = {
    id: a.dayId, operator_id: a.opId, log_date: a.logDate, record_source: 'keyed',
    status: 'draft', locked: false, is_reconstructed: false,
    supersedes_day_id: null, amendment_reason: null,
    total_off_duty_minutes: 1440, total_sleeper_minutes: 0,
    total_driving_minutes: 0, total_on_duty_minutes: 0,
    source_document_path: null, pdf_path: null, certified_at: null,
    certification_legal_name: null, certification_signature_path: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const queuedBefore = (await store.allEntries()).map((e) => e.id);
  const forged = {
    ok: true, mode: 'pixel', ink_pixels: 4000, ink_fraction: 0.06, byte_length: 900,
    digest: await sha256Hex(blank), checked_at: new Date().toISOString(),
  };
  let commitRefused = null;
  try {
    await commitCertification({
      operatorId: a.opId, logDate: a.logDate, day, events: [],
      legalName: 'Marcus Mueller', signatureDataUrl: blank,
      pdfBytes: new ArrayBuffer(8), signaturePath: 'x.png', pdfPath: 'x.pdf',
      deviceInfo: 'gate', token: 'gate-tok', changes: [],
      signatureValidation: forged,
    });
  } catch (e) { commitRefused = String(e && e.message ? e.message : e); }

  const after = await roadsideDb.rods_days_cache.get(a.logDate);
  return {
    validations,
    commitRefused,
    lockedAfter: !!after?.day?.locked,
    localCertifiedAfter: after?.local_certified_at ?? null,
    signatureRows: (await roadsideDb.signature_images.toArray()).length,
    pdfRows: (await roadsideDb.rods_pdfs.toArray()).length,
    queued: (await store.allEntries())
      .filter((e) => !queuedBefore.includes(e.id)).map((e) => e.kind),
  };
}
"""


async def main():
    failures, notes = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        rpc_calls = {"n": 0}
        storage_removes = []
        upsert_bodies = []
        release_upsert = asyncio.Event()

        async def route_rpc(route):
            rpc_calls["n"] += 1
            if rpc_calls["n"] == 1:
                await route.fulfill(status=504, content_type="text/plain",
                                    body="Gateway Time-out")
                return
            # Replay: the office already holds the FIRST attempt's certification.
            await route.fulfill(status=200, content_type="application/json", body=json.dumps([{
                "id": DAY_ID, "operator_id": OP_ID, "log_date": DATE, "status": "certified",
                "locked": True, "replayed": True,
                "pdf_path": LIVE_PDF, "certification_signature_path": LIVE_SIG,
                "certified_at": "2026-07-22T02:10:00.000Z",
                "certification_legal_name": "Marcus A. Mueller",
            }]))

        async def route_storage_remove(route):
            req = route.request
            if req.method == "DELETE":
                try:
                    storage_removes.append(json.loads(req.post_data or "{}"))
                except Exception:
                    storage_removes.append({"raw": req.post_data})
                await route.fulfill(status=200, content_type="application/json", body="[]")
                return
            await route.fulfill(status=200, content_type="application/json", body="[]")

        async def route_days_upsert(route):
            upsert_bodies.append(route.request.post_data)
            await release_upsert.wait()
            await route.fulfill(status=200, content_type="application/json", body="[]")

        await page.route("**/rest/v1/rpc/certify_rods_day*", route_rpc)
        await page.route("**/storage/v1/object/rods**", route_storage_remove)
        await page.route("**/rest/v1/rods_days*", route_days_upsert)

        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.evaluate(RESET)
        await page.reload(wait_until="domcontentloaded")

        # ---- (l) ----
        l = await page.evaluate(CASE_L, {
            "dayId": DAY_ID, "logDate": DATE, "token": "tok-harness-l",
            "sentSig": SENT_SIG, "sentPdf": SENT_PDF,
        })
        print("(l)", json.dumps(l, indent=2))
        print("(l) storage removes:", json.dumps(storage_removes))
        if l["firstStatus"] not in ("pending", "retrying"):
            failures.append(f"(l) 504 should leave the entry retryable, got {l['firstStatus']}")
        if l["firstClass"] not in ("network", "server"):
            failures.append(f"(l) 504 misclassified as {l['firstClass']}")
        if l["finalStatus"] != "succeeded":
            failures.append(f"(l) replay did not succeed, status {l['finalStatus']}")
        removed = [p for body in storage_removes for p in (body.get("prefixes") or [])]
        if SENT_SIG not in removed or SENT_PDF not in removed:
            failures.append(f"(l) second-attempt uploads not deleted: {removed}")
        if LIVE_SIG in removed or LIVE_PDF in removed:
            failures.append(f"(l) DELETED A PATH ON THE CERTIFIED ROW: {removed}")
        if l["cachedPdfPath"] != LIVE_PDF or l["cachedSigPath"] != LIVE_SIG:
            failures.append("(l) cache did not adopt the certified row's paths")

        # ---- (i) ----
        i = await page.evaluate(CASE_I, {"dayId": DAY_ID, "opId": OP_ID, "logDate": DATE})
        print("(i)", json.dumps(i, indent=2))
        if i["sameEntry"]:
            failures.append("(i) in-flight entry was overwritten in place")
        if not i["dependsOnInFlight"]:
            failures.append("(i) later edit does not depend on the in-flight entry")
        if not i["blocked"]:
            failures.append("(i) later edit was drainable while the earlier one was on the wire")
        if not i["releasedAfterFirst"]:
            failures.append("(i) later edit never released after the first succeeded")
        if i["secondVersion"] != 2:
            failures.append("(i) later edit lost its payload")
        release_upsert.set()

        # ---- (k) ----
        k = await page.evaluate(CASE_K, {
            "dayId": DAY_ID, "opId": OP_ID, "logDate": DATE,
            "signatures": {
                "not_a_data_url": "https://example.com/sig.png",
                "wrong_mime": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
                "truncated_png": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
                "garbage_base64": "data:image/png;base64,!!!!not-base64!!!!",
                "empty": "",
            },
        })
        print("(k)", json.dumps(k, indent=2))
        for label, r in k["results"].items():
            if r["threw"]:
                failures.append(f"(k) render threw on {label}: {r['threw']}")
            elif not r["size"]:
                failures.append(f"(k) render produced no bytes for {label}")
        if k["lockedAfter"] or k["localCertifiedAfter"]:
            failures.append("(k) a failed signature advanced the lock")
        if k["signatureRows"] or k["pdfRows"]:
            failures.append(f"(k) orphan bytes left behind: sig={k['signatureRows']} pdf={k['pdfRows']}")
        if k["queued"]:
            failures.append(f"(k) render enqueued work before the lock: {k['queued']}")
        if not all(r["size"] == list(k["results"].values())[0]["size"] for r in k["results"].values()):
            notes.append("(k) signature variants produced differing byte counts — one embedded")

        # ---- (k2) the refusal that keeps a blank line off a certified log ----
        k2 = await page.evaluate(CASE_K2, {
            "dayId": DAY_ID, "opId": OP_ID, "logDate": DATE,
            "signatures": {
                "not_a_data_url": "https://example.com/sig.png",
                "wrong_mime": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
                "truncated_png": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
                "garbage_base64": "data:image/png;base64,!!!!not-base64!!!!",
                "empty": "",
            },
        })
        print("(k2)", json.dumps(k2, indent=2))
        must_refuse = ["blank", "speck", "not_a_data_url", "wrong_mime",
                       "truncated_png", "garbage_base64", "empty"]
        for label in must_refuse:
            v = k2["validations"][label]
            if v["threw"]:
                failures.append(f"(k2) validator threw on {label}: {v['threw']}")
            elif v["ok"]:
                failures.append(f"(k2) validator ACCEPTED {label} — "
                                f"a certified log could carry a blank signature line")
        signed = k2["validations"]["signed"]
        if not signed["ok"]:
            failures.append(f"(k2) validator refused a real signature: {signed['reason']}")
        elif signed["mode"] != "pixel":
            failures.append("(k2) real browser fell back to structural — the pixel pass "
                            "never ran, so nothing here tested it")
        if not k2["commitRefused"]:
            failures.append("(k2) commitCertification accepted a forged validation for blank bytes")
        if k2["lockedAfter"] or k2["localCertifiedAfter"]:
            failures.append("(k2) the refused certification still advanced the lock")
        if k2["signatureRows"] or k2["pdfRows"] or k2["queued"]:
            failures.append(f"(k2) refusal left state behind: sig={k2['signatureRows']} "
                            f"pdf={k2['pdfRows']} queued={k2['queued']}")

        await page.screenshot(path=str(SHOTS / "eld_queue_gate.png"))
        await browser.close()

    for n in notes: print("NOTE:", n)
    if failures:
        print("FAILURES:"); [print(" -", f) for f in failures]; sys.exit(1)
    print("PASS: (l) replay deletes only this attempt's uploads; "
          "(i) in-flight edit ordering preserved; (k) bad signature degrades without lock or "
          "orphans; (k2) blank and malformed signatures refused before the render")

asyncio.run(main())
