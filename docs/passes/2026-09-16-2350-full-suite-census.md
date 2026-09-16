# Whole-suite census, the dispatch settlement tests repaired, and the narrowed grant-parity check proved to still catch

2026-09-16, 23:40–23:50 UTC. BUILD MODE. Immutable record of one pass.

Allowed changes, and the only changes made:

- `src/test/dispatch-settlement-schema.test.ts` (repaired)
- `docs/tms-build-status.md` (dated entry)
- `docs/tms-wish-list.md` (OWNER FOLLOW-UP LIST: three VERIFICATION GAPS lines, one OWNER DECISIONS OWED line)
- this report

No migration was authored. One migration-channel call was made deliberately, as
a probe whose last statement RAISES (section (d)); it left no table, no policy
and no migration file. No app or edge-function code, and no data, was changed.

Prompt completeness: the last line received was
`END OF PROMPT. If this line is not the last thing you received, STOP and report that the prompt was truncated, quoting the last line you did receive.`
The prompt was NOT truncated.

Every command run in this pass:

```
find src -name '*.test.ts' -o -name '*.test.tsx'
npx vitest run --reporter=default --reporter=json --outputFile=/tmp/census/all.json
npx vitest run src/test/dispatch-settlement-schema.test.ts --reporter=default            (twice)
npx vitest run src/test/dispatch-settlement-schema.test.ts -t 'exactly one open rate row'
npx vitest run src/lib/__tests__/postgrestEmbeds.test.ts src/test/actor-stamp-fk.test.ts
npx vitest run src/test/accessorial-adjustment-schema.test.ts
npx tsgo -p tsconfig.app.json --noEmit
psql -At -c ...   (live catalog: columns, constraints, unique indexes, policies, carrier_profile, stamp trigger body, probe residue)
psql -At -c "BEGIN; SET LOCAL request.jwt.claims = ...; INSERT ...; ROLLBACK;"   (both fixture shapes, tried live before editing)
supabase migration channel: one DO block ending in RAISE (grant-parity probe)
cp/diff/md5sum src/test/dispatch-settlement-schema.test.ts   (snapshot and byte-restore)
```

The body of this report is the record entry written in the same pass, reproduced
here in full so that this file stands alone.


---

## 2026-09-16, 23:40 UTC — WHOLE-SUITE CENSUS, the dispatch settlement tests repaired, and the narrowed grant-parity check proved to still catch

Changes were limited to `src/test/dispatch-settlement-schema.test.ts`, this file,
`docs/tms-wish-list.md` and the pass report. No migration was authored; the one
migration-channel call in this pass was a probe whose final statement RAISES, so
nothing from it persists and no migration file was written (`ls
supabase/migrations | tail -3` unchanged; `pg_class` count for the scratch table
= 0).

### (a) The whole suite, run once, every file

Command:

```
npx vitest run --reporter=default --reporter=json --outputFile=/tmp/census/all.json
```

There is one test root: `src/`. 204 files, found with
`find src -name '*.test.ts' -o -name '*.test.tsx'`. No test directory exists
outside `src/`. Summary as printed:

```
 Test Files  4 failed | 198 passed | 2 skipped (204)
      Tests  14 failed | 1994 passed | 15 skipped (2023)
     Errors  2 errors
   Duration  388.41s
```

Both unhandled errors, verbatim and identical:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

Skip reconciliation — 15 skipped tests live in FIVE files, not two;
`Test Files ... 2 skipped` counts only files where EVERY test skipped:
`equipment-serial-guard.test.ts` (7, harness role has no EXECUTE on
`canonical_equipment_serial`), `stop-time-source-trigger.test.ts` (5, harness
role has no UPDATE on `load_stops`), `rods-live-certification.test.ts` (1),
`FacilitySelect.test.tsx` (1, quarantined), `roadsideBundle.test.ts` (1,
`RUN_BUNDLE_TESTS` not set).

Per-file results follow. Durations are per-file wall time from the JSON
reporter and overlap across workers, so they do not sum to 388.4s.

