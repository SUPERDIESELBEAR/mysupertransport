import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  isDeliveryInstantMissing,
  MISSING_DELIVERY_INSTANT_EXPLANATION,
  MISSING_DELIVERY_INSTANT_LABEL,
} from '@/lib/deliveryInstant';
import {
  AWAITING_SCALE_TICKET_EXPLANATION, AWAITING_SCALE_TICKET_LABEL, isAwaitingScaleTicket,
} from '@/lib/perTonScale';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import LoadClaimIndicator from '@/components/dispatch/LoadClaimIndicator';
import {
  LOAD_STATUSES, formatCurrency, formatEnumLabel, formatShortDate,
  type EquipmentType, type LoadStatus,
} from '@/lib/loadFormat';
import { enumOrderValue, type SortValue } from '@/lib/listSorting';
import type { ActiveClaimSummary } from '@/lib/loadClaims';
import type { Database } from '@/integrations/supabase/types';

export type LoadType = Database['public']['Enums']['load_type'];

export interface LoadRow {
  id: string;
  load_number: string;
  status: LoadStatus;
  equipment_type: EquipmentType | null;
  load_type: LoadType | null;
  linehaul_rate: number | null;
  rate_type: string | null;
  /** Scale-ticket tons. Null on a delivered per-ton load means it cannot pay. */
  confirmed_tons: number | null;
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
  /** The settlement-bearing delivery instant, or null when never recorded. */
  delivered_at: string | null;
  /** Active claim summary, if the load has at least one active claim. */
  activeClaim: ActiveClaimSummary | null;
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
    render: l => (
      <span className="inline-flex items-center gap-1.5">
        <LoadStatusBadge status={l.status} />
        {l.activeClaim && (
          <LoadClaimIndicator
            level={l.activeClaim.level}
            claimType={l.activeClaim.claimType}
            title={l.activeClaim.title}
          />
        )}
      </span>
    ),
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
    render: l => (
      <span className="inline-flex items-center justify-end gap-1">
        {rateOf(l)}
        {isAwaitingScaleTicket(l) && (
          <span title={AWAITING_SCALE_TICKET_EXPLANATION} className="inline-flex">
            <AlertTriangle
              className="h-3.5 w-3.5 text-warning"
              aria-label={AWAITING_SCALE_TICKET_LABEL}
            />
          </span>
        )}
      </span>
    ),
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
    key: 'delivered',
    label: 'Delivered',
    defaultVisible: true,
    align: 'right',
    serverField: 'delivered_at',
    sortValue: l => l.delivered_at,
    render: l => (l.delivered_at
      ? formatShortDate(l.delivered_at)
      : isDeliveryInstantMissing(l)
        ? (
          <span
            className="inline-flex items-center gap-1 text-warning"
            title={MISSING_DELIVERY_INSTANT_EXPLANATION}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {MISSING_DELIVERY_INSTANT_LABEL}
          </span>
        )
        : '—'),
    cellClassName: 'text-right text-muted-foreground whitespace-nowrap',
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
