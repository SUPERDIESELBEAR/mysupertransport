# Path-coverage audit: which checks are create-path-only

No code changes. This is the list you asked for, from reading the call sites.

## Your three specific questions

**Region resolution — now on both.** `resolveFieldRegion` is reached only through
`verifyVerbatim`, which is reached only through `verifyParsedVerbatim`. Until this
change the revision modal imported neither, so region resolution was create-only.
It now runs on both paths through the same shared entry point.

**Text-layer extraction — now on both, same story.** `textLayerFor` was imported by
the parser only; the modal now imports it and gets the layer through
`verifyParsedVerbatim`. Before this change the revision screen never opened the PDF's
text layer at all, so it had no arbiter to judge a capture against.

**Anchor miss log — neither path reads it. This is the third one.**
`recordAnchorMiss` fires from `verifyVerbatim`, so both paths now *write* to it. But
`anchorMisses()` has no caller anywhere in `src/` outside `verbatimAndReferences.test.ts`.
It is a module-level in-memory array: never rendered, never persisted, never logged, and
cleared on page reload. Its stated purpose — surfacing an unrecognised printed heading so
the anchor set can be grown — is not served on any path, including create. Same shape as
`saveLoadReferences` before it had a caller, except this one is a read-side gap.

## Other checks that are still create-path-only

These are real create-only gaps, listed so you have the full set rather than finding
them one at a time.

1. **Duplicate broker-reference detection.** `runDuplicateCheck` /
   `DuplicateBrokerRefDialog` are wired in `CreateLoadPage` only, and the save-time
   backstop is explicitly `if (!isEdit)`. A revised document that changes
   `broker_reference_number` is an accepted diff row with no duplicate check — the
   modal touches that field only to pass it to `checkDocumentIdentity`.
2. **Facility directory matching.** `matchFacilities` runs in the parser and
   `StopsSection`. `revisedRateCon` imports `facilityMatch` only for
   `normalizeAddressKey` / `normalizeZipKey`, which are used for stop reconciliation.
   An added stop applied from a revision carries facility text with no directory
   suggestion and no `facility_id` link.
3. **Broker address prefill and provenance note.** `brokerAddressPrefill` is imported
   by the parser only. A revised document carrying a corrected remit-to address updates
   nothing in the broker directory and records no provenance line.
4. **Broker candidate matching / create-broker flow.** `BrokerCandidateRow` and
   `BrokerDialog` (which carries `brokerDuplicates`) are parser-side only. The revision
   path cannot resolve or create a broker.

## Checks confirmed present on both paths

Parser contract warning (`parserContractWarning`, both at line ~181 and ~210),
verbatim damage detection and repair (`VerbatimRepairField`, `withRepairedCapture`),
verification persistence (`saveVerbatimVerification`), reference writes
(`saveLoadReferences`), page rendering for repair (`pdfToImages`, via the repair field).

## One read-side gap worth naming

Nothing reads `loads.verbatim_verification` or the reference rows back out on
`LoadDetailPage` / `loadDetail.ts`. Both are written correctly and displayed nowhere,
so a verdict or a repaired span is invisible once the review screen closes.

## Suggested order if you want these closed

Anchor-miss surfacing first (it is the diagnostic that tells you when a new broker
template needs an anchor), then duplicate broker-reference on the revision path
(it can create a wrong-load condition), then facility matching, then the read-side
display. Awaiting your call — nothing here is being changed yet.