| file | tests | passed | failed | skipped | duration (s) |
| --- | --- | --- | --- | --- | --- |
| src/components/__tests__/PWAInstallBanner.test.tsx | 3 | 3 | 0 | 0 | 0.1 |
| src/components/__tests__/notificationBellChannelIsolation.test.tsx | 1 | 1 | 0 | 0 | 0.2 |
| src/components/__tests__/notificationBellSyncAlert.test.tsx | 1 | 1 | 0 | 0 | 0.3 |
| src/components/dispatch/__tests__/rateConBadgeIsolation.test.tsx | 1 | 1 | 0 | 0 | 0.1 |
| src/components/dispatch/broker/__tests__/brokerRelationshipReaders.test.tsx | 4 | 4 | 0 | 0 | 0.3 |
| src/components/dispatch/loadDetail/__tests__/detentionSection.test.tsx | 9 | 9 | 0 | 0 | 0.5 |
| src/components/dispatch/loadDetail/__tests__/loadChargesCard.test.tsx | 4 | 4 | 0 | 0 | 1.9 |
| src/components/dispatch/loadDetail/__tests__/loadReferencesCard.test.tsx | 2 | 2 | 0 | 0 | 0.8 |
| src/components/dispatch/loadDetail/__tests__/outstandingPaperwork.test.tsx | 4 | 4 | 0 | 0 | 2.0 |
| src/components/dispatch/loadDetail/__tests__/stopTimeEntry.test.tsx | 6 | 6 | 0 | 0 | 0.4 |
| src/components/dispatch/loadDetail/__tests__/stopTimePicker.test.tsx | 9 | 9 | 0 | 0 | 0.3 |
| src/components/dispatch/loadDetail/__tests__/verbatimVerificationCard.test.tsx | 6 | 6 | 0 | 0 | 0.9 |
| src/components/dispatch/loadForm/__tests__/BrokerSelect.test.tsx | 3 | 3 | 0 | 0 | 0.1 |
| src/components/dispatch/loadForm/__tests__/FacilitySelect.test.tsx | 1 | 0 | 0 | 1 | 0.0 |
| src/components/drivers/__tests__/terminationBadge.test.tsx | 3 | 3 | 0 | 0 | 0.1 |
| src/components/equipment/__tests__/SerialConflictsPanel.test.tsx | 1 | 1 | 0 | 0 | 0.3 |
| src/components/fleet/__tests__/UnitNumberPoolPanel.test.tsx | 9 | 9 | 0 | 0 | 1.3 |
| src/components/management/RequestRetakeModal.test.tsx | 1 | 1 | 0 | 0 | 3.4 |
| src/components/management/ReviewActionButton.test.tsx | 9 | 9 | 0 | 0 | 0.1 |
| src/components/management/__tests__/ApplicationInterviewNotesButton.test.tsx | 5 | 5 | 0 | 0 | 0.1 |
| src/components/operator/MySettlements/__tests__/mySettlements.test.tsx | 7 | 7 | 0 | 0 | 0.1 |
| src/components/operator/__tests__/driverCheckIn.test.tsx | 11 | 11 | 0 | 0 | 1.1 |
| src/components/operator/__tests__/driverLoadPaperwork.test.tsx | 3 | 3 | 0 | 0 | 0.1 |
| src/components/operator/__tests__/loadoutCapture.test.tsx | 7 | 7 | 0 | 0 | 1.6 |
| src/components/operator/__tests__/operatorTodayCardPay.test.tsx | 4 | 4 | 0 | 0 | 0.1 |
| src/components/operator/rods/__tests__/tapLogEntry.test.tsx | 4 | 4 | 0 | 0 | 0.7 |
| src/components/shared/__tests__/sectionErrorBoundary.test.tsx | 1 | 1 | 0 | 0 | 0.1 |
| src/hooks/__tests__/useAuth.test.tsx | 5 | 5 | 0 | 0 | 0.1 |
| src/hooks/__tests__/useViewPreferences.test.tsx | 4 | 4 | 0 | 0 | 0.5 |
| src/lib/__tests__/anchorMissBuffer.test.ts | 2 | 2 | 0 | 0 | 0.0 |
| src/lib/__tests__/binderStorage.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/__tests__/binderUpload.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/__tests__/brokerAddressPrefill.test.ts | 10 | 10 | 0 | 0 | 0.0 |
| src/lib/__tests__/brokerDuplicates.test.ts | 14 | 14 | 0 | 0 | 0.0 |
| src/lib/__tests__/buildUpdate.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/__tests__/carrierTimezone.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/__tests__/chargeEntry.test.ts | 11 | 11 | 0 | 0 | 0.3 |
| src/lib/__tests__/chargeIdentity.test.ts | 7 | 7 | 0 | 0 | 0.3 |
| src/lib/__tests__/confirmedTons.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/__tests__/deliveryInstant.test.ts | 16 | 16 | 0 | 0 | 0.3 |
| src/lib/__tests__/detentionClaims.test.ts | 12 | 12 | 0 | 0 | 0.3 |
| src/lib/__tests__/detentionExtraction.test.ts | 10 | 10 | 0 | 0 | 0.0 |
| src/lib/__tests__/detentionRoutes.test.ts | 7 | 7 | 0 | 0 | 0.0 |
| src/lib/__tests__/detentionTerms.test.ts | 12 | 12 | 0 | 0 | 0.3 |
| src/lib/__tests__/detentionTermsRoundTrip.test.ts | 4 | 4 | 0 | 0 | 0.4 |
| src/lib/__tests__/diagnosticsWritePath.test.ts | 2 | 2 | 0 | 0 | 0.4 |
| src/lib/__tests__/dispatchBoard.test.ts | 25 | 25 | 0 | 0 | 0.0 |
| src/lib/__tests__/dispatchBoardFilters.test.ts | 11 | 11 | 0 | 0 | 0.0 |
| src/lib/__tests__/dispatchSettlement.test.ts | 18 | 18 | 0 | 0 | 0.0 |
| src/lib/__tests__/dispatchSettlementRun.test.ts | 17 | 17 | 0 | 0 | 0.0 |
| src/lib/__tests__/driverLoadPay.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/__tests__/duplicateBrokerRef.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/__tests__/duplicatePlates.test.ts | 10 | 10 | 0 | 0 | 0.0 |
| src/lib/__tests__/facilityMatch.test.ts | 10 | 10 | 0 | 0 | 0.0 |
| src/lib/__tests__/fuelCardUnassignClear.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/lib/__tests__/fuelDiscountPassthroughOverride.test.ts | 7 | 7 | 0 | 0 | 0.0 |
| src/lib/__tests__/ingestVerbatimEquivalence.test.ts | 4 | 4 | 0 | 0 | 0.4 |
| src/lib/__tests__/inspectionBonus.test.ts | 8 | 8 | 0 | 0 | 0.0 |
| src/lib/__tests__/inspectionProgram.test.ts | 17 | 17 | 0 | 0 | 0.0 |
| src/lib/__tests__/invoiceBuilder.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/__tests__/listSorting.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/lib/__tests__/loadClaims.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/__tests__/loadEdit.test.ts | 17 | 17 | 0 | 0 | 0.0 |
| src/lib/__tests__/loadPaperwork.test.ts | 17 | 17 | 0 | 0 | 0.3 |
| src/lib/__tests__/loadRateMath.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/__tests__/loadReferencesRoundTrip.test.ts | 4 | 4 | 0 | 0 | 0.4 |
| src/lib/__tests__/loadTypeCarry.test.ts | 11 | 11 | 0 | 0 | 0.3 |
| src/lib/__tests__/loadoutAssessment.test.ts | 14 | 14 | 0 | 0 | 0.0 |
| src/lib/__tests__/loadoutSlots.test.ts | 11 | 11 | 0 | 0 | 0.0 |
| src/lib/__tests__/operatorHome.test.ts | 7 | 7 | 0 | 0 | 0.0 |
| src/lib/__tests__/paperworkSummary.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/lib/__tests__/parserPathWiring.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/__tests__/perTonScale.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/__tests__/postgrestEmbeds.test.ts | 6 | 4 | 2 | 0 | 0.0 |
| src/lib/__tests__/referenceReclassification.test.ts | 13 | 13 | 0 | 0 | 0.3 |
| src/lib/__tests__/remittance.test.ts | 14 | 14 | 0 | 0 | 0.0 |
| src/lib/__tests__/revisedRateCon.test.ts | 18 | 18 | 0 | 0 | 0.0 |
| src/lib/__tests__/revisionReviewHygiene.test.ts | 16 | 16 | 0 | 0 | 0.0 |
| src/lib/__tests__/settlementClaimHold.test.ts | 8 | 8 | 0 | 0 | 2.3 |
| src/lib/__tests__/settlementEngine.test.ts | 29 | 29 | 0 | 0 | 0.0 |
| src/lib/__tests__/settlementRun.test.ts | 33 | 33 | 0 | 0 | 0.0 |
| src/lib/__tests__/sharedConfidenceGate.test.ts | 7 | 7 | 0 | 0 | 0.0 |
| src/lib/__tests__/sharedPayPct.test.ts | 15 | 15 | 0 | 0 | 0.0 |
| src/lib/__tests__/sharedPayPctCallers.test.ts | 10 | 10 | 0 | 0 | 0.0 |
| src/lib/__tests__/textNormalize.test.ts | 15 | 15 | 0 | 0 | 0.0 |
| src/lib/__tests__/transcriptionDamage.test.ts | 10 | 10 | 0 | 0 | 0.0 |
| src/lib/__tests__/unitNumberPool.test.ts | 15 | 15 | 0 | 0 | 0.0 |
| src/lib/__tests__/verbatimAdopt.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/__tests__/verbatimAndReferences.test.ts | 46 | 46 | 0 | 0 | 0.2 |
| src/lib/__tests__/verbatimSourceQuotes.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/amendmentChain.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/amendmentDiff.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/buildAmendmentDraft.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/certifyPreflight.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/escalationLadder.test.ts | 27 | 27 | 0 | 0 | 0.1 |
| src/lib/eld/__tests__/escalationLedger.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/repairClockParity.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/rodsRenderParity.test.tsx | 9 | 9 | 0 | 0 | 0.3 |
| src/lib/eld/__tests__/signatureIntegrity.test.ts | 14 | 14 | 0 | 0 | 0.0 |
| src/lib/eld/__tests__/tapLog.test.ts | 13 | 13 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/certifyDay.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/classify.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/correctionRequestRejections.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/demoResetWipe.test.ts | 5 | 5 | 0 | 0 | 8.1 |
| src/lib/eld/offline/__tests__/displayCopy.test.ts | 10 | 10 | 0 | 0 | 2.1 |
| src/lib/eld/offline/__tests__/divergence.test.ts | 8 | 8 | 0 | 0 | 0.1 |
| src/lib/eld/offline/__tests__/divergenceReconcile.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/drainOrdering.test.ts | 2 | 2 | 0 | 0 | 0.1 |
| src/lib/eld/offline/__tests__/emptyEventSet.test.tsx | 10 | 10 | 0 | 0 | 0.2 |
| src/lib/eld/offline/__tests__/extensionRequestRejections.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/localDayDefaults.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/noticeDrain.test.ts | 8 | 8 | 0 | 0 | 0.1 |
| src/lib/eld/offline/__tests__/officerPacket.test.ts | 11 | 11 | 0 | 0 | 0.3 |
| src/lib/eld/offline/__tests__/parityFixtures.test.ts | 25 | 25 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/prune.test.ts | 5 | 5 | 0 | 0 | 0.1 |
| src/lib/eld/offline/__tests__/renderability.test.ts | 5 | 5 | 0 | 0 | 4.0 |
| src/lib/eld/offline/__tests__/roadsideBundle.test.ts | 1 | 0 | 0 | 1 | 0.0 |
| src/lib/eld/offline/__tests__/roadsideImportGraph.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/roadsideManifest.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/rowNotWritable.test.ts | 8 | 8 | 0 | 0 | 0.0 |
| src/lib/eld/offline/__tests__/signatureCommitGuard.test.ts | 6 | 6 | 0 | 0 | 0.1 |
| src/lib/eld/offline/queue/__tests__/kick.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/eld/offline/queue/__tests__/retryBudget.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/eld/offline/queue/__tests__/runnerKick.test.ts | 2 | 2 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/discountPassthroughVisibility.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelBucketSourceGuard.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelBuckets.test.ts | 16 | 16 | 0 | 0 | 2.2 |
| src/lib/fuel/__tests__/fuelDeductionCard.test.ts | 8 | 8 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelDiagnosis.test.ts | 8 | 8 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelDriverDetail.test.ts | 11 | 11 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelDriverPdf.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelExceptions.test.ts | 11 | 11 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelImportView.test.ts | 30 | 30 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelLocationReport.test.ts | 12 | 12 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelLocationSorting.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelPreviewDiagnosis.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/fuelStatementReconciles.test.tsx | 10 | 10 | 0 | 0 | 0.3 |
| src/lib/fuel/__tests__/fuelUnitSourceGuard.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/multiserviceCsv.test.ts | 41 | 41 | 0 | 0 | 0.1 |
| src/lib/fuel/__tests__/myFuel.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/operatorUnit.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/passthroughDriverList.test.ts | 10 | 10 | 0 | 0 | 5.6 |
| src/lib/fuel/__tests__/setUpOperatorOptions.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/fuel/__tests__/unitConflict.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/lib/operatorRoutes.test.ts | 3 | 3 | 0 | 0 | 0.0 |
| src/lib/pei/__tests__/peiCadence.test.ts | 11 | 11 | 0 | 0 | 0.0 |
| src/pages/dispatch/__tests__/brokersPage.test.tsx | 8 | 8 | 0 | 0 | 2.1 |
| src/pages/dispatch/__tests__/loadClaimSurfacing.test.tsx | 12 | 12 | 0 | 0 | 0.1 |
| src/pages/dispatch/__tests__/loadDetailOperatorAccess.test.tsx | 27 | 27 | 0 | 0 | 2.7 |
| src/pages/dispatch/__tests__/loadsRouting.test.tsx | 8 | 8 | 0 | 0 | 1.8 |
| src/pages/dispatch/__tests__/parserDiagnosticsPage.test.tsx | 1 | 1 | 0 | 0 | 0.8 |
| src/pages/dispatch/__tests__/rateConInboxDuplicates.test.tsx | 7 | 7 | 0 | 0 | 0.5 |
| src/test/accessorial-adjustment-schema.test.ts | 56 | 55 | 1 | 0 | 64.5 |
| src/test/accessorial-approval-rules.test.ts | 16 | 16 | 0 | 0 | 5.7 |
| src/test/actor-stamp-fk.test.ts | 16 | 15 | 1 | 0 | 0.6 |
| src/test/billing-schema.test.ts | 36 | 36 | 0 | 0 | 47.3 |
| src/test/binder-expiry-editor.test.ts | 9 | 9 | 0 | 0 | 0.0 |
| src/test/binder-file-size.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/test/binder-share-authorization.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/test/caller-evaluated-functions.test.ts | 3 | 3 | 0 | 0 | 5.7 |
| src/test/definer-fail-open.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/test/definer-live-catalog.test.ts | 13 | 13 | 0 | 0 | 10.2 |
| src/test/definer-search-path.test.ts | 7 | 7 | 0 | 0 | 0.3 |
| src/test/dispatch-settlement-schema.test.ts | 30 | 20 | 10 | 0 | 41.6 |
| src/test/dispatch-settlement-screen.test.tsx | 9 | 9 | 0 | 0 | 0.0 |
| src/test/driver-picker-shared.test.ts | 2 | 2 | 0 | 0 | 0.4 |
| src/test/e2e/blueGraceLoadPath.test.tsx | 6 | 6 | 0 | 0 | 0.3 |
| src/test/equipment-receipt-confirmation.test.ts | 14 | 14 | 0 | 0 | 8.4 |
| src/test/equipment-serial-guard.test.ts | 11 | 4 | 0 | 7 | 4.5 |
| src/test/equipment-sort.test.ts | 6 | 6 | 0 | 0 | 0.0 |
| src/test/example.test.ts | 1 | 1 | 0 | 0 | 0.0 |
| src/test/file-size-tier.test.ts | 5 | 5 | 0 | 0 | 0.0 |
| src/test/fuel-import-live.test.ts | 18 | 18 | 0 | 0 | 27.8 |
| src/test/function-reachability.test.ts | 4 | 4 | 0 | 0 | 11.9 |
| src/test/grant-parity-live.test.ts | 3 | 3 | 0 | 0 | 3.5 |
| src/test/inspection-bonus-settlement.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/test/invoice-dispatch-reconciliation.test.ts | 6 | 6 | 0 | 0 | 13.4 |
| src/test/load-charge-gate-order.test.ts | 4 | 4 | 0 | 0 | 8.1 |
| src/test/load-dispatcher-editing.test.ts | 9 | 9 | 0 | 0 | 0.3 |
| src/test/nav-target.test.ts | 3 | 3 | 0 | 0 | 1.1 |
| src/test/navigation-title-invariant.test.ts | 14 | 14 | 0 | 0 | 0.0 |
| src/test/notification-isolation.test.ts | 18 | 18 | 0 | 0 | 0.1 |
| src/test/notification-priority.test.ts | 2 | 2 | 0 | 0 | 0.3 |
| src/test/operator-fuel-isolation.test.ts | 7 | 7 | 0 | 0 | 9.0 |
| src/test/operator-pay-exposure.test.ts | 5 | 5 | 0 | 0 | 5.7 |
| src/test/operator-settlement-isolation.test.ts | 4 | 4 | 0 | 0 | 4.6 |
| src/test/parked-and-termination-guardrail.test.ts | 19 | 19 | 0 | 0 | 15.5 |
| src/test/payments-schema.test.ts | 13 | 13 | 0 | 0 | 18.0 |
| src/test/policy-grant-parity.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| src/test/purge-path-coverage.test.ts | 1 | 1 | 0 | 0 | 2.3 |
| src/test/resume-gate-ui.test.tsx | 4 | 4 | 0 | 0 | 0.5 |
| src/test/resume-token-reuse.test.ts | 7 | 7 | 0 | 0 | 0.0 |
| src/test/return-sheet-device-enum.test.ts | 5 | 5 | 0 | 0 | 6.8 |
| src/test/rods-live-certification.test.ts | 2 | 1 | 0 | 1 | 1.1 |
| src/test/settlement-adjustment-seam.test.ts | 15 | 15 | 0 | 0 | 0.0 |
| src/test/settlement-foundation.test.ts | 28 | 28 | 0 | 0 | 12.2 |
| src/test/share-token-throttle.test.ts | 8 | 8 | 0 | 0 | 14.9 |
| src/test/shared-pay-percentage-source-guard.test.ts | 30 | 30 | 0 | 0 | 0.0 |
| src/test/stop-time-source-trigger.test.ts | 9 | 4 | 0 | 5 | 4.5 |
| src/test/storage-bucket-limits.test.ts | 4 | 4 | 0 | 0 | 4.5 |
| src/test/sync-payload-operator-id.test.ts | 9 | 9 | 0 | 0 | 0.3 |
| src/test/tenancy-helper-ambiguity.test.ts | 7 | 7 | 0 | 0 | 0.0 |
| src/test/tenancy-resolver.test.ts | 122 | 122 | 0 | 0 | 381.9 |
| src/test/view-reachability.test.ts | 4 | 4 | 0 | 0 | 0.0 |
| **TOTAL (204 files)** | **2023** | **1994** | **14** | **15** | **388.4 wall** |

