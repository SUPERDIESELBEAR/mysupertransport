## Revision: the RPC change ships in two migrations with the client between them

Approved and unchanged: named `structural` mode replacing the flag; `signature_validation` on the cached row and in the certify payload; the alert with server-side coalescing on `eld_sync_alerts.occurrences`; `commitCertification` requiring a `SignatureValidation` with digest binding and a staleness bound; digest-only re-checking so the pixel pass runs once; `renderRodsDay` untouched; fail-fast before the render; the ordering comment naming case (k); case (k) extended.

## 1. Validator — `src/lib/eld/signatureIntegrity.ts`

`validateSignatureImage(dataUrl)` → `SignatureValidation`:

```ts
{
  ok: boolean;
  mode: 'pixel' | 'structural';
  reason?: string;
  ink_pixels?: number;
  ink_fraction?: number;
  byte_length: number;
  digest: string;          // SHA-256 of the data URL, hex
  checked_at: string;
}
```

Steps 1–2 (shape, base64 + PNG magic, floor size) always run. Step 3 decodes to a bitmap, counts `alpha > 16`, and requires both an absolute pixel count and a fraction of the canvas. Where `createImageBitmap` or a 2D context is unavailable, `mode: 'structural'` — the ink check did not run, and the record will say so.

## 2. `commitCertification` takes the result

`CommitCertificationInput` gains a required `signatureValidation`, mirroring `enqueueCertifyDay`'s required `PreflightResult`. Before the transaction, no pixel work:

1. `ok !== true` → throw.
2. Binding: SHA-256 of `input.signatureDataUrl` must equal `signatureValidation.digest`, with `byte_length` as the cheap pre-check. A stale or foreign result is refused.
3. `checked_at` within a short window of now.

`RodsDayEditor.certify()` validates once before `renderRodsDay`, refuses with *"Your signature didn't save. Please sign again."*, and threads the same result through.

## 3. Structural mode is recorded, counted, reported

- `signature_validation` on the cached day and in the certify queue payload: `mode`, ink numbers when present, `checked_at`.
- New `SyncAlertKind` `signature_validated_structurally_only`, raised post-transaction (same flush discipline as `certified_day_no_segments`) whenever `mode === 'structural'`. `eld_sync_alerts` coalesces on the condition and carries `occurrences` / `last_seen_at` — verified against the table — so the office gets one row per operator with a count, and the dedupe cannot be reset by a cache clear the way a device-local "already told them" flag could.

## 4. The RPC, in two migrations — the ordering hazard is real

You're right, and it is worse here than with `purge_rods_day`: those entries sit in drivers' queues, some offline, and a missing-signature failure classifies `server` and burns attempt budget rather than waiting for the new bundle.

**Migration 1 (now).**
- `ALTER TABLE public.rods_days ADD COLUMN certification_signature_validation jsonb;`
- `CREATE` the new signature `certify_rods_day(_day_id uuid, _legal_name text, _signature_path text, _pdf_path text, _device_info text, p_certification_token uuid, p_changes jsonb, p_signature_validation jsonb DEFAULT NULL)`, `SECURITY DEFINER`, `search_path` pinned, grants applied to match the existing seven-argument form.
- **Leave the seven-argument form in place.** It resolves for in-flight callers and records no validation — correct for a client that never computed one. Its body is otherwise unchanged.

Overload resolution is unambiguous in practice because every client call is positional with a fixed arity, and the pattern already exists in the catalog (`search_audit_log` and `submit_pei_response` both carry transitional pairs).

**Then deploy the client**, passing the eighth argument.

**Migration 2 (later, on the trigger).** `DROP FUNCTION public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb);`

## 5. Guard and register for the interim

- Add `public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb)` to the definer-catalog guard's allowlist with an inline comment naming the removal trigger and pointing at `docs/deferred-removals.md`. The guard's "allowlist may only shrink" assertion and its `MAX` constants are updated by one, so the entry has to be deliberately removed rather than drifting. The guard stays green and stays strict.
- New entry in `docs/deferred-removals.md` alongside the `purge_rods_day` overload and the `classifyError` string fallback: what the old signature is, why it survives the deploy gap, and the trigger.

**Removal trigger, stated concretely:** no `certify_rods_day` queue entry predating the client deploy can still drain — i.e. the new bundle is live and every `rods_days` row certified after the deploy timestamp carries a non-null `certification_signature_validation`, with no seven-argument calls observed for a full drain window (the offline budget's outer bound). Confirmed by query before Migration 2.

## 6. Tests

- `signatureIntegrity.test.ts` — the five malformed inputs from (k) plus a genuinely blank canvas export refused; a real stroked PNG passing in `pixel` mode; stubbed-out `createImageBitmap` yielding `mode: 'structural'` with `ok: true`; digest stability.
- `commitCertification` — throws on a failing result, a mismatched digest, a stale `checked_at`; in each case writes no `signature_images`/`rods_pdfs` row and no queue entry; raises the structural alert exactly once, post-transaction.
- `scripts/eld-queue-gate.py` case (k) extended: `commitCertification` with a blank signature throws, leaves `local_certified_at` null, writes no bytes, enqueues nothing.
- `definer-live-catalog.test.ts` re-run after Migration 1, with the interim allowlist entry.

## 7. Register

Run C addendum in `docs/eld-certification-playwright-run.md`: the finding resolved by validation at the commit edge and why the renderer was left alone; the structural-mode policy and why it is recorded, counted and alerted rather than silently permitted; the result-passing contract and its binding check; the two-migration sequencing and the reasoning above; and what (k) proved beyond its assertions — zero orphan bytes as evidence of render-before-write ordering, now pinned by comment and by the extended case.
