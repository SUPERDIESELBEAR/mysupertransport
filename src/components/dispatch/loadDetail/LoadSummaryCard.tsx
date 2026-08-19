import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DetailSection, Field, FieldGrid } from './DetailPrimitives';
import AssignDriverDialog from './AssignDriverDialog';
import UnassignDriverDialog from './UnassignDriverDialog';
import { formatEnumLabel, formatShortDate } from '@/lib/loadFormat';
import { formatWeight, type LoadDetail } from '@/lib/loadDetail';

interface Props {
  load: LoadDetail;
  /** Dispatcher/management/owner get assignment controls. */
  canAssign?: boolean;
  /** Only management/owner may override blocking eligibility issues. */
  canOverride?: boolean;
}

export default function LoadSummaryCard({ load, canAssign = false, canOverride = false }: Props) {
  const isLoadout = load.load_type === 'loadout';
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);

  const driverValue = canAssign ? (
    <div className="flex flex-wrap items-center gap-2">
      <span>{load.driver_name ?? 'Unassigned'}</span>
      {load.operator_id ? (
        <>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssignOpen(true)}>
            Reassign
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setUnassignOpen(true)}>
            Unassign
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssignOpen(true)}>
          Assign Driver
        </Button>
      )}
    </div>
  ) : (
    load.driver_name ?? 'Unassigned'
  );

  return (
    <DetailSection title="Load Summary">
      <FieldGrid>
        <Field
          label="Broker"
          value={isLoadout && !load.broker ? 'No broker' : dash(load.broker?.company_name)}
          hint={load.broker?.mc_number ? `MC ${load.broker.mc_number}` : undefined}
        />
        <Field label="Broker Load #" value={dash(load.broker_reference_number)} />
        <Field label="Driver" value={driverValue} />
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
      {canAssign ? (
        <>
          <AssignDriverDialog
            open={assignOpen}
            onOpenChange={setAssignOpen}
            loadId={load.id}
            currentOperatorId={load.operator_id}
            canOverride={canOverride}
          />
          <UnassignDriverDialog
            open={unassignOpen}
            onOpenChange={setUnassignOpen}
            loadId={load.id}
            driverName={load.driver_name}
          />
        </>
      ) : null}
    </DetailSection>
  );
}