### (b) Every failing file: first assertion, cause, origin, and whether it is a real defect

**1. `src/test/dispatch-settlement-schema.test.ts` — 10 failures. STALE TEST. Repaired in this pass (section (c)).**

First failing assertion, verbatim:

```
AssertionError: expected [ …(25) ] to deeply equal [ …(24) ]
 ❯ dispatch settlement — tables and columns > dispatch_settlements carries the
   money columns, the rates as applied, and attribution
```

Cause: B5 part two (2026-09-15) added `company_id uuid NOT NULL` to every
dispatch settlement table, re-scoped the payee/period unique key from the table
constraint `dispatch_settlements_payee_period_key` to the unique index
`dispatch_settlements_company_payee_period_uniq`, and attached
`stamp_tenant_company_id()`; restrictive-batch 1 (2026-09-16 2300 UTC) added a
`tenant_isolation` RESTRICTIVE policy to three of the tables. Most recent pass
report naming the file: `docs/passes/2026-09-16-2300-restrictive-batch-1.md`
(also named in `docs/passes/2026-09-16-1920-restrictive-policy-precheck.md`).

**2. `src/lib/__tests__/postgrestEmbeds.test.ts` — 2 failures. GUARD LIMITATION in both cases, NOT an app defect. No pass report has ever named this file.**

