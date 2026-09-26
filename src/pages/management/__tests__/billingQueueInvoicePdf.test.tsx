import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const invoices = [
  { id: 'i1', invoice_number: 'ST26-0001', amount: 1875, created_at: 'x', loads: { load_number: 'L1' } },
  { id: 'i2', invoice_number: 'ST26-0002', amount: 900, created_at: 'x', loads: { load_number: 'L2' } },
];
vi.mock('@/integrations/supabase/client', () => {
  const b: Record<string, unknown> = {};
  for (const k of ['select', 'order']) b[k] = () => b;
  b.limit = async () => ({ data: invoices, error: null });
  return { supabase: { from: () => b } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/billingRun', () => ({ storeInvoice: vi.fn(), gatherBillingQueue: vi.fn(async () => []) }));
vi.mock('@/lib/invoicePdf', () => ({
  fetchInvoiceFiles: vi.fn(async () => ({ i1: 'c/i1.pdf' })),
  createInvoicePdf: vi.fn(), openInvoicePdf: vi.fn(),
}));

vi.mock('@/lib/invoiceSend', () => ({
  fetchInvoiceSends: vi.fn(async () => []), fetchDefaultFactorName: vi.fn(async () => null),
  lastRealSend: () => null, sendMany: vi.fn(),
}));

import BillingQueuePage from '@/pages/management/BillingQueuePage';

describe('Billing queue PDF buttons', () => {
  it('shows Invoice PDF with a file and Create PDF without', async () => {
    render(<BillingQueuePage />);
    expect(await screen.findByRole('button', { name: 'Invoice PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeInTheDocument();
  });
});
