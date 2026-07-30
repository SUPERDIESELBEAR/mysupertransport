import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"; SHOTS.mkdir(exist_ok=True)
DATE = "2026-07-14"
DAY = {"id":"day-1","operator_id":"op-1","log_date":DATE,"record_source":"keyed","status":"certified",
 "locked":True,"is_reconstructed":False,"supersedes_day_id":None,"amendment_reason":None,
 "carrier_name":"SUPERTRANSPORT LLC","carrier_usdot":"1234567","carrier_mc":"MC-7654",
 "home_terminal_address":"100 Terminal Way, Kansas City, MO","truck_number":"4412","trailer_numbers":"T-900",
 "co_driver_name":"None","shipping_document_no":"BOL-55512","from_location":"Kansas City, MO",
 "to_location":"Des Moines, IA","total_miles_driving_today":412,"total_mileage_today":430,
 "recap_on_duty_today":"11:30","recap_last_7_days":"58:15","recap_available_tomorrow":"11:45",
 "recap_last_8_days":"62:00","total_off_duty_minutes":0,"total_sleeper_minutes":0,
 "total_driving_minutes":0,"total_on_duty_minutes":0,"source_document_path":None,"pdf_path":None,
 "certified_at":"2026-07-15T02:10:00.000Z","certification_legal_name":"Marcus A. Mueller",
 "certification_signature_path":None,"created_at":"2026-07-14T06:00:00.000Z","updated_at":"2026-07-15T02:10:00.000Z"}
EVENTS = [
 {"id":"e1","rods_day_id":"day-1","start_minute":0,"end_minute":360,"duty_status":1,"city":"Kansas City","state":"MO","remarks":None,"is_short_period":False},
 {"id":"e2","rods_day_id":"day-1","start_minute":360,"end_minute":1440,"duty_status":3,"city":"Des Moines","state":"IA","remarks":"Line haul","is_short_period":False}]
MANIFEST = {"key":"current","operator_id":"op-1","days":[{"log_date":DATE,"kind":"keyed","label":"Certified","cached":True,"renderable":True,"filename":None,"showsTotals":True}],
 "window_start":DATE,"window_end":DATE,"event":None,"built_at":"2026-07-15T02:10:00.000Z"}
META = {"key":"identity","operator_id":"op-1","driver_name":"Marcus Mueller","driver_user_id":None,
 "truck_number":"4412","carrier_name":"SUPERTRANSPORT LLC","carrier_usdot":"1234567","carrier_mc":"MC-7654",
 "home_terminal_address":"100 Terminal Way","home_terminal_timezone":"America/Chicago","updated_at":"2026-07-15T02:10:00.000Z"}

SEED = """
async ({ meta, manifest, day, events, structured }) => {
  await new Promise((res, rej) => { const r = indexedDB.deleteDatabase('superdrive_roadside'); r.onsuccess=res; r.onerror=res; r.onblocked=res; });
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('superdrive_roadside', 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('local_meta', { keyPath: 'key' });
      d.createObjectStore('roadside_manifest', { keyPath: 'key' });
      d.createObjectStore('rods_pdfs', { keyPath: 'log_date' });
      d.createObjectStore('rods_documents', { keyPath: 'log_date' });
      d.createObjectStore('notice_pdfs', { keyPath: 'event_id' });
      d.createObjectStore('signature_images', { keyPath: 'key' });
      d.createObjectStore('rods_days_cache', { keyPath: 'log_date' });
      d.createObjectStore('rods_events_cache', { keyPath: 'rods_day_id' });
      d.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
  const put = (store, val) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val); tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  await put('local_meta', meta);
  await put('roadside_manifest', manifest);
  const pdf = new TextEncoder().encode('%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>');
  await put('rods_pdfs', { log_date: day.log_date, operator_id: 'op-1', bytes: pdf.buffer, mime: 'application/pdf', uploaded: true, cached_at: new Date().toISOString() });
  if (structured) {
    await put('rods_days_cache', { log_date: day.log_date, operator_id: 'op-1', day, cached_at: new Date().toISOString() });
    await put('rods_events_cache', { rods_day_id: day.id, log_date: day.log_date, events, cached_at: new Date().toISOString() });
  }
  db.close();
}
"""