```
AssertionError: expected [ Array(1) ] to deeply equal []
+   "supabase/functions/_shared/tenancy.ts:42 — no .from() root found:
     .select('company_id'). Hoist the column list to a module-level const, or
     extend the resolver."
```

Cause: the ambiguity pass (2026-09-16 2226 UTC) rewrote
`supabase/functions/_shared/tenancy.ts` (committed 22:11 UTC) and its new
`.select('company_id')` has no `.from()` root the static resolver can follow.

```
AssertionError: expected [ …(5) ] to deeply equal []
+   "src/components/management/InterviewNotesPanel.tsx:78 — audit_log.application_id does not exist. …"
+   "… audit_log.author_id does not exist. …"
+   "… audit_log.author_name does not exist. …"
+   "… audit_log.body does not exist. …"
+   "… audit_log.edited_at does not exist. …"
```

Cause: a FALSE POSITIVE. `InterviewNotesPanel.tsx` line 24-25 hides its root in a
helper — `const notesTable = () => (supabase as unknown as {...}).from('application_interview_notes')`
— so the scanner attributes the select to the nearest preceding `.from()`, which
is `audit_log`. All five columns exist:
`psql -c "select column_name from information_schema.columns where table_name='application_interview_notes'"`
returns `application_id author_id author_name body created_at edited_at id updated_at`.
The file dates from 2026-09-14 (`483ea4107`). The screen is not broken; the
guard's resolver is. Deliberately left failing — repairing it was outside this
pass's allowed changes.

