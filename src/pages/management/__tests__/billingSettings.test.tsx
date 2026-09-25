import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const factor = {
  id: 'f1', name: 'Factor', is_default: true, send_to_emails: [] as string[], cc_emails: ['cc@x.com'],
  fee_pct: 2, packet_style: 'combined', packet_order: ['invoice', 'bol', 'pod'],
};
const settings = {
  id: 's1', remit_to_name: 'Remit', remit_to_address_1: null, remit_to_address_2: null, remit_to_city: null,
  remit_to_state: null, remit_to_zip: null, remit_to_phone: null, remit_to_email: null, payment_terms_days: 30,
};
const q = (data: unknown) => {
  const b: Record<string, unknown> = {};
  for (const k of ['select', 'order', 'limit', 'eq']) b[k] = () => b;
  b.maybeSingle = async () => ({ data, error: null });
  return b;
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => q(t === 'billing_settings' ? settings : factor) },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const auth = { isManagement: true, isOwner: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

import BillingSettingsPage, { emailProblem } from '@/pages/management/BillingSettingsPage';

describe('Billing settings screen', () => {
  beforeEach(() => { auth.isManagement = true; });

  it('email rules: invalid, duplicate, cross-list and the eleventh', () => {
    expect(emailProblem('nope', [], [])).toMatch(/not a valid/);
    expect(emailProblem('A@x.com', ['a@x.com'], [])).toMatch(/already listed/);
    expect(emailProblem('a@x.com', [], ['a@x.com'])).toMatch(/both/);
    const ten = Array.from({ length: 10 }, (_, i) => `p${i}@x.com`);
    expect(emailProblem('new@x.com', ten, [])).toMatch(/at most 10/);
    expect(emailProblem('new@x.com', [], [])).toBeNull();
  });

  it('adds and removes chips, and reorders the packet', async () => {
    render(<BillingSettingsPage />);
    const input = await screen.findByLabelText('Send invoices to address');
    fireEvent.change(input, { target: { value: 'sff@x.com' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(screen.getByText('sff@x.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove sff@x.com' }));
    expect(screen.queryByText('sff@x.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Move BOL up' }));
    expect(screen.getByText('1. BOL')).toBeInTheDocument();
  });

  it('is read-only for a dispatcher', async () => {
    auth.isManagement = false;
    render(<BillingSettingsPage />);
    await screen.findByText('cc@x.com');
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});
