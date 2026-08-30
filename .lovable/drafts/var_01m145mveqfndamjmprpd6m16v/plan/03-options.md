# Options, with a recommendation

## Option A — Printable letterhead on the standalone disclosure PDFs (recommended start)
Add a shared letterhead component (logo + "SUPERTRANSPORT, LLC" + address + DOT/MC line) to the four standalone documents in `src/components/application/documents/`, replacing the plain-text "SUPERTRANSPORT" wordmark they print today.

- These are legal/FMCSA documents an applicant signs; carrying the carrier's legal identity is standard practice and looks professional in a compliance file.
- Low risk, self-contained, no data changes.

## Option B — Letterhead on the printed "Submitted Application" snapshot
Add the same letterhead to the top of the staff-side print (`submitted-application-print-content`) so a printed full application reads as a company document.

- Natural companion to A; same component, one insertion point.

## Option C — Online form company block
Add legal name + address under the logo on `/apply` (header and/or footer).

- Mostly cosmetic; the logo already carries the brand on-screen. Consider a small footer line instead: "SUPERTRANSPORT, LLC · 605 Madison St, Pleasant Hill, MO 64080 · USDOT 2309365 · MC 788425".

## Suggested scope
**A + B together** (both printable surfaces share one letterhead component), and optionally C's footer line. That covers everything an applicant, auditor, or officer would ever hold on paper.

## Considerations

1. **Single source of truth.** The letterhead should read legal name, address, DOT and MC from the existing `carrier_profile` record rather than re-hardcoding them — one place to update, consistent with how ELD records already snapshot carrier identity, and it keeps the door open for per-company branding later without rework. The logo stays the bundled asset for now (it never changes at runtime).
2. **Print rendering.** The logo image must be embedded as a data URL (or preloaded) in the print window, the same way signatures are handled today — otherwise some browsers print a broken image.
3. **Legal text unchanged.** The letterhead is presentation only; no disclosure wording is touched, so no re-consent or version bump of the signed documents is implied.
4. **Offline print.** Standalone docs print from staff screens (online), so reading `carrier_profile` live is fine; no offline-cache complexity needed.

## Technical notes

- New shared component, e.g. `src/components/application/documents/CompanyLetterhead.tsx`, fed by a small `carrier_profile` read (or a constants fallback if the record is unreachable, with a loud warning).
- Touch points: the four docs in `src/components/application/documents/`, `src/components/management/SubmittedApplicationSnapshot.tsx`, and optionally the footer in `src/pages/ApplicationForm.tsx`.
- No database or schema changes required — `carrier_profile` already stores everything needed.
