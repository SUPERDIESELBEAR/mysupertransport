import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P22/P33: dispatchers reach the SAME Billing queue from their own portal
 * navigation, and the only action on it is Issue ("Create invoice"). Payment,
 * remittance and short-pay controls are not on this page (and the database
 * refuses a dispatcher on all three anyway — proven in the pass report).
 */
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/billingRun', () => ({
  storeInvoice: vi.fn(),
  gatherBillingQueue: vi.fn(async () => [{
    loadId: 'l1', loadNumber: 'PROOF-1', brokerId: 'b1', brokerName: 'Broker', factoringStatus: 'approved',
    billingPath: 'factored', deliveredAt: '2026-09-20T12:00:00Z', missing: [],
    invoice: { amount: 1000, lines: [{ lineType: 'linehaul', description: 'Linehaul', amount: 1000, loadChargeId: null, chargeType: null }] },
  }]),
}));

import BillingQueuePage from '@/pages/management/BillingQueuePage';

describe('Billing queue for a dispatcher', () => {
  it('shows only the Issue action', async () => {
    render(<BillingQueuePage />);
    expect(await screen.findByRole('button', { name: 'Create invoice' })).toBeInTheDocument();
    const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    for (const forbidden of [/payment/i, /remittance/i, /short/i, /void/i, /close/i]) {
      expect(labels.some((l) => forbidden.test(l)), String(forbidden)).toBe(false);
    }
  });

  it('is reachable from the dispatch portal navigation', () => {
    const src = readFileSync(resolve(__dirname, '../../dispatch/DispatchPortal.tsx'), 'utf8');
    expect(src).toMatch(/label: 'Billing Queue',[^\n]*path: 'dispatch-billing-queue'/);
    expect(src).toMatch(/navigate\('\/dispatch\/billing-queue'\)/);
    expect(src).toMatch(/billingQueueRoute\s*\n\s*\? <BillingQueuePage \/>/);
  });
});
