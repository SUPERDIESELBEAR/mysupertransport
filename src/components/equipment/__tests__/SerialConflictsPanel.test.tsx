import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquipmentItem } from '@/components/equipment/EquipmentInventory';

const inserted: Array<Record<string, unknown>> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'equipment_serial_conflict_dismissals') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: async () => ({ data: [], error: null }),
        insert: async (payload: Record<string, unknown>) => {
          inserted.push(payload);
          return { error: null };
        },
        delete: () => ({
          eq: async () => ({ error: null }),
          in: async () => ({ error: null }),
        }),
        upsert: async () => ({ error: null }),
      };
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-123' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import SerialConflictsPanel from '@/components/equipment/SerialConflictsPanel';

const items: EquipmentItem[] = [
  {
    id: 'device-1',
    device_type: 'eld',
    serial_number: 'ABC0',
    status: 'available',
    notes: null,
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
  },
  {
    id: 'device-2',
    device_type: 'eld',
    serial_number: 'ABCO',
    status: 'available',
    notes: null,
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
  },
];

describe('SerialConflictsPanel dismissal', () => {
  beforeEach(() => {
    inserted.length = 0;
    localStorage.clear();
  });

  it('stores the staff profile id and hides the conflict after dismissal', async () => {
    render(<SerialConflictsPanel items={items} onResolved={vi.fn()} />);

    const action = await screen.findByRole('button', { name: 'These are different devices' });
    fireEvent.click(action);

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].dismissed_by).toBe('profile-123');
    expect(inserted[0].dismissed_by).not.toBe('auth-user-123');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'These are different devices' })).toBeNull();
      expect(screen.getByText('1 pair marked as different devices')).toBeInTheDocument();
    });
  });
});