# Print / download format options

Two print paths exist in the app today, and they behave very differently:

**1. `printDocumentById` — used by the application snapshot now.** Clones the element into the current tab and calls `window.print()`. It works on desktop, but it is unreliable on phones and tablets: iOS Safari frequently captures the preview before the clone renders, and it inherits app screen styles, so the output looks like a web page rather than a document.

**2. `openPrintableDocument` — used by the PEI release page.** Opens a dedicated print window containing only the document plus the stylesheets, waits for images and fonts to finish loading, offers **Letter or A4**, gives the user a Save-as-PDF / Print button, and falls back to an in-tab overlay when popups are blocked (normal on mobile Safari).

## Recommendation

Move the application print to **`openPrintableDocument`**, the same path the PEI release already uses.

- Real "Save as PDF" on every platform, via the browser's own PDF engine.
- Waits for the logo and signature images — the main cause of a missing logo on a printed page.
- Paper-size choice (Letter default, A4 available).
- Works one-handed on a phone through the share sheet.
- No new dependency and no server round-trip.

## Alternatives considered

| Approach | Verdict |
|---|---|
| Browser print (`openPrintableDocument`) | **Recommended.** Zero infrastructure, native PDF quality, works offline-ish, already proven in this app. |
| Client-side PDF library (jsPDF / html2canvas) | Not recommended. Rasterizes the page, so text is not selectable or searchable, file sizes balloon, and long applications page-break badly. |
| Server-rendered PDF (headless browser in a backend function) | Best output control and lets you email a real PDF attachment or file it automatically. Heavier to build and run. Worth doing later **if** you want the application PDF attached to emails or auto-filed into the driver's binder — say the word and I will plan it as a follow-up. |

If the goal today is "staff or the applicant can hit one button and get a clean PDF," the browser path is the right answer.

## Page-quality details included in the build

- `@page` margins and a repeating footer so multi-page applications stay attributable.
- CSS page-break rules so an employer record, a signature block, or a question-and-answer pair never splits across pages.
- Print-safe colors (no gold-on-dark backgrounds that render as gray mush).
- The logo embedded as a data URL so it prints even when a print window blocks remote images.

# Considerations

1. **Single source of truth for identity.** The letterhead reads the legal name, USDOT and MC from the existing carrier record rather than being retyped in five files, with a constant fallback if the record cannot be read. One place to update, and it keeps per-company branding possible later.
2. **"Pleasant Hill, Missouri" only.** The ELD/roadside surfaces intentionally keep the full street address — federal logs require a real main-office and terminal address, so those are untouched. This change is limited to the application surfaces.
3. **Legal wording is not altered.** Moving question text into a shared copy file is a relocation, not a rewrite; every disclosure sentence stays byte-identical, so no re-consent is implied for anyone who already signed.
4. **Historical applications.** Older submissions store answers, not the wording that was on screen at the time. The printed document will show today's wording next to their stored answers. That is normal practice, but if you ever change a disclosure's wording materially, the honest fix is versioning the copy — worth flagging now, not needed today.
5. **Length.** A fully worded application will run roughly 6-10 pages instead of the current 2-3. That is the point, but staff should expect it.
6. **Logo file.** The current logo is a PNG. It will print cleanly at the header size used here; if you have an SVG or a high-resolution version, that would print sharper on a large letterhead.

## Technical notes

- New `CompanyLetterhead` component plus a shared `companyIdentity` accessor.
- New shared application copy module for question and disclosure text, consumed by the Step components and the printed document.
- Touch points: the four files in `src/components/application/documents/`, `SubmittedApplicationSnapshot.tsx`, `ApplicationReviewDrawer.tsx` (it has its own print call), and the footer in `ApplicationForm.tsx`.
- Print path switched from `printDocumentById` to `openPrintableDocument` for the application; the standalone disclosure docs get the same treatment for consistency.
- No database or schema changes.
