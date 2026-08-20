# Rate Confirmation Parse Failure — Diagnosis and Fix

## Problem 1 — Diagnosis (confirmed, not a guess)

I pulled the actual AI gateway request/response for your 15:50 parse of the AAA Freight Global document.

**The edge function ran, the PDF was transmitted, and the AI read the document correctly.** Nothing failed upstream:

- Function executed; no error logged.
- The PDF reached the model as a proper document part (base64 `data:application/pdf`), was accepted, and the gateway returned HTTP 200 in 10.6s (2,973 tokens in / 1,626 out).
- The model **did** extract the load: broker "AAA Freight Global Inc.", phone (833) 337-8737, load #0025412, BOL 99092859, dry van, 44,000 lbs, 216 miles, $1,000 linehaul + $50 Extra Stop = $1,050, both stops (Macon GA pickup 8/19 07:00–13:00, Attalla AL delivery 8/20 08:30), MacroPoint instructions — all at high confidence.

**The single point of failure is on our side.** The model returned its JSON wrapped in an array:

```text
[ { "broker": {...}, "load": {...}, "stops": [...] } ]
```

Our function does `JSON.parse(raw)` — which succeeds — then reads `parsed.broker`, `parsed.load`, `parsed.stops`. On an array those are all `undefined`, so every field normalizes to `null` and `stops` becomes `[]`. The function then returns HTTP 200 with a perfectly shaped, completely empty result. The UI checks only `if (!result.stops)`, and `[]` passes, so it reported success and showed "No name found".

So: not a model limitation, not a PDF-support problem, not a transmission problem. It is an unwrapping bug plus a missing empty-result guard. And yes — the silence is its own defect, exactly as you called it.

## Problem 2 — Diagnosis

The source panel uses a raw `<object data=... type="application/pdf">`. In this browser the native PDF plugin does not take over inside that element, so the fallback text shows. The project already solves this elsewhere: `src/lib/pdfToImages.ts` renders every page to an image with pdfjs-dist (the comment in that file says it exists precisely because iframe/object PDF rendering is unreliable), and `QPassportView` and `pdfToImage.ts` use the same approach. It is directly reusable here — the only change needed is accepting an already-in-memory `File`/ArrayBuffer instead of only a URL.

## Fixes

### 1. Unwrap the model response
In `parse-rate-confirmation`, after `JSON.parse`: if the result is an array, take its first object element. Also handle a single-key envelope (e.g. `{ "rate_confirmation": {...} }`) by unwrapping when the top level has exactly one object property and no `broker`/`stops` keys.

### 2. Never return a silent empty parse
After normalization, if there is no broker name, no load number, no rate and no stops, return an error status instead of 200 — "The document was read but no load data could be extracted from it." The UI already surfaces edge-function error bodies as a destructive toast, so this becomes a visible failure.

### 3. Client-side guard
In `RateConfirmationParser`, treat an all-empty result as a failure too, so a future backend shape change can never again masquerade as a successful parse. Replace the `!result.stops` check with a real emptiness check.

### 4. Diagnostic logging
Log, on the function side, the response shape (top-level type and keys) and a truncated raw content prefix when extraction comes back empty — so the next shape drift is one log line away, not an investigation.

### 5. Reference-number filter (visible in this document)
The AAA doc labels its numbers `LO`, `SI`, `SO`. The current `KEEP_REF` allowlist drops all three, so the stop reference chips would come back empty even after the parse is fixed. Add these common broker shorthand labels (`LO`, `SI`, `SO`, `PU`, `REF`, `ORDER`) to the keep list while leaving the noise filter intact.

### 6. Inline PDF viewer
Replace the `<object>` in the source panel with a pdfjs-rendered page view: render the selected File's bytes to page images with the existing pdfjs pipeline and display them in a scrollable column, with a spinner while rendering and a page count. Images keep their current direct rendering. The "open in new tab" link stays only as a last-resort fallback if pdfjs itself throws.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts`: unwrap logic, emptiness guard returning 422, shape logging, `KEEP_REF` additions. Redeploy.
- `src/lib/pdfToImages.ts`: add a sibling that accepts `File | ArrayBuffer` and shares the render loop (no change to the existing URL-based export).
- `src/components/dispatch/loadForm/RateConfirmationParser.tsx`: emptiness guard on the result, and the new pdfjs source panel.
- No schema changes, no changes to save logic, broker matching, loadout detection, or the Create Load form.
- Verification: re-parse the same AAA Freight Global PDF and confirm the broker, both stops, references and the $1,000 / $50 rate lines populate, and that the source panel renders the pages inline.
