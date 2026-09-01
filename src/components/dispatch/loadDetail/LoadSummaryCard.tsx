import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSection, Field, FieldGrid } from './DetailPrimitives';
import AssignDriverDialog from './AssignDriverDialog';
import UnassignDriverDialog from './UnassignDriverDialog';
import DispatcherField from './DispatcherField';
import { formatEnumLabel, formatShortDate } from '@/lib/loadFormat';
import { formatWeight, type LoadDetail } from '@/lib/loadDetail';
import { openLoadChat } from '@/lib/loadChat';

interface Props {
  load: LoadDetail;
  /** Dispatcher/management/owner get assignment controls. */
  canAssign?: boolean;
  /** Only management/owner may override blocking eligibility issues. */
  canOverride?: boolean;
  /** Staff (dispatcher, onboarding, management, owner) get the message-driver button. */
  canMessage?: boolean;
  /** Only management/owner may change which dispatcher owns the load. */
  canEditDispatcher?: boolean;
}

export default function LoadSummaryCard({
  load, canAssign = false, canOverride = false, canMessage = false, canEditDispatcher = false,
}: Props) {
  const isLoadout = load.load_type === 'loadout';
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);

  const hasDriver = !!load.driver_user_id;
  const driverFirstName = load.driver_name?.split(' ')[0] ?? 'Driver';
  const startChat = () => {
    if (!load.driver_user_id) return;
    openLoadChat({ driverUserId: load.driver_user_id, loadId: load.id, loadNumber: load.load_number });
  };

  const messageButton = canMessage ? (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={startChat}
      disabled={!hasDriver}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {hasDriver ? `Message ${driverFirstName}` : 'Message Driver'}
    </Button>
  ) : null;

  const messageButtonWrapper = canMessage && !hasDriver ? (
    <span title="No driver assigned to this load yet." className="inline-flex">
      {messageButton}
    </span>
  ) : (
    messageButton
  );

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
          {messageButtonWrapper}
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssignOpen(true)}>
            Assign Driver
          </Button>
          {messageButtonWrapper}
        </>
      )}
    </div>
  ) : canMessage ? (
    <div className="flex flex-wrap items-center gap-2">
      <span>{load.driver_name ?? 'Unassigned'}</span>
      {messageButtonWrapper}
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
        <Field
          label="Driver"
          value={driverValue}
          hint={canMessage && !hasDriver ? 'No driver assigned to this load yet. Messages already linked to this load stay visible here.' : undefined}
        />
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