**3. `src/test/actor-stamp-fk.test.ts` — 1 failure. REAL, but in NEVER-APPLIED DRAFT SQL.**

```
AssertionError: use current_profile_id(), not auth.uid(): expected [ …(9) ] to deeply equal []
+   "updated_by = auth.uid()\n    WHERE id = _cycle_id\n    RETURNING * INTO v_cycle",  (×9)
```

Cause: `stagedMigrationSql()` reads `.lovable/drafts/*/migrations/*.sql`. Exactly
one such file exists —
`.lovable/drafts/var_01m289esxfeqxb6s6b4g81wr1p/migrations/20260911140000_quarterly_inspection_program.sql`
(authored 2026-09-11, `85f1c4a5d`; present in the drafts tree again as of
2026-09-16 22:03) — and it stamps `updated_by = auth.uid()` on
`public.inspection_cycles`. The live functions are checked by the same file and
PASS: this is unapplied draft SQL that would stamp an auth uid into a
`profiles(id)` column if it were ever applied. This is the FOURTH recorded
occurrence of draft-area SQL affecting a check. Named in
`docs/passes/2026-09-16-2300-restrictive-batch-1.md`.

**4. `src/test/accessorial-adjustment-schema.test.ts` — 1 failure. TRANSIENT INFRASTRUCTURE, not a defect.**