READBACK = """
async (logDate) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('superdrive_roadside'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const get = (store, key) => new Promise((res) => { const rq = db.transaction(store).objectStore(store).get(key); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(undefined); });
  const d = await get('rods_days_cache', logDate);
  const e = d ? await get('rods_events_cache', d.day.id) : undefined;
  const pdf = await get('rods_pdfs', logDate);
  db.close();
  return { day: !!d, events: !!e, pdf: !!pdf };
}
"""

async def run(engine, pw):
    browser = await getattr(pw, engine).launch(headless=True)
    ctx = await browser.new_context(viewport={"width":1280,"height":1800})
    page = await ctx.new_page()
    failures = []

    # ---- Case A: native path ----
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate(SEED, {"meta":META,"manifest":MANIFEST,"day":DAY,"events":EVENTS,"structured":True})
    pre = await page.evaluate(READBACK, DATE)
    if not (pre["day"] and pre["events"]):
        print(f"[{engine}] PRECONDITION: structured cache rows missing for {DATE} "
              f"(day={pre['day']} events={pre['events']}); hydration/seed did not run — this is NOT a renderer failure")
        await browser.close(); return ["precondition"]
    await page.goto("http://localhost:8080/roadside", wait_until="domcontentloaded")
    try:
        await page.wait_for_selector('[data-testid="roadside-native-day"]', timeout=8000)
    except Exception:
        failures.append(f"[{engine}] case A: native day never rendered")
    grid = await page.locator('[data-testid="roadside-native-grid"]').count()
    embeds = await page.locator('object, iframe, embed').count()
    body = await page.locator('body').inner_text()
    if grid != 1: failures.append(f"[{engine}] case A: expected 1 native grid, got {grid}")
    if embeds != 0: failures.append(f"[{engine}] case A: PDF viewer present ({embeds} embeds)")
    for needle in ["Total miles driving today", "RECAP", "REMARKS", "Des Moines"]:
        if needle.lower() not in body.lower(): failures.append(f"[{engine}] case A: missing '{needle}'")
    await page.screenshot(path=str(SHOTS/f"{engine}_native.png"))

    # ---- Case B: fallback path ----
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate(SEED, {"meta":META,"manifest":MANIFEST,"day":DAY,"events":EVENTS,"structured":False})
    pre = await page.evaluate(READBACK, DATE)
    if pre["day"] or pre["events"] or not pre["pdf"]:
        print(f"[{engine}] PRECONDITION: fallback fixture wrong (day={pre['day']} events={pre['events']} pdf={pre['pdf']})")
        await browser.close(); return failures + ["precondition-b"]
    await page.goto("http://localhost:8080/roadside", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    native = await page.locator('[data-testid="roadside-native-day"]').count()
    embeds = await page.locator('object, iframe, embed').count()
    openfile = await page.get_by_role("link", name="Open file").count()
    body = await page.locator('body').inner_text()
    if native != 0: failures.append(f"[{engine}] case B: native render used instead of fallback")
    if embeds < 1: failures.append(f"[{engine}] case B: no embed rendered")
    if openfile < 1: failures.append(f"[{engine}] case B: 'Open file' action not visible")
    for banned in ["older cached", "cache format", "cached format"]:
        if banned.lower() in body.lower(): failures.append(f"[{engine}] case B: officer screen shows '{banned}'")
    await page.screenshot(path=str(SHOTS/f"{engine}_fallback.png"))

    await browser.close()
    return failures

async def main():
    async with async_playwright() as pw:
        out = []
        for engine in ("chromium", "webkit"):
            out += await run(engine, pw)
        if out:
            print("FAILURES:"); [print(" -", f) for f in out]; sys.exit(1)
        print("PASS: native path renders with no PDF viewer; fallback path renders embed + Open file, no banner")

asyncio.run(main())
