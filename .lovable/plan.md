## Problem (confirmed against production data)

For operator `marcsmueller@gmail.com` (id `ee993ec0-…`):
- All **10 truck photos exist** in `operator_documents` (one row per slot — Front, Driver Side, Rear, Passenger Side, PS/DS Steer, PS/DS Front Drive, PS/DS Rear Drive).
- But `onboarding_status.truck_photos = 'not_started'`.

That field is what every UI reads for the substep label (`OperatorPortal.tsx` line 497):

```ts
{ label: 'Truck Photos',
  value: fmt(onboardingStatus.truck_photos ?? 'not_started'),  // ← shows "Not Started"
  status: onboardingStatus.truck_photos === 'received'
    ? 'complete'
    : uploadedDocs.some(d => d.document_type === 'truck_photos')
      ? 'in_progress'
      : 'not_started' }
```

The visual color *does* shift to gold (`in_progress`) because uploads exist, but the **text label** stays "Not Started" because nothing in the codebase ever bumps `onboarding_status.truck_photos` away from `not_started` after the guided flow finishes. Form 2290 / Truck Title / Truck Inspection rely on staff to manually mark `received`, which is fine for those single-file docs — but the Truck Photo Guide is operator-driven and has no equivalent trigger.

Staff side suffers the same thing: the operator detail panel "Truck Photos" line stays unchecked even though all 10 photos are visible in the document list.

## Fix

Two coordinated changes — one in the modal, one in the operator substep — plus a one-shot data fix for Marcus.

### 1. `src/components/operator/TruckPhotoGuideModal.tsx`

After every successful photo insert (inside `handleFileSelect`, right after `setUploaded(...)` succeeds), upsert `onboarding_status.truck_photos`:

- If staff already set it to `received`, leave it alone (don't downgrade their review).
- Otherwise, count distinct slot-keys that have rows in `operator_documents` for this operator with `document_type = 'truck_photos'`.
  - `>= 1 && < 10` → set `truck_photos = 'requested'` (means "operator has started, awaiting more / staff review")
  - `>= 10` → set `truck_photos = 'requested'` as well (still needs staff review; staff is the one who flips to `received`)
- The 10-vs-partial distinction is already visible to staff via the document count, so we don't need a separate enum value — going to `'requested'` is enough to (a) flip the operator's substep label off "Not Started" and (b) signal staff that there's review work waiting.

Also do the same upsert in `OperatorDocumentUpload.tsx` `handleUpload` for the legacy single-file truck-photos path (line 86–179) for consistency.

### 2. `src/pages/operator/OperatorPortal.tsx` (line 497)

Replace the plain `fmt(...)` value with a count-aware label so the operator gets immediate, accurate feedback **even before the DB roundtrip completes**:

```ts
{
  label: 'Truck Photos',
  value: (() => {
    if (onboardingStatus.truck_photos === 'received') return 'Reviewed';
    const n = uploadedDocs.filter(d => d.document_type === 'truck_photos').length;
    if (n === 0) return 'Not Started';
    if (n >= 10) return 'All 10 uploaded · awaiting review';
    return `${n} of 10 uploaded`;
  })(),
  status: onboardingStatus.truck_photos === 'received'
    ? 'complete'
    : uploadedDocs.some(d => d.document_type === 'truck_photos')
      ? 'in_progress'
      : 'not_started',
},
```

This means even if the `onboarding_status` upsert (#1) ever fails, the operator still sees an honest count.

### 3. One-time data backfill (migration)

For every operator who already has truck-photo rows but whose `onboarding_status.truck_photos` is still `'not_started'`, set it to `'requested'`. This unsticks Marcus and anyone else in the same boat without overwriting any staff-marked `'received'` rows:

```sql
UPDATE public.onboarding_status os
SET    truck_photos = 'requested', updated_at = now()
WHERE  os.truck_photos = 'not_started'
  AND  EXISTS (
    SELECT 1 FROM public.operator_documents od
    WHERE od.operator_id = os.operator_id
      AND od.document_type = 'truck_photos'
  );
```

## Verification

1. Reload `/dashboard` as Marcus — Stage 2 → Truck Photos row should now read **"All 10 uploaded · awaiting review"** in gold (no longer "Not Started").
2. Open Staff/Management → Marcus's detail panel → Stage 2 — same row reflects upload progress; staff still drives the final `received` flip via the existing toggle.
3. Take a fresh photo on a different test operator → the substep value updates from "Not Started" to "1 of 10 uploaded" the moment the row is inserted, even before reload.
4. After staff clicks "Truck Photos received", the substep flips to "Reviewed" / green.

## Files touched

- `src/components/operator/TruckPhotoGuideModal.tsx` (status upsert in `handleFileSelect`)
- `src/components/operator/OperatorDocumentUpload.tsx` (same upsert in legacy `handleUpload`)
- `src/pages/operator/OperatorPortal.tsx` (count-aware substep label)
- `supabase/migrations/<timestamp>_backfill_truck_photos_status.sql` (one-shot UPDATE)

No schema changes, no new tables, no edge-function deploys.