```
Error: Command failed: psql -At -c SELECT coalesce(a.grantee::regrole::text,'PUBLIC') …
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" (44.238.118.41), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret check timed out
```

Re-run alone in this pass: `56 passed (56)`. The pooler timeout is the same
`EAUTHQUERY` class recorded on 2026-09-15 — and the record's rule stands: the
label is not a licence to dismiss, so it was re-run rather than explained away.
No pass report has named this file before.

### (c) The repair, and only this repair

The ten failing tests, one line each, BEFORE the edit:

1. `dispatch_settlements` column list — 24 expected vs 25 live.
2. `dispatch_settlement_line_items` column list — `company_id` missing from the expectation.
3. Named CHECK/UNIQUE list — `dispatch_settlements_payee_period_key` no longer exists.
4. Policy check — `management`/`owner` wording not found on every policy row.
5. `dispatch_settlement_rates_history` column list — `company_id` missing from the expectation.
6. `period_month` must be the first of a month — refused earlier, by the stamp trigger.
7. Second settlement for the same payee and month is refused — same.
8. A payee other than the dispatch company is refused — same.
9. A `load_base` line without a load is refused — same.
10. An excluded charge with no reason is refused — same.

What changed:

- **(a) Column lists.** `company_id` added to the three expectations, each with a
  comment naming B5 part two (2026-09-15) and saying it is tenancy, not money.
