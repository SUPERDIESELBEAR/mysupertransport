/* TEMPORARY verification route — removed after screenshots. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DetentionSection from '@/components/dispatch/loadDetail/DetentionSection';

const baseStop = {
  id: 'stop-a',
  load_id: 'load-1',
  stop_sequence: 1,
  stop_type: 'pickup',
  facility_name: 'Cargill Elevator',
  appointment_start: '2026-08-27T14:00:00.000Z',
  appointment_end: '2026-08-27T16:00:00.000Z',
  actual_arrival_at: '2026-08-27T13:45:00.000Z',
  actual_departure_at: '2026-08-27T19:20:00.000Z',
  arrival_source: 'driver_app',
  departure_source: 'dispatcher_entry',
  arrival_recorded_by: null,
  departure_recorded_by: null,
};

const baseClaim = {
  id: 'claim-1',
  load_id: 'load-1',
  load_stop_id: 'stop-a',
  driver_reported_at: '2026-08-25T18:00:00.000Z',
  reported_to: 'p1',
  reported_to_name: 'Dana Reyes',
  broker_notified_at: '2026-08-25T18:20:00.000Z',
  notified_by: 'p1',
  notified_by_name: 'Dana Reyes',
  notification_method: 'email',
  status: 'notified',
  resolution_note: null,
  resulting_charge_id: null,
  created_at: null, updated_at: null, created_by: 'p1', updated_by: 'p1',
};

const charges = [{
  id: 'charge-1', load_id: 'load-1', load_stop_id: 'stop-a', charge_type: 'detention',
  description: 'Detention, 3.5 hrs — revised con', amount: 262.5, source: 'revised_rate_con',
  funding_source: null, actual_cost: null, proof_document_id: null,
}];

export default function DetentionShot() {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get('v') ?? 'evidence';

  const stop = variant === 'missing'
    ? { ...baseStop, actual_arrival_at: null, actual_departure_at: null, arrival_source: null, departure_source: null }
    : baseStop;

  const claim = variant === 'resolved'
    ? {
      ...baseClaim,
      status: 'resolved_revision',
      resolution_note: 'Broker confirmed 3.5 hours and reissued the rate con.',
      resulting_charge_id: 'charge-1',
    }
    : baseClaim;

  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(['detention-claims', 'load-1'], [claim]);
  client.setQueryData(['load-charges', 'load-1'], charges);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <QueryClientProvider client={client}>
        <DetentionSection loadId="load-1" stops={[stop] as never} canManage />
      </QueryClientProvider>
    </div>
  );
}
