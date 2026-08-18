/**
 * The tap pad is the driver's only repeated screen, so these tests hold the
 * two promises it makes: a status runs until the next tap (never an end time
 * to key), and a certified day cannot be touched.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TapLogEntry from '../TapLogEntry';
import type { DraftSegment } from '@/hooks/useRodsDay';

const seg = (over: Partial<DraftSegment> = {}): DraftSegment => ({
  localId: 's1', start_minute: 0, end_minute: 1440, duty_status: 1,
  city: 'Joplin', state: 'MO', remarks: '', ...over,
});

describe('TapLogEntry', () => {
  it('shows the status the driver is in and when it started', () => {
    render(<TapLogEntry segments={[seg()]} onChange={() => {}} isToday />);
    expect(screen.getAllByText('1 OFF DUTY').length).toBeGreaterThan(0);
    expect(screen.getByText(/since 12:00 AM/)).toBeTruthy();
  });

  it('lists every change of duty status as a row', () => {
    render(
      <TapLogEntry
        segments={[seg({ end_minute: 480 }), seg({ localId: 's2', start_minute: 480, duty_status: 3 })]}
        onChange={() => {}}
        isToday
      />,
    );
    expect(screen.getByText('12:00 AM')).toBeTruthy();
    expect(screen.getByText('8:00 AM')).toBeTruthy();
  });

  it('a tap records the change and leaves no gap or open end', () => {
    const onChange = vi.fn();
    render(<TapLogEntry segments={[seg()]} onChange={onChange} isToday />);
    fireEvent.click(screen.getAllByText('3 DRIVING')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DraftSegment[];
    expect(next[0].start_minute).toBe(0);
    expect(next[next.length - 1].end_minute).toBe(1440);
    for (let i = 1; i < next.length; i += 1) {
      expect(next[i].start_minute).toBe(next[i - 1].end_minute);
    }
    expect(next[next.length - 1].duty_status).toBe(3);
  });

  it('a certified day opens nothing', () => {
    render(<TapLogEntry segments={[seg()]} onChange={() => {}} disabled isToday />);
    fireEvent.click(screen.getAllByText('3 DRIVING')[0]);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
