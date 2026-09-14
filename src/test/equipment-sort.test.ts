import { describe, it, expect } from 'vitest';
import { sortEquipment, type EquipmentItem } from '@/components/equipment/EquipmentInventory';

function item(partial: Partial<EquipmentItem>): EquipmentItem {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    device_type: 'eld',
    serial_number: '',
    status: 'available',
    notes: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

const fixture: EquipmentItem[] = [
  item({ id: 'a', status: 'assigned', current_operator_name: 'Zed Smith', current_unit_number: '214', serial_number: 'SN3' }),
  item({ id: 'b', status: 'available', serial_number: 'SN1' }),
  item({ id: 'c', status: 'assigned', current_operator_name: 'Amy Jones', current_unit_number: '9', serial_number: 'SN2' }),
  item({ id: 'd', status: 'lost', serial_number: 'SN0' }),
];

const ids = (list: EquipmentItem[]) => list.map(i => i.id);

describe('sortEquipment', () => {
  it('default keeps status rank, then name, then unit', () => {
    expect(ids(sortEquipment(fixture))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('driver sorts A-Z by name, unassigned last', () => {
    expect(ids(sortEquipment(fixture, 'driver'))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('unit sorts numerically, missing unit last', () => {
    expect(ids(sortEquipment(fixture, 'unit'))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('serial sorts alphanumerically with no status grouping', () => {
    expect(ids(sortEquipment(fixture, 'serial'))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('unit mode puts Unit 9 before Unit 214', () => {
    const list = [
      item({ id: 'x', current_unit_number: '214', serial_number: 'A' }),
      item({ id: 'y', current_unit_number: '9', serial_number: 'B' }),
    ];
    expect(ids(sortEquipment(list, 'unit'))).toEqual(['y', 'x']);
  });

  it('non-default modes put missing values last even with empty serial tiebreak', () => {
    const list = [
      item({ id: 'x', current_operator_name: 'Bob', serial_number: 'ZZZ' }),
      item({ id: 'y', serial_number: 'AAA' }),
    ];
    expect(ids(sortEquipment(list, 'driver'))).toEqual(['x', 'y']);
  });
});
