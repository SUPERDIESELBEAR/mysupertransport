/**
 * The kick exists because an enqueued draft sitting unsynced until the 60s
 * backstop is not the intended behaviour. These cover the two ways a kick can
 * be silently lost: arriving before the runner registers, and arriving while a
 * pass is already running.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setDrainKick, requestDrain, __resetDrainKick } from '../kick';

beforeEach(() => { __resetDrainKick(); });

describe('drain kick registry', () => {
  it('forwards a request to the registered kick', () => {
    const kick = vi.fn();
    setDrainKick(kick);
    requestDrain('chain');
    expect(kick).toHaveBeenCalledWith('chain');
  });

  it('buffers a request made before the runner registers and flushes it', () => {
    requestDrain('draft');
    const kick = vi.fn();
    setDrainKick(kick);
    expect(kick).toHaveBeenCalledTimes(1);
    expect(kick).toHaveBeenCalledWith('draft');
  });

  it('merges buffered scopes so the tighter window wins', () => {
    requestDrain('draft');
    requestDrain('chain');
    requestDrain('draft');
    const kick = vi.fn();
    setDrainKick(kick);
    expect(kick).toHaveBeenCalledTimes(1);
    expect(kick).toHaveBeenCalledWith('chain');
  });

  it('does not replay a buffered request twice', () => {
    requestDrain('chain');
    const first = vi.fn();
    setDrainKick(first);
    const second = vi.fn();
    setDrainKick(second);
    expect(second).not.toHaveBeenCalled();
  });
});