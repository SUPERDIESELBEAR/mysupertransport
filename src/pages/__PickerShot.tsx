import { useState } from 'react';
import StopTimePicker from '@/components/dispatch/loadDetail/StopTimePicker';

export default function PickerShot() {
  const [a, setA] = useState('2026-08-27T08:00');
  return (
    <div className="p-10 max-w-xl space-y-6">
      <StopTimePicker id="arrival-x" label="Record arrival" value={a} onCommit={setA} />
      <div data-testid="val">{a || 'empty'}</div>
    </div>
  );
}
