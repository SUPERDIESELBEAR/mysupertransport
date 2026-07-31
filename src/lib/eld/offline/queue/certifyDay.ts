/**
 * The only way to queue a certification.
 *
 * A queued certification replays hours later against a row nobody is looking
 * at, so the structural guard cannot run at replay time — it has to have run
 * before the driver signed, on the copy the queue will actually certify. That
 * obligation is recorded in docs/eld-offline-certification.md (AC-3).
 *
 * `preflight` is required, and required at runtime as well as in the types: a
 * future caller reaching for `enqueue({ kind: 'certify_rods_day' })` directly
 * is the failure this file exists to make impossible.
 *
 * Type-only import of PreflightResult — this module must not pull the Supabase
 * client into /roadside's import graph.
 */
import type { PreflightResult } from '@/lib/eld/certifyPreflight';
import type { AmendmentChange } from '@/lib/eld/amendmentDiff';
import { enqueue } from './store';
import type { SyncQueueEntry } from './types';

export interface CertifyDayPayload extends Record<string, unknown> {
  day_id: string;
  legal_name: string;
  signature_path: string;
  pdf_path: string;
  device_info: string;
  /** Idempotency token. One per certification ATTEMPT SET, never regenerated on retry. */
  token: string;
  /** Empty for an original log; one row per changed field for a correction. */
  changes: AmendmentChange[];
}

export async function enqueueCertifyDay(input: {
  payload: CertifyDayPayload;
  preflight: PreflightResult;
  depends_on?: string[];
  /** Defaults to the certification token, which makes the enqueue idempotent. */
  id?: string;
}): Promise<SyncQueueEntry> {
  const { payload, preflight } = input;
  if (!payload.token) {
    throw new Error('A certification cannot be queued without an idempotency token.');
  }
  if (!preflight?.ok || preflight.day_id !== payload.day_id) {
    throw new Error(
      'A certification cannot be queued without a preflight check of the same log. '
      + 'See docs/eld-offline-certification.md (AC-3).',
    );
  }
  return enqueue({
    id: input.id ?? payload.token,
    kind: 'certify_rods_day',
    payload: { ...payload, preflight_source: preflight.source, preflight_at: preflight.checked_at },
    depends_on: input.depends_on ?? [],
  });
}