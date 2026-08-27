import StopsTimeline from '@/components/dispatch/loadDetail/StopsTimeline';

const stop = {
  id: 'stop-shot-1',
  stop_sequence: 1,
  stop_type: 'pickup',
  facility_name: 'Riverbend Grain',
  city: 'Kansas City',
  state: 'MO',
  appointment_start: '2026-08-27T13:00:00.000Z',
  appointment_end: null,
  actual_arrival_at: '2026-08-27T13:05:00.000Z',
  actual_departure_at: '2026-08-27T15:20:00.000Z',
  arrival_source: 'dispatcher_entry',
  departure_source: 'dispatcher_entry',
  arrival_recorded_by: null,
  departure_recorded_by: null,
} as never;

export default function PickerShot() {
  return (
    <div className="p-10 max-w-3xl">
      <StopsTimeline stops={[stop] as never} />
    </div>
  );
}
