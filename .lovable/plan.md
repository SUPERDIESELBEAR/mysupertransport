# Rate Confirmation Follow-Ups — Unattached Charges, PDF Viewer, Broker State, Normalization

## Issue 3 — diagnosis first (source document spinner never ends)

Confirmed by reading `RateConfirmationParser.tsx`. This is not a pdfjs failure, not a bytes problem — it is an effect-dependency bug in our own code.

The render effect lists `pdfRendering` (and `pdfPages`) in its dependency array and also sets `pdfRendering` inside itself:

1. First run: `cancelled = false`, `setPdfRendering(true)`, starts `pdfFileToImages(file)`.
2. That state change re-runs the effect. React first runs the previous cleanup, which sets `cancelled = true` for the in-flight render.
3. The second run hits the `if (pdfPages || pdfRendering) return;` guard and does nothing.
4. When the real render resolves, every callback is gated on `cancelled` — which is now `true`. So `setPdfPages` never fires and `setPdfRendering(false)` never fires.

Result: `pdfRendering` stays `true` forever and the panel shows "Rendering the document…" permanently. pdfjs actually completed; we threw the result away. The same would happen to any PDF, on any browser — it is deterministic, not file-specific.

Fix: drive the effect only from `[file, showSource]`, track the in-flight file with a ref so a re-open does not re-render an already-rendered file, and remove the self-referential state from the dependency list. Keep the error branch and the "open in new tab" fallback.

## Issues 1 and 2 — unattached rate lines

### Behavior
- The section becomes "Charges found on the document". Copy reflects reality: when there is no eligible middle stop, it says so instead of asking for a decision that cannot be made.
- Each line offers: assign to a stop (only when eligible middle stops exist), **Add to load total** (new), and Leave it out.
- "Add to load total" moves the line into a small "Additional charges" list shown with the rate fields, each removable, and immediately included in Total Load Value. For the AAA document, the $50 Extra Stop lands there and the total reads $1,050.

### Persistence — exactly what gets written
No new column in this pass. On save:
- `loads.linehaul_rate` — unchanged base ($1,000).
- `loads.fsc_amount` — unchanged.
- `loads.total_load_value` — **includes** the additional charges ($1,050). This is a plain stored numeric column written by the form, so the saved load really is worth $1,050; the number is not only prose.
- `loads.special_instructions` — gains an itemized block appended under a stable heading, e.g.
  ```text
  Additional charges (not stop-specific):
  - Extra Stop — $50.00
  ```
  Re-editing regenerates that block rather than duplicating it.

**Flag, as you asked:** the schema can hold the *amount* (via `total_load_value`) but cannot hold the *itemization* — the breakdown of what makes up the extra $50 lives only in `special_instructions` text. Nothing can machine-read it later for settlement or invoicing. If you want it structured, the deliberate addition is one migration adding `loads.other_charges_amount numeric` and `loads.other_charges_description text` (or a proper `load_charges` child table, which is the right long-term shape for the accessorials module). Say which you want and I will do it in this pass; otherwise I proceed with total + prose as above.

## Issue 4 — broker field shows the extracted name

When the parser finds a broker name that is not linked to a directory record, `BrokerSelect` shows that name in the trigger instead of the placeholder, styled as provisional (italic/muted with a "Not in directory" badge), plus a one-line hint under the field: "Found on the rate confirmation — create it or pick a match." Selecting or creating a broker clears the provisional state. Nothing is written to `broker_id` until a real record exists, and save validation is unchanged.

## Issue 5 — normalize parsed values

Parsed values run through `src/lib/textNormalize.ts` before they reach the form, inside `applyParsedToForm`:
- Facility name: underscores to spaces, whitespace collapse, then title case — `GADSDEN_WAREHOUSING_INC` becomes `Gadsden Warehousing Inc`.
- City, address line 1/2, contact name: whitespace collapse + title case.
- ZIP: `normalizeZip`. Phone: `normalizePhone`, displayed with `formatPhone`.
- State left as the two-letter code.
- The existing acronym exception in `toTitleCase` is untouched, so `US`, `NE`, `LLC` survive. A screaming-caps multi-word name with underscores is treated as a formatting artifact and normalized, which is exactly the distinction you drew.

## Technical notes

- `RateConfirmationParser.tsx`: effect dependency fix; assign dropdown gains the "add to load total" option and conditional stop options; section heading and helper copy; provisional broker name handed to the form.
- `src/lib/rateConfirmation.ts`: normalization on stop and broker fields in `applyParsedToForm`; return unattached lines unchanged.
- `src/pages/dispatch/loadFormSchema.ts`: new `additional_charges` array field (description + amount) on the form only.
- `src/lib/loadRateMath.ts`: `calcTotalLoadValue` sums `additionalCharges` for non-loadout loads; new unit tests alongside the existing stop-off tests.
- `src/pages/dispatch/CreateLoadPage.tsx`: pass additional charges into the total, render the removable list near the rate fields, append the itemized block to `special_instructions` on submit.
- `BrokerSelect.tsx`: optional `provisionalName` prop and hint.
- Verification: re-parse the real AAA Freight PDF — source panel renders inline, $50 assignable to the load total, Total Load Value $1,050, broker field shows "AAA Freight Global Inc. — not in directory", stops read Macon / Attalla / Gadsden Warehousing Inc in title case.
