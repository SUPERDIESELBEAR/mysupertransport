import type { ReactNode } from 'react';
import { formatShortDate } from '@/lib/loadFormat';
import { FACTORING_STATUS_LABELS, type Broker } from '@/lib/brokers';
import { formatPhone } from '@/lib/textNormalize';
import type { SortValue } from '@/lib/listSorting';

export interface BrokerColumnDef {
  key: string;
  label: string;
  locked?: boolean;
  defaultVisible: boolean;
  align?: 'left' | 'right';
  sortValue: (row: Broker) => SortValue;
  render: (row: Broker) => ReactNode;
  cellClassName?: string;
}

const muted = 'text-muted-foreground';

export const BROKER_COLUMNS: BrokerColumnDef[] = [
  {
    key: 'company_name',
    label: 'Company Name',
    locked: true,
    defaultVisible: true,
    sortValue: b => b.company_name,
    render: b => (
      <span className="flex items-center gap-2">
        <span>{b.company_name}</span>
        {b.do_not_load && (
          <span className="text-[10px] uppercase tracking-wide rounded bg-destructive/12 px-1.5 py-0.5 text-destructive">
            Do Not Load
          </span>
        )}
        {!b.is_active && (
          <span className="text-[10px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            Inactive
          </span>
        )}
      </span>
    ),
    cellClassName: 'font-medium text-foreground',
  },
  {
    key: 'mc_number',
    label: 'MC Number',
    defaultVisible: true,
    sortValue: b => b.mc_number,
    render: b => b.mc_number ?? '—',
    cellClassName: `${muted} whitespace-nowrap`,
  },
  {
    key: 'city',
    label: 'City',
    defaultVisible: true,
    sortValue: b => b.city,
    render: b => b.city ?? '—',
    cellClassName: muted,
  },
  {
    key: 'state',
    label: 'State',
    defaultVisible: true,
    sortValue: b => b.state,
    render: b => b.state ?? '—',
    cellClassName: muted,
  },
  {
    key: 'factoring_status',
    label: 'Factoring',
    defaultVisible: true,
    sortValue: b => b.factoring_status,
    render: b => (b.factoring_status ? FACTORING_STATUS_LABELS[b.factoring_status] : '—'),
    cellClassName: `${muted} whitespace-nowrap`,
  },
  {
    key: 'payment_terms',
    label: 'Payment Terms',
    defaultVisible: true,
    sortValue: b => b.payment_terms,
    render: b => b.payment_terms ?? '—',
    cellClassName: muted,
  },
  {
    key: 'load_count',
    label: 'Loads',
    defaultVisible: true,
    align: 'right',
    sortValue: b => b.load_count,
    render: b => b.load_count,
    cellClassName: 'text-right tabular-nums text-muted-foreground',
  },
  {
    key: 'dot_number',
    label: 'DOT Number',
    defaultVisible: false,
    sortValue: b => b.dot_number,
    render: b => b.dot_number ?? '—',
    cellClassName: `${muted} whitespace-nowrap`,
  },
  {
    key: 'primary_contact_name',
    label: 'Contact',
    defaultVisible: false,
    sortValue: b => b.primary_contact_name,
    render: b => b.primary_contact_name ?? '—',
    cellClassName: muted,
  },
  {
    key: 'primary_contact_email',
    label: 'Contact Email',
    defaultVisible: false,
    sortValue: b => b.primary_contact_email,
    render: b => b.primary_contact_email ?? '—',
    cellClassName: muted,
  },
  {
    key: 'primary_contact_phone',
    label: 'Contact Phone',
    defaultVisible: false,
    sortValue: b => b.primary_contact_phone,
    render: b => (b.primary_contact_phone ? formatPhone(b.primary_contact_phone) : '—'),
    cellClassName: `${muted} whitespace-nowrap`,
  },
  {
    key: 'billing_email',
    label: 'Billing Email',
    defaultVisible: false,
    sortValue: b => b.billing_email,
    render: b => b.billing_email ?? '—',
    cellClassName: muted,
  },
  {
    key: 'address',
    label: 'Address',
    defaultVisible: false,
    sortValue: b => b.address_line1,
    render: b => [b.address_line1, b.address_line2, b.zip].filter(Boolean).join(', ') || '—',
    cellClassName: muted,
  },
  {
    key: 'avg_days_to_pay',
    label: 'Avg Days to Pay',
    defaultVisible: false,
    align: 'right',
    sortValue: b => b.avg_days_to_pay,
    render: b => b.avg_days_to_pay ?? '—',
    cellClassName: 'text-right tabular-nums text-muted-foreground',
  },
  {
    key: 'do_not_load',
    label: 'Do Not Load',
    defaultVisible: false,
    sortValue: b => (b.do_not_load ? 1 : 0),
    render: b => (b.do_not_load ? (b.do_not_load_reason ?? 'Yes') : '—'),
    cellClassName: muted,
  },
  {
    key: 'rating',
    label: 'Rating',
    defaultVisible: true,
    align: 'right',
    sortValue: b => b.rating,
    render: b => (b.rating ? `${b.rating}/5` : '—'),
    cellClassName: 'text-right tabular-nums text-muted-foreground',
  },
  {
    key: 'carrier_packet_completed',
    label: 'Carrier Packet',
    defaultVisible: false,
    sortValue: b => (b.carrier_packet_completed ? 1 : 0),
    render: b => (b.carrier_packet_completed
      ? `Completed${formatShortDate(b.carrier_packet_completed_at) !== '—' ? ` ${formatShortDate(b.carrier_packet_completed_at)}` : ''}`
      : 'Not completed'),
    cellClassName: `${muted} whitespace-nowrap`,
  },
  {
    key: 'broker_agreement_signed',
    label: 'Agreement',
    defaultVisible: false,
    sortValue: b => (b.broker_agreement_signed ? 1 : 0),
    render: b => (b.broker_agreement_signed
      ? `Signed${formatShortDate(b.broker_agreement_signed_at) !== '—' ? ` ${formatShortDate(b.broker_agreement_signed_at)}` : ''}`
      : 'Not signed'),
    cellClassName: `${muted} whitespace-nowrap`,
  },
  {
    key: 'created_at',
    label: 'Created',
    defaultVisible: false,
    align: 'right',
    sortValue: b => b.created_at,
    render: b => formatShortDate(b.created_at),
    cellClassName: `text-right ${muted} whitespace-nowrap`,
  },
];

export const DEFAULT_BROKER_COLUMNS = BROKER_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

export const BROKER_COLUMN_TOGGLES = BROKER_COLUMNS.map(c => ({
  key: c.key, label: c.label, locked: c.locked,
}));
