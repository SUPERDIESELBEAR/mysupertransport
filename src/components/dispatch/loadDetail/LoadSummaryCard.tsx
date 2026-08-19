import { DetailSection, Field, FieldGrid } from './DetailPrimitives';
import { formatEnumLabel, formatShortDate } from '@/lib/loadFormat';
import { formatWeight, type LoadDetail } from '@/lib/loadDetail';

export default function LoadSummaryCard({ load }: { load: LoadDetail }) {
  const isLoadout = load.load_type === 'loadout';
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');

  return (
    <DetailSection title="Load Summary">
      <FieldGrid>
        <Field
          label="Broker"
          value={isLoadout && !load.broker ? 'No broker' : dash(load.broker?.company_name)}
          hint={load.broker?.mc_number ? `MC ${load.broker.mc_number}` : undefined}
        />
        <Field label="Broker Load #" value={dash(load.broker_reference_number)} />
        <Field label="Driver" value={load.driver_name ?? 'Unassigned'} />
        <Field label="Dispatcher" value={load.dispatcher_name ?? 'Unassigned'} />
        <Field label="Equipment" value={formatEnumLabel(load.equipment_type)} />
        <Field label="Handling" value={formatEnumLabel(load.handling_type)} />
        <Field label="Commodity" value={dash(load.commodity)} />
        <Field label="Weight" value={formatWeight(load.weight_lbs)} />
        {load.bol_number ? <Field label="BOL #" value={load.bol_number} /> : null}
        {load.po_number ? <Field label="PO #" value={load.po_number} /> : null}
        <Field
          label="Created"
          value={formatShortDate(load.created_at)}
          hint={load.created_by_name ? `by ${load.created_by_name}` : undefined}
        />
      </FieldGrid>
    </DetailSection>
  );
}
