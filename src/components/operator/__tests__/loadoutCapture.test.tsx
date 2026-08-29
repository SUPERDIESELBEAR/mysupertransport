/**
 * Guided loadout capture. The slots come from src/lib/loadoutSlots.ts — the same
 * module the paperwork predicate reads — and the driver never types a label.
 *
 * Nothing here gates him: a missing required slot is shown, never enforced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let docRows: Array<Record<string, unknown>> = [];
const inserted: Array<Record<string, unknown>> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => ({ data: docRows, error: null }) }),
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'doc-1' }, error: null }) }) };
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
  },
}));

const { uploadLoadDocument } = vi.hoisted(() => ({
  uploadLoadDocument: vi.fn(async (_i: Record<string, unknown>) => 'doc-1'),
}));
vi.mock('@/lib/loadDocuments', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/loadDocuments')>();
  return { ...actual, uploadLoadDocument };
});

import { LoadoutCapture } from '@/components/operator/LoadoutCapture';
import { LOADOUT_SLOTS, requiredLoadoutSlots } from '@/lib/loadoutSlots';

const photo = () => new File(['x'], 'shot.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  docRows = [];
  inserted.length = 0;
  rpcCalls.length = 0;
  uploadLoadDocument.mockClear();
});

describe('loadout capture', () => {
  it('renders the pickup and delivery slot lists from the shared definition', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    await screen.findByTestId('loadout-stage-pickup');

    requiredLoadoutSlots('pickup').forEach(s => {
      if (s.kind === 'sticker') {
        expect(screen.getByRole('button', { name: /no sticker found/i })).toBeTruthy();
        return;
      }
      expect(screen.getByTestId(`loadout-camera-${s.key}`)).toBeTruthy();
    });

    expect(screen.getByTestId('loadout-stage-delivery')).toBeTruthy();
    // The delivery list is genuinely different: signage there, roof check not.
    expect(screen.getByTestId('loadout-camera-delivery_signage')).toBeTruthy();
    expect(screen.queryByTestId('loadout-camera-delivery_roof_check')).toBeNull();
  });

  it('a capture stores the fixed label, marks the channel driver_app, and never asks for text', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    const input = await screen.findByTestId('loadout-camera-pickup_roof_check');
    fireEvent.change(input, { target: { files: [photo()] } });

    await waitFor(() => expect(uploadLoadDocument).toHaveBeenCalled());
    const arg = uploadLoadDocument.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.photoLabel).toBe('Rear Doors Open');
    expect(arg.documentType).toBe('loadout_pickup_inspection');
    expect(arg.uploadChannel).toBe('driver_app');
  });

  it('missing required slots are reported, and nothing blocks the driver', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    await screen.findByTestId('loadout-stage-pickup');
    expect(screen.getAllByText(/still to take/).length).toBeGreaterThan(0);
    // Every camera control stays live regardless of what is missing.
    const cam = screen.getByTestId('loadout-camera-pickup_front') as HTMLInputElement;
    expect(cam.disabled).toBe(false);
  });

  it('records "no sticker found" as an answer, with no photo and no blank', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /no sticker found/i }));

    await waitFor(() => expect(inserted.length).toBe(1));
    expect(inserted[0].inspection_sticker_state).toBe('not_found');
    expect(inserted[0].file_path).toBeUndefined();
    expect(inserted[0].photo_label).toBe('Annual Inspection Sticker');
  });

  it('records a sticker photo with its expiry date', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /photo and expiry/i }));
    fireEvent.change(screen.getByTestId('loadout-sticker-photo'), { target: { files: [photo()] } });
    fireEvent.change(screen.getByLabelText(/expiry date/i), { target: { value: '2027-04-30' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(uploadLoadDocument).toHaveBeenCalled());
    const arg = uploadLoadDocument.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.inspectionStickerState).toBe('recorded');
    expect(arg.inspectionStickerExpiry).toBe('2027-04-30');
  });

  it('records "present but unreadable" with a photo and no expiry', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /present but unreadable/i }));
    fireEvent.change(screen.getByTestId('loadout-sticker-photo'), { target: { files: [photo()] } });
    expect(screen.queryByLabelText(/expiry date/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(uploadLoadDocument).toHaveBeenCalled());
    const arg = uploadLoadDocument.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.inspectionStickerState).toBe('unreadable');
    expect(arg.inspectionStickerExpiry).toBeNull();
  });

  it('a damage note uploads the photo and raises exactly one WATCH claim through the RPC', async () => {
    render(<LoadoutCapture loadId="load-1" />);
    fireEvent.click(await screen.findByTestId('loadout-damage-pickup'));
    fireEvent.change(screen.getByLabelText(/what is wrong/i), { target: { value: 'Daylight through the roof' } });
    fireEvent.change(screen.getByTestId('loadout-damage-photo'), { target: { files: [photo()] } });
    fireEvent.click(screen.getByRole('button', { name: /save damage/i }));

    await waitFor(() => expect(rpcCalls.length).toBe(1));
    expect(rpcCalls[0].fn).toBe('record_loadout_damage_flag');
    expect(rpcCalls[0].args).toEqual({ _load_id: 'load-1', _note: 'Daylight through the roof' });
    const arg = uploadLoadDocument.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.damageNoted).toBe(true);
    // Deduplication is the database's job — the client always calls the same RPC.
    expect(LOADOUT_SLOTS.pickup.find(s => s.kind === 'damage')?.repeatable).toBe(true);
  });
});
