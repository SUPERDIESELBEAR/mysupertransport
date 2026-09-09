import { describe, expect, it } from 'vitest';
import { buildDisplayRows } from '../fuelImportView';
import {
  diagnoseUnmatched, disagreementMessages, unmatchedReasonMessage,
} from '../fuelDiagnosis';
import type { FuelPreviewRow } from '../fuelImport';

/**
 * MODULE 6 — THE PREVIEW SAYS WHY, using the SAME diagnosis as the review queue.
 *
 * The preview is the decision point: "commit this, or fix something first?" is
 * the question the explanation answers. These tests assert PARITY — the preview
 * row carries exactly what `diagnoseUnmatched` and `disagreementMessages`
 * need, and produces the identical sentence a committed transaction would.
 */

const previewRow = (patch: Partial<FuelPreviewRow>): FuelPreviewRow => ({
  invoice_no: 'INV-1', invoice_date: '2026-09-01', card_no: '224',
  unit_no: '260', driver_name: 'Ali Mohamed', merchant_name: null, total_amount: 100,
  duplicate: false, operator_id: null, match_status: 'matched',
  disagreement_fields: [], reconciliation_ok: true, reconciliation_delta: 0,
  ...patch,
});

const ALI_WINDOW = [{ operatorName: 'Ali Mohamed', assignedAt: '2026-09-07', returnedAt: null }];

describe('preview row diagnosis', () => {
  it('carries the operator and the disagreeing fields the diagnosis needs', () => {
    const [row] = buildDisplayRows([previewRow({
      operator_id: 'op-1',
      match_status: 'matched_with_disagreement',
      disagreement_fields: [{ field: 'unit_no', csv_value: '263', system_value: '000' }],
    })], []);
    expect(row.operator_id).toBe('op-1');
    expect(row.disagreement_fields).toHaveLength(1);
  });

  it('an unmatched preview row shows the same reason the review queue would', () => {
    const [row] = buildDisplayRows(
      [previewRow({ match_status: 'unmatched', card_no: '224', invoice_date: '2026-09-01' })],
      [],
    );
    const preview = unmatchedReasonMessage(
      row.card_no, row.invoice_date,
      diagnoseUnmatched(true, ALI_WINDOW, row.invoice_date),
    );
    const queue = unmatchedReasonMessage(
      '224', '2026-09-01', diagnoseUnmatched(true, ALI_WINDOW, '2026-09-01'),
    );
    expect(preview).toBe(queue);
    expect(preview).toBe(
      'Card 224 is assigned to Ali Mohamed from 09/07/2026. '
      + 'This transaction is dated 09/01/2026, before that assignment began.',
    );
  });

  it('a disagreeing preview row names every field with the source of ours', () => {
    const [row] = buildDisplayRows([previewRow({
      operator_id: 'op-1',
      match_status: 'matched_with_disagreement',
      disagreement_fields: [
        { field: 'unit_no', csv_value: '263', system_value: '000' },
        { field: 'driver_name', csv_value: 'Robert Francis', system_value: 'TWEET FLEET' },
      ],
    })], []);
    expect(disagreementMessages(row.disagreement_fields, {
      onboardingUnit: '000', operatorUnit: '263',
    })).toEqual([
      'Unit: file says 263, SUPERDRIVE says 000 (from onboarding record).',
      'Driver: file says Robert Francis, SUPERDRIVE says TWEET FLEET (from profile).',
    ]);
  });

  it('a matched row has nothing to explain', () => {
    const [row] = buildDisplayRows([previewRow({ match_status: 'matched' })], []);
    expect(row.match_status).toBe('matched');
    expect(row.disagreement_fields).toEqual([]);
    expect(disagreementMessages(row.disagreement_fields, null)).toEqual([]);
  });
});