- **The re-scoped key.** The dead constraint name was removed from the list and
  replaced by a NEW test asserting the live index:
  `dispatch_settlements_company_payee_period_uniq` is `UNIQUE` on
  `(company_id, payee_key, period_month)`. The rule "one payee, one month" is
  asserted, not dropped.
- **The policy check** now reads `permissive = 'PERMISSIVE'` only, with the
  reason in a comment: a RESTRICTIVE policy grants nothing — it can only
  subtract rows — so it is not a role-admission clause. The restrictive shape is
  asserted in `tenancy-resolver.test.ts`.
- **(b) Fixture inserts.** They now write the way a real service-role writer
  writes: `SET LOCAL request.jwt.claims = '{"role":"service_role"}'` plus an
  EXPLICIT `company_id` read from `carrier_profile`'s single row
  (`(SELECT id FROM public.carrier_profile)`). Chosen over borrowing a staff
  member's JWT because these are schema tests and must not depend on one
  person's `company_members` row surviving. `stamp_company_from_recipient`'s
  sibling `stamp_tenant_company_id()` accepts exactly this shape:
  `IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN RETURN NEW`.
  Both alternatives were tried live first; both reached the intended
  `dispatch_settlements_period_month_first_check`.
- No amount, percentage or arithmetic expectation was altered.

