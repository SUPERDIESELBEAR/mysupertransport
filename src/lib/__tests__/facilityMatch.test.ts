import { describe, expect, it } from 'vitest';
import type { Facility } from '@/lib/facilities';
import { matchFacilities, normalizeAddressKey, normalizeZipKey } from '@/lib/facilityMatch';

const facility = (over: Partial<Facility> & { id: string; facility_name: string }): Facility => ({
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  zip: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  facility_type: null,
  default_appointment_required: false,
  hours_notes: null,
  access_notes: null,
  times_used: 0,
  last_used_at: null,
  is_active: true,
  notes: null,
  ...over,
});

describe('normalizeAddressKey', () => {
  it('collapses punctuation and hyphens', () => {
    expect(normalizeAddressKey('2435 US-78')).toBe(normalizeAddressKey('2435 US 78'));
    expect(normalizeAddressKey('  2435   us.78  ')).toBe('2435 us 78');
  });

  it('folds street types and directionals to one spelling', () => {
    expect(normalizeAddressKey('2103 South Main Street')).toBe(normalizeAddressKey('2103 S Main St'));
    expect(normalizeAddressKey('2820 Danieldale Rd.')).toBe(normalizeAddressKey('2820 DANIELDALE ROAD'));
    expect(normalizeAddressKey('1400 Industrial Dr Suite 200')).toBe(
      normalizeAddressKey('1400 Industrial Drive Ste 200'),
    );
  });

  it('is empty for missing input', () => {
    expect(normalizeAddressKey(null)).toBe('');
    expect(normalizeAddressKey('   ')).toBe('');
  });
});

describe('normalizeZipKey', () => {
  it('keeps the first five digits', () => {
    expect(normalizeZipKey('35004-1234')).toBe('35004');
    expect(normalizeZipKey('35004')).toBe('35004');
    expect(normalizeZipKey(null)).toBe('');
  });
});

describe('matchFacilities', () => {
  const clean = facility({
    id: 'a',
    facility_name: 'J M Exotic Foods (Midas Foods Company)',
    address_line1: '2435 US-78',
    city: 'Moody',
    state: 'AL',
    zip: '35004',
  });

  it('matches a truncated broker name on address and zip', () => {
    const hits = matchFacilities(
      { facility_name: 'J M Exotic Foods (a Midas Foods Comp', address_line1: '2435 US 78', zip: '35004' },
      [clean],
    );
    expect(hits.map(f => f.id)).toEqual(['a']);
  });

  it('does NOT match the same street in a different zip', () => {
    const hits = matchFacilities(
      { facility_name: 'J M Exotic Foods', address_line1: '2435 US-78', zip: '36264' },
      [clean],
    );
    expect(hits).toEqual([]);
  });

  it('ignores inactive facilities', () => {
    const hits = matchFacilities(
      { address_line1: '2435 US-78', zip: '35004' },
      [{ ...clean, is_active: false }],
    );
    expect(hits).toEqual([]);
  });

  it('never matches on name alone when the address or zip is missing', () => {
    expect(matchFacilities({ facility_name: 'J M Exotic Foods', zip: '35004' }, [clean])).toEqual([]);
    expect(matchFacilities({ facility_name: 'J M Exotic Foods', address_line1: '2435 US-78' }, [clean])).toEqual([]);
  });

  it('uses the name to break a tie between facilities at one address', () => {
    const dockA = facility({
      id: 'b', facility_name: 'Gadsden Warehousing Inc', address_line1: '600 Rodney Austin', zip: '35903',
    });
    const dockB = facility({
      id: 'c', facility_name: 'Attalla Cold Storage', address_line1: '600 Rodney Austin', zip: '35903',
    });
    const hits = matchFacilities(
      { facility_name: 'GADSDEN_WAREHOUSING_INC', address_line1: '600 RODNEY AUSTIN', zip: '35903' },
      [dockA, dockB],
    );
    expect(hits.map(f => f.id)).toEqual(['b']);
  });

  it('offers every candidate when the name cannot pick a clear winner', () => {
    const dockA = facility({
      id: 'b', facility_name: 'Dock One', address_line1: '600 Rodney Austin', zip: '35903',
    });
    const dockB = facility({
      id: 'c', facility_name: 'Dock Two', address_line1: '600 Rodney Austin', zip: '35903',
    });
    const hits = matchFacilities(
      { facility_name: 'Unrelated Cold Storage', address_line1: '600 Rodney Austin', zip: '35903' },
      [dockA, dockB],
    );
    expect(hits.map(f => f.id)).toEqual(['b', 'c']);
  });
});
