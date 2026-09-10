import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  groupSharedPlates,
  normalizePlate,
  plateKey,
  sharedPlateNote,
  type PlateHolder,
} from '../duplicatePlates';

const holder = (over: Partial<PlateHolder> & { operatorId: string }): PlateHolder => ({
  driverName: 'Driver',
  unitNumber: null,
  truckPlate: null,
  truckPlateState: null,
  isActive: true,
  ...over,
});

describe('normalizePlate', () => {
  it('uppercases and strips punctuation and spacing', () => {
    expect(normalizePlate(' 05-kt 2w ')).toBe('05KT2W');
    expect(normalizePlate(null)).toBe('');
  });

  it('keys plate and state together', () => {
    expect(plateKey('05kt2w', 'mo')).toBe('05KT2W|MO');
  });
});

describe('groupSharedPlates', () => {
  it('ignores drivers with no plate and plates held by one driver', () => {
    const groups = groupSharedPlates([
      holder({ operatorId: 'a', truckPlate: null }),
      holder({ operatorId: 'b', truckPlate: '11AAA1', truckPlateState: 'MO' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('classifies a mixed pair and puts the active driver first', () => {
    const groups = groupSharedPlates([
      holder({ operatorId: 'ed', driverName: 'Edward Williams', unitNumber: '197', isActive: false, truckPlate: '05KT2W', truckPlateState: 'MO' }),
      holder({ operatorId: 'matt', driverName: 'Matthew Clovis', unitNumber: '193', isActive: true, truckPlate: '05kt2w', truckPlateState: 'mo' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('mixed');
    expect(groups[0].plate).toBe('05KT2W');
    expect(groups[0].holders.map(h => h.operatorId)).toEqual(['matt', 'ed']);
  });

  it('classifies both-active and all-deactivated groups', () => {
    const groups = groupSharedPlates([
      holder({ operatorId: 'g', unitNumber: '268', truckPlate: '72KU6D', truckPlateState: 'MO' }),
      holder({ operatorId: 'm', unitNumber: '268', truckPlate: '72KU6D', truckPlateState: 'MO' }),
      holder({ operatorId: 'd1', isActive: false, truckPlate: '89KT9T', truckPlateState: 'MO' }),
      holder({ operatorId: 'd2', isActive: false, truckPlate: '89KT9T', truckPlateState: 'MO' }),
    ]);
    expect(groups.map(g => g.kind)).toEqual(['both_active', 'all_deactivated']);
  });

  it('handles a plate on four drivers and orders needs-a-decision first', () => {
    const groups = groupSharedPlates([
      holder({ operatorId: 'k', isActive: false, truckPlate: '53KU7B', truckPlateState: 'MO' }),
      holder({ operatorId: 'j', isActive: false, truckPlate: '53KU7B', truckPlateState: 'MO' }),
      holder({ operatorId: 't', isActive: false, truckPlate: '53KU7B', truckPlateState: 'MO' }),
      holder({ operatorId: 'd', isActive: true, truckPlate: '53KU7B', truckPlateState: 'MO' }),
      holder({ operatorId: 'x', truckPlate: '72KU6D', truckPlateState: 'MO' }),
      holder({ operatorId: 'y', truckPlate: '72KU6D', truckPlateState: 'MO' }),
    ]);
    expect(groups[0].kind).toBe('mixed');
    expect(groups[0].holders).toHaveLength(4);
    expect(groups[0].holders[0].operatorId).toBe('d');
  });

  it('treats a different state as a different plate', () => {
    const groups = groupSharedPlates([
      holder({ operatorId: 'a', truckPlate: 'AB1234', truckPlateState: 'MO' }),
      holder({ operatorId: 'b', truckPlate: 'AB1234', truckPlateState: 'KS' }),
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe('sharedPlateNote', () => {
  it('names the other units and their roster state', () => {
    const rows = [
      holder({ operatorId: 'matt', unitNumber: '193', truckPlate: '05KT2W', truckPlateState: 'MO' }),
      holder({ operatorId: 'ed', unitNumber: '197', isActive: false, truckPlate: '05KT2W', truckPlateState: 'MO' }),
    ];
    const groups = groupSharedPlates(rows);
    expect(sharedPlateNote(rows[0], groups)).toBe('Plate also on Unit 197 — deactivated');
    expect(sharedPlateNote(rows[1], groups)).toBe('Plate also on Unit 193 — active');
  });

  it('says nothing when the plate is unique', () => {
    expect(sharedPlateNote(holder({ operatorId: 'a', truckPlate: 'ZZ9999' }), [])).toBeNull();
  });
});

describe('the panel never writes truck plates directly', () => {
  it('changes plates only through the protected writer', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/management/DuplicatePlatesPanel.tsx'),
      'utf8',
    );
    expect(src).toContain('resolve_shared_truck_plate');
    // No direct table write: a plate correction must carry an actor, a reason
    // and a history row, which only the definer writer guarantees.
    expect(src).not.toMatch(/from\(['"]onboarding_status['"]\)[\s\S]{0,120}\.update\(/);
  });
});
