import type { ReactNode } from 'react';
import { formatShortDate } from '@/lib/loadFormat';
import { FACILITY_TYPE_LABELS, type Facility, type FacilityType } from '@/lib/facilities';
import { formatPhone } from '@/lib/textNormalize';
import type { SortValue } from '@/lib/listSorting';

export interface FacilityColumnDef {
  key: string;
  label: string;
  locked?: boolean;
  defaultVisible: boolean;
  align?: 'left' | 'right';
  sortValue: (row: Facility) => SortValue;
  render: (row: Facility) => ReactNode;
  cellClassName?: string;
}

const typeLabel = (value: string | null) =>
  (value ? FACILITY_TYPE_LABELS[value as FacilityType] ?? value : '—');

export const FACILITY_COLUMNS: FacilityColumnDef[] = [
  {
    key: 'facility_name',
    label: 'Facility Name',
    locked: true,
    defaultVisible: true,
    sortValue: f => f.facility_name,
    render: f => f.facility_name,
    cellClassName: 'font-medium text-foreground',
  },
  {
    key: 'city',
    label: 'City',
    locked: true,
    defaultVisible: true,
    sortValue: f => f.city,
    render: f => f.city ?? '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'state',
    label: 'State',
    defaultVisible: true,
    sortValue: f => f.state,
    render: f => f.state ?? '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'facility_type',
    label: 'Type',
    defaultVisible: true,
    sortValue: f => f.facility_type,
    render: f => typeLabel(f.facility_type),
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'times_used',
    label: 'Times Used',
    defaultVisible: true,
    align: 'right',
    sortValue: f => f.times_used,
    render: f => f.times_used,
    cellClassName: 'text-right tabular-nums text-muted-foreground',
  },
  {
    key: 'last_used_at',
    label: 'Last Used',
    defaultVisible: true,
    align: 'right',
    sortValue: f => f.last_used_at,
    render: f => formatShortDate(f.last_used_at),
    cellClassName: 'text-right text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'contact_name',
    label: 'Contact',
    defaultVisible: true,
    sortValue: f => f.contact_name,
    render: f => f.contact_name ?? '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'address',
    label: 'Address',
    defaultVisible: false,
    sortValue: f => f.address_line1,
    render: f => [f.address_line1, f.address_line2].filter(Boolean).join(', ') || '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'zip',
    label: 'Zip',
    defaultVisible: false,
    sortValue: f => f.zip,
    render: f => f.zip ?? '—',
    cellClassName: 'text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'contact_phone',
    label: 'Phone',
    defaultVisible: false,
    sortValue: f => f.contact_phone,
    render: f => (f.contact_phone ? formatPhone(f.contact_phone) : '—'),
    cellClassName: 'text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'hours_notes',
    label: 'Hours Notes',
    defaultVisible: false,
    sortValue: f => f.hours_notes,
    render: f => f.hours_notes ?? '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'access_notes',
    label: 'Access Notes',
    defaultVisible: false,
    sortValue: f => f.access_notes,
    render: f => f.access_notes ?? '—',
    cellClassName: 'text-muted-foreground',
  },
];

export const DEFAULT_FACILITY_COLUMNS = FACILITY_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

export const FACILITY_COLUMN_TOGGLES = FACILITY_COLUMNS.map(c => ({
  key: c.key, label: c.label, locked: c.locked,
}));
