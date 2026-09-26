import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const previewSend = vi.fn();
const sendInvoice = vi.fn();
vi.mock('@/lib/invoiceSend', async (orig) => ({
  ...(await orig<typeof import('@/lib/invoiceSend')>()),
  previewSend: (...a: unknown[]) => previewSend(...a),
  sendInvoice: (...a: unknown[]) => sendInvoice(...a),
}));
vi.mock('@/components/billing/PacketPreviewButton', () => ({ default: () => <button>Preview packet</button> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import SendToFactorDialog from '@/components/billing/SendToFactorDialog';
import SendToFactorButton from '@/components/billing/SendToFactorButton';
import InvoiceSendHistory from '@/components/billing/InvoiceSendHistory';
import { sendMany, SendError, lastRealSend, type InvoiceSendRow } from '@/lib/invoiceSend';

const preview = {
  dry_run: true, from: 'x', reply_to: null, to: ['sff@example.com'], cc: ['acct@example.com'],
  subject: 'Invoice ST26-0002 — B — Order - — C', text: '', packet_style: 'combined', missing: [],
  attachments: [{ name: 'ST26-0002 - ST-1.pdf', bytes: 204800 }], factor_name: 'Factor Co',
};

const row = (o: Partial<InvoiceSendRow>): InvoiceSendRow => ({
  id: 's1', invoice_id: 'i1', sent_at: '2026-09-26T15:00:00Z', sent_by: 'u1', to_emails: ['sff@example.com'],
  cc_emails: [], attachments: [{ name: 'a.pdf', bytes: 2048 }], status: 'sent', error: null, is_test: false,
  sender_name: 'Leo Wallace', ...o,
});

beforeEach(() => { previewSend.mockReset(); sendInvoice.mockReset(); });

describe('Send dialog', () => {
  it('prefills To and CC as chips with the attachment list and sizes', async () => {
    previewSend.mockResolvedValue(preview);
    render(<SendToFactorDialog open onOpenChange={() => {}} invoiceId="i1" invoiceNumber="ST26-0002" loadId="l1" factorName="Factor Co" />);
    expect(await screen.findByText('sff@example.com')).toBeInTheDocument();
    expect(screen.getByText('acct@example.com')).toBeInTheDocument();
    expect(screen.getByText('ST26-0002 - ST-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('200 KB')).toBeInTheDocument();
    expect(screen.getByText('Preview packet')).toBeInTheDocument();
  });

  it('sends the edited lists for this send only', async () => {
    previewSend.mockResolvedValue(preview);
    sendInvoice.mockResolvedValue({ status: 'sent', to: ['sff@example.com'], cc: [] });
    const onSent = vi.fn();
    render(<SendToFactorDialog open onOpenChange={() => {}} invoiceId="i1" invoiceNumber="ST26-0002" loadId="l1" factorName="Factor Co" onSent={onSent} />);
    await screen.findByText('acct@example.com');
    fireEvent.click(screen.getByLabelText('Remove acct@example.com'));
    const add = screen.getByLabelText('Add To address');
    fireEvent.change(add, { target: { value: 'Ops@Example.com' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/ }));
    await waitFor(() => expect(sendInvoice).toHaveBeenCalledWith('i1', ['sff@example.com', 'ops@example.com'], []));
    expect(onSent).toHaveBeenCalled();
  });

  it('lists the missing items and offers no send when not ready', async () => {
    previewSend.mockRejectedValue(new SendError('Not ready', 409, ['Rate confirmation']));
    render(<SendToFactorDialog open onOpenChange={() => {}} invoiceId="i1" invoiceNumber="ST26-0001" loadId="l1" factorName="Factor Co" />);
    expect(await screen.findByText('Rate confirmation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Send$/ })).toBeDisabled();
  });

  it('shows the provider error and stays open when the send fails', async () => {
    previewSend.mockResolvedValue(preview);
    sendInvoice.mockRejectedValue(new Error('Resend error [500]'));
    const onOpenChange = vi.fn();
    render(<SendToFactorDialog open onOpenChange={onOpenChange} invoiceId="i1" invoiceNumber="ST26-0002" loadId="l1" factorName="Factor Co" />);
    await screen.findByText('sff@example.com');
    fireEvent.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(await screen.findByText('Resend error [500]')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('Send button', () => {
  it('names the factor before a send', () => {
    render(<SendToFactorButton invoiceId="i1" invoiceNumber="ST26-0002" loadId="l1" factorName="Factor Co" lastSend={null} />);
    expect(screen.getByRole('button', { name: /Send to Factor Co/ })).toBeInTheDocument();
  });
  it('after a send shows "Sent … to …" and "Send again"', () => {
    render(<SendToFactorButton invoiceId="i1" invoiceNumber="ST26-0002" loadId="l1" factorName="Factor Co" lastSend={row({})} />);
    expect(screen.getByText(/Sent .* to sff@example.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send again/ })).toBeInTheDocument();
  });
  it('a test send does not count as sent', () => {
    expect(lastRealSend([row({ is_test: true }), row({ status: 'failed' })])).toBeNull();
  });
});

describe('Send selected', () => {
  it('one call per invoice, a result for each, and a failure does not stop the rest', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ status: 'sent', to: ['a@b.co'], cc: [] })
      .mockRejectedValueOnce(new Error('Not ready'))
      .mockResolvedValueOnce({ status: 'sent', to: ['a@b.co'], cc: [] });
    const r = await sendMany(['i1', 'i2', 'i3'], send);
    expect(send).toHaveBeenCalledTimes(3);
    expect(r.i1.ok).toBe(true);
    expect(r.i2).toEqual({ ok: false, error: 'Not ready' });
    expect(r.i3.ok).toBe(true);
  });
});

describe('Send history', () => {
  it('shows date, who, to and CC, attachments and status', () => {
    render(<InvoiceSendHistory rows={[
      row({ cc_emails: ['acct@example.com'] }),
      row({ id: 's2', status: 'failed', error: 'Resend error', is_test: true }),
    ]} />);
    expect(screen.getAllByText(/by Leo Wallace/)).toHaveLength(2);
    expect(screen.getByText('CC: acct@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('a.pdf (2 KB)')).toHaveLength(2);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
  it('says so when never sent', () => {
    render(<InvoiceSendHistory rows={[]} />);
    expect(screen.getByText('Not sent yet.')).toBeInTheDocument();
  });
});
