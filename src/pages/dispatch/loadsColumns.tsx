import type { ReactNode } from 'react';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import {
  LOAD_STATUSES, formatCurrency, formatEnumLabel, formatShortDate,
  type EquipmentType, type LoadStatus,
} from '@/lib/loadFormat';
import { enumOrderValue, type SortValue } from '@/lib/listSorting';
import type { Database } from '@/integrations/supabase/types';

export type LoadType = Database['public']['Enums']['load_type'];

export interface LoadRow {
  id: string;
  load_number: string;
  status: LoadStatus;
  equipment_type: EquipmentType | null;
  load_type: LoadType | null;
  linehaul_rate: number | null;
  total_load_value: number | null;
  loaded_miles: number | null;
  commodity: string | null;
  weight_lbs: number | null;
  created_at: string;
  operator_id: string | null;
  dispatcher_id: string | null;
  brokerName: string | null;
  driverName: string | null;
  dispatcherName: string | null;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
}

export interface LoadColumnDef {
  key: string;
  label: string;
  locked?: boolean;
  defaultVisible: boolean;
  align?: 'left' | 'right';
  /** Direct `loads` column used for server-side ordering. */
  serverField?: string;
  /** Client-side sort value (derived / joined columns). */
  sortValue: (row: LoadRow) => SortValue;
  render: (row: LoadRow) => ReactNode;
  cellClassName?: string;
}

const numberFmt = new Intl.NumberFormat('en-US');

/** "1,234" or an em dash. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return numberFmt.format(Number(value));
}

function place(city: string | null, state: string | null): string {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

export const rateOf = (l: LoadRow) => formatCurrency(l.total_load_value ?? l.linehaul_rate);

export const LOAD_COLUMNS: LoadColumnDef[] = [
  {
    key: 'load_number',
    label: 'Load #',
    locked: true,
    defaultVisible: true,
    serverField: 'load_number',
    sortValue: l => l.load_number,
    render: l => l.load_number,
    cellClassName: 'font-mono font-medium text-foreground',
  },
  {
    key: 'status',
    label: 'Status',
    locked: true,
    defaultVisible: true,
    sortValue: l => enumOrderValue(LOAD_STATUSES, l.status),
    render: l => <LoadStatusBadge status={l.status} />,
  },
  {
    key: 'broker',
    label: 'Broker',
    defaultVisible: true,
    sortValue: l => l.brokerName,
    render: l => l.brokerName ?? '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'driver',
    label: 'Driver',
    defaultVisible: true,
    sortValue: l => l.driverName,
    render: l => l.driverName ?? 'Unassigned',
    cellClassName: 'text-foreground',
  },
  {
    key: 'equipment',
    label: 'Equipment',
    defaultVisible: true,
    serverField: 'equipment_type',
    sortValue: l => l.equipment_type,
    render: l => formatEnumLabel(l.equipment_type),
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'rate',
    label: 'Rate',
    defaultVisible: true,
    align: 'right',
    serverField: 'total_load_value',
    sortValue: l => l.total_load_value ?? l.linehaul_rate,
    render: rateOf,
    cellClassName: 'text-right tabular-nums',
  },
  {
    key: 'created',
    label: 'Created',
    defaultVisible: true,
    align: 'right',
    serverField: 'created_at',
    sortValue: l => l.created_at,
    render: l => formatShortDate(l.created_at),
    cellClassName: 'text-right text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'dispatcher',
    label: 'Dispatcher',
    defaultVisible: false,
    sortValue: l => l.dispatcherName,
    render: l => l.dispatcherName ?? 'Unassigned',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'origin',
    label: 'Origin',
    defaultVisible: false,
    sortValue: l => place(l.originCity, l.originState),
    render: l => place(l.originCity, l.originState),
    cellClassName: 'text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'destination',
    label: 'Destination',
    defaultVisible: false,
    sortValue: l => place(l.destinationCity, l.destinationState),
    render: l => place(l.destinationCity, l.destinationState),
    cellClassName: 'text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'pickup_date',
    label: 'Pickup Date',
    defaultVisible: false,
    sortValue: l => l.pickupDate,
    render: l => formatShortDate(l.pickupDate),
    cellClassName: 'text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'delivery_date',
    label: 'Delivery Date',
    defaultVisible: false,
    sortValue: l => l.deliveryDate,
    render: l => formatShortDate(l.deliveryDate),
    cellClassName: 'text-muted-foreground whitespace-nowrap',
  },
  {
    key: 'loaded_miles',
    label: 'Loaded Miles',
    defaultVisible: false,
    align: 'right',
    serverField: 'loaded_miles',
    sortValue: l => l.loaded_miles,
    render: l => formatNumber(l.loaded_miles),
    cellClassName: 'text-right tabular-nums text-muted-foreground',
  },
  {
    key: 'commodity',
    label: 'Commodity',
    defaultVisible: false,
    serverField: 'commodity',
    sortValue: l => l.commodity,
    render: l => l.commodity ?? '—',
    cellClassName: 'text-muted-foreground',
  },
  {
    key: 'weight',
    label: 'Weight',
    defaultVisible: false,
    align: 'right',
    serverField: 'weight_lbs',
    sortValue: l => l.weight_lbs,
    render: l => (l.weight_lbs === null || l.weight_lbs === undefined ? '—' : `${formatNumber(l.weight_lbs)} lbs`),
    cellClassName: 'text-right tabular-nums text-muted-foreground',
  },
  {
    key: 'load_type',
    label: 'Load Type',
    defaultVisible: false,
    serverField: 'load_type',
    sortValue: l => l.load_type,
    render: l => formatEnumLabel(l.load_type),
    cellClassName: 'text-muted-foreground',
  },
];

export const DEFAULT_LOAD_COLUMNS = LOAD_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

export const LOAD_COLUMN_TOGGLES = LOAD_COLUMNS.map(c => ({ key: c.key, label: c.label, locked: c.locked }));
