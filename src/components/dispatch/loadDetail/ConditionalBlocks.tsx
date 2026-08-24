import { Badge } from '@/components/ui/badge';
import { DetailSection, Field, FieldGrid } from './DetailPrimitives';
import { formatCurrency } from '@/lib/loadFormat';
import {
  DERIVED_USE_WINDOW_NOTE, describeDayCount, formatUseWindow,
} from '@/lib/loadoutUseWindow';

import { formatDateTime, formatNumber, type LoadDetail } from '@/lib/loadDetail';

const yn = (v: boolean | null) => (v ? 'Yes' : 'No');
const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');

export function ReeferBlock({ load }: { load: LoadDetail }) {
  if (load.equipment_type !== 'reefer') return null;
  return (
    <DetailSection title="Reefer Requirements">
      <FieldGrid>
        <Field
          label="Required Temperature"
          value={load.reefer_temp_f === null ? '—' : `${formatNumber(load.reefer_temp_f)}°F`}
        />
        <Field
          label="Temperature Range"
          value={
            load.reefer_temp_min_f === null && load.reefer_temp_max_f === null
              ? '—'
              : `${formatNumber(load.reefer_temp_min_f)}°F – ${formatNumber(load.reefer_temp_max_f)}°F`
          }
        />
        <Field label="Pre-Cool Required" value={yn(load.reefer_precool_required)} />
        <Field label="Continuous Run" value={yn(load.reefer_continuous_run)} />
        <Field
          label="Driver Acknowledged"
          value={load.reefer_acknowledged_at ? formatDateTime(load.reefer_acknowledged_at) : 'Not acknowledged'}
        />
        {load.reefer_notes ? (
          <Field label="Reefer Notes" value={load.reefer_notes} className="sm:col-span-2 lg:col-span-3" />
        ) : null}
      </FieldGrid>
    </DetailSection>
  );
}

export function LoadoutBlock({ load }: { load: LoadDetail }) {
  if (load.load_type !== 'loadout') return null;
  return (
    <DetailSection title="Trailer Relocation Details">
      <FieldGrid>
        <Field label="Trailer Owner" value={dash(load.loadout_trailer_owner_company)} />
        <Field label="Owner Contact" value={dash(load.loadout_trailer_owner_contact)} />
        <Field label="Trailer #" value={dash(load.loadout_trailer_number)} />
        <Field label="Trailer VIN" value={dash(load.loadout_trailer_vin)} />
        <Field label="Trailer Type" value={dash(load.loadout_trailer_type)} />
        <Field label="Relocation Pay" value={formatCurrency(load.loadout_relocation_fee)} />
        {/*
          One field had two column names: the form wrote loadout_use_start/end
          while this card read loadout_use_period_start/end, so a saved window
          always rendered as a dash. The dead pair is gone; the dates are the
          record and the day count is informational.
        */}
        <Field
          label="Trailer Use Window"
          value={formatUseWindow(load.loadout_use_start, load.loadout_use_end) || '—'}
          hint={describeDayCount({
            statedDays: load.loadout_use_period_days,
            start: load.loadout_use_start,
            end: load.loadout_use_end,
          }).text || undefined}
        />
        {load.loadout_use_window_source === 'derived' && (
          <Field
            label="Window Source"
            value={DERIVED_USE_WINDOW_NOTE}
            className="sm:col-span-2 lg:col-span-3"
          />
        )}

      </FieldGrid>
    </DetailSection>
  );
}

export function FlagsBlock({ load }: { load: LoadDetail }) {
  const hasFlags = load.is_team_load || load.is_hazmat || load.permit_required;
  if (!hasFlags) return null;
  return (
    <DetailSection title="Flags">
      <div className="flex flex-wrap gap-2">
        {load.is_team_load ? (
          <Badge variant="outline" className="border-info/30 bg-info/12 text-info">
            Team Load{load.co_driver_name ? ` — ${load.co_driver_name}` : ''}
          </Badge>
        ) : null}
        {load.is_hazmat ? (
          <Badge variant="outline" className="border-warning/35 bg-warning/15 text-warning">Hazmat</Badge>
        ) : null}
        {load.permit_required ? (
          <Badge variant="outline" className="border-warning/35 bg-warning/15 text-warning">Permit Required</Badge>
        ) : null}
      </div>
      {load.permit_required ? (
        <div className="mt-4">
          <FieldGrid>
            <Field label="Permit Cost" value={formatCurrency(load.permit_cost)} />
            <Field label="Recovery Method" value={dash(load.permit_recovery_method)} />
          </FieldGrid>
        </div>
      ) : null}
    </DetailSection>
  );
}