After: `Test Files 1 passed (1) / Tests 31 passed (31)` (30 original + the new
index test). One earlier run failed only on the same transient `EAUTHQUERY`.

**(c) The money expectation still bites.** `'5.00|2.00|2026-01-01|open'` was
changed to `'7.00|...'` and the single test run:

```
- "7.00|2.00|2026-01-01|open"
+ "5.00|2.00|2026-01-01|open"
 ❯ src/test/dispatch-settlement-schema.test.ts:277:18
 Test Files  1 failed (1)
```

Restored from a byte snapshot; `diff` empty, `md5sum` identical on both copies
(`91a1c9b54a6b31a2b2028cd94d412721`).

### (d) The narrowed `grant_parity_report()` still catches a missing grant

Batch 1 narrowed the function to `p.polpermissive`. `psql` cannot prove this —
`ERROR: permission denied for schema public` on `CREATE TABLE` — so the probe ran
**through the migration channel, labelled as such**, as one `DO` block whose last
statement RAISES. Output verbatim:

```
ERROR:  P0001: GRANT-PARITY PROBE RESULT
--- permissive policy only:
_zz_parity_probe | authenticated | INSERT | policy "probe_insert" admits authenticated for INSERT but the role holds no INSERT grant
--- after adding a RESTRICTIVE policy:
_zz_parity_probe | authenticated | INSERT | policy "probe_insert" admits authenticated for INSERT but the role holds no INSERT grant
DELIBERATE ABORT: nothing from this probe persists.
```

A permissive policy with no matching grant IS reported; adding a restrictive
policy on the same table adds NO row. Nothing persists: `select count(*) from
pg_class where relname='_zz_parity_probe'` → `0`; `select count(*) from
pg_policies where policyname in ('probe_insert','probe_restrictive')` → `0`; no
new file in `supabase/migrations`.

### (e) How a failing file that no pass names gets noticed — options, not built

Costs are measured, from section (a).

1. **Every pass runs the whole suite.** 6.5 min wall (388.4s) per pass, plus
   re-runs for `EAUTHQUERY` flakes. Catches everything, immediately. Most
   expensive per pass and the only option that cannot drift.
2. **Nightly full run.** 6.5 min once a day, zero per-pass cost. Up to 24h of
   blindness, and it needs somewhere to report to — there is no CI runner in the
   record.
3. **Touched-table rule: a pass must run every file whose text names a table it
   touched.** Cheap for a narrow pass, but for a tenancy pass touching 25 tables
   it approaches the full suite anyway (`tenancy-resolver.test.ts` alone is
   381.9s / 6.4 min, so the "cheap" version is not cheap).
4. **A cheap DB-free subset on every pass, full suite weekly.** The 195 files
   that need no `PGHOST` total well under a minute; the four slowest live-catalog
   files (`tenancy-resolver` 381.9s, `accessorial-adjustment-schema` 64.5s,
   `dispatch-settlement-schema` 41.6s, and the ELD/RODS live files) are what
   makes a run 6.5 minutes.

Recommendation, for the owner to accept or refuse: **1**. The three failures
found today had sat unnamed by any pass report, and two of them were introduced
by passes that ran only their own named suites.

### (f) Verification

- `npx tsgo -p tsconfig.app.json --noEmit` — clean. (Bare `npx tsgo --noEmit`
  compiles nothing; recorded 2026-09-15.)
- Re-runs this pass: `dispatch-settlement-schema` 31/31,
  `accessorial-adjustment-schema` 56/56, `postgrestEmbeds` + `actor-stamp-fk`
  19 passed / 3 failed (unchanged and deliberately not fixed).
- Still failing after this pass, by design: `postgrestEmbeds.test.ts` (2) and
  `actor-stamp-fk.test.ts` (1). Both listed under VERIFICATION GAPS in
  `docs/tms-wish-list.md`.
