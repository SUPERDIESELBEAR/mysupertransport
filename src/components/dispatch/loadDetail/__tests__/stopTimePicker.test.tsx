/**
 * The arrival / departure entry popup.
 *
 * The hazard this pins: the native control let you fill the time, leave the
 * date at mm/dd/yyyy, click away, and end up with a field displaying a time
 * that was never recorded. Every commit path here refuses that state, and they
 * all refuse it the same way.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StopTimePicker, { INCOMPLETE_MESSAGE } from '../StopTimePicker';
import { isoToNaive, naiveToIso } from '@/lib/carrierTimezone';

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Record arrival' }));
}
const done = () => screen.getByRole('button', { name: 'Done record arrival' });

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Asia/Karachi'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe('StopTimePicker', () => {
  it('Done commits a complete value and closes', () => {
    const onCommit = vi.fn();
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={onCommit} />);
    open();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-27' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:15' } });
    fireEvent.click(done());

    expect(onCommit).toHaveBeenCalledWith('2026-08-27T10:15');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables Done and says why when only the time is filled', () => {
    const onCommit = vi.fn();
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={onCommit} />);
    open();
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:15' } });

    expect(done()).toBeDisabled();
    expect(screen.getByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    fireEvent.click(done());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('disables Done when only the date is filled', () => {
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={vi.fn()} />);
    open();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-27' } });
    expect(done()).toBeDisabled();
  });

  it('discards rather than commits when you click away from an incomplete value', () => {
    const onCommit = vi.fn();
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={onCommit} />);
    open();
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:15' } });
    fireEvent.mouseDown(document.body);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('commits on click-away when the value is complete', () => {
    const onCommit = vi.fn();
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={onCommit} />);
    open();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-27' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:15' } });
    fireEvent.mouseDown(document.body);
    expect(onCommit).toHaveBeenCalledWith('2026-08-27T10:15');
  });

  it('Escape discards and restores the prior value', () => {
    const onCommit = vi.fn();
    render(
      <StopTimePicker id="a" label="Record arrival" value="2026-08-27T08:00" onCommit={onCommit} />,
    );
    open();
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '23:45' } });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    expect(screen.getByLabelText('Time')).toHaveValue('08:00');
  });

  it('Clear empties a previously recorded value', () => {
    const onCommit = vi.fn();
    render(
      <StopTimePicker id="a" label="Record arrival" value="2026-08-27T08:00" onCommit={onCommit} />,
    );
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear record arrival in entry' }));
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('both empty is a value: Done closes and records nothing', () => {
    const onCommit = vi.fn();
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={onCommit} />);
    open();
    fireEvent.click(done());
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('round-trips a picked value through the carrier timezone helpers', () => {
    // The process zone is Asia/Karachi in this suite; the value must still come
    // back as the carrier wall clock it was entered as.
    const onCommit = vi.fn();
    render(<StopTimePicker id="a" label="Record arrival" value="" onCommit={onCommit} />);
    open();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-27' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:15' } });
    fireEvent.click(done());

    const naive = onCommit.mock.calls[0][0] as string;
    expect(isoToNaive(naiveToIso(naive))).toBe('2026-08-27T10:15');
  });
});
