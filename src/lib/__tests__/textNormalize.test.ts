import { describe, expect, it } from 'vitest';
import {
  formatPhone, normalizePhone, normalizeWhitespace, normalizeZip, toTitleCase,
} from '../textNormalize';

describe('normalizeWhitespace', () => {
  it('trims and collapses', () => {
    expect(normalizeWhitespace('  Kansas   City  ')).toBe('Kansas City');
    expect(normalizeWhitespace(undefined)).toBe('');
  });
});

describe('toTitleCase', () => {
  it('title cases plain text', () => {
    expect(toTitleCase('kansas city')).toBe('Kansas City');
  });
  it('handles hyphenated names', () => {
    expect(toTitleCase('winston-salem')).toBe('Winston-Salem');
  });
  it('uppercases directionals', () => {
    expect(toTitleCase('1400 industrial dr ne')).toBe('1400 Industrial Dr NE');
  });
  it('preserves short acronyms already in caps', () => {
    expect(toTitleCase('JFK terminal')).toBe('JFK Terminal');
    expect(toTitleCase('US 1 warehouse')).toBe('US 1 Warehouse');
  });

  describe('street types vs acronyms', () => {
    it('title cases street type abbreviations', () => {
      expect(toTitleCase('2103 S MAIN ST')).toBe('2103 S Main St');
      expect(toTitleCase('2820 DANIELDALE RD')).toBe('2820 Danieldale Rd');
      expect(toTitleCase('900 GRAND BLVD')).toBe('900 Grand Blvd');
      expect(toTitleCase('12 MAPLE AVE')).toBe('12 Maple Ave');
    });
    it('strips trailing periods from street type abbreviations', () => {
      // Reverses a previous behavior: periods are now dropped for consistency.
      expect(toTitleCase('500 W SEVENTH ST.')).toBe('500 W Seventh St');
      expect(toTitleCase('12 CEDAR RD.')).toBe('12 Cedar Rd');
      expect(toTitleCase('8901 SAN MATEO DR.')).toBe('8901 San Mateo Dr');
      expect(toTitleCase('2600 MCCREE RD')).toBe('2600 McCree Rd');
    });
    it('handles street types mid-address', () => {
      expect(toTitleCase('1400 INDUSTRIAL DR SUITE 200')).toBe('1400 Industrial Dr Suite 200');
    });
    it('keeps directionals uppercase', () => {
      expect(toTitleCase('1400 industrial dr ne')).toBe('1400 Industrial Dr NE');
      expect(toTitleCase('100 SW BROADWAY ST')).toBe('100 SW Broadway St');
    });
    it('preserves genuine inner capitals in names', () => {
      expect(toTitleCase('mccree logistics')).toBe('McCree Logistics');
      expect(toTitleCase('MCCREE LOGISTICS')).toBe('McCree Logistics');
      expect(toTitleCase('mcdonald ave')).toBe('McDonald Ave');
      expect(toTitleCase('macarthur blvd')).toBe('MacArthur Blvd');
      expect(toTitleCase('o\'brien st')).toBe('O\'Brien St');
      expect(toTitleCase('desoto pkwy')).toBe('DeSoto Pkwy');
      expect(toTitleCase('lasalle dr')).toBe('LaSalle Dr');
      expect(toTitleCase('Winston-Salem')).toBe('Winston-Salem');
    });
    it('does not split ordinary words that happen to start with Mac, De, La, or Van', () => {
      expect(toTitleCase('macon rd')).toBe('Macon Rd');
      expect(toTitleCase('delaware ave')).toBe('Delaware Ave');
      expect(toTitleCase('lancaster st')).toBe('Lancaster St');
      expect(toTitleCase('madison blvd')).toBe('Madison Blvd');
      expect(toTitleCase('vandalia dr')).toBe('Vandalia Dr');
      expect(toTitleCase('lafayette pkwy')).toBe('Lafayette Pkwy');
    });
  });
});

describe('normalizeZip', () => {
  it('keeps five digits', () => expect(normalizeZip('64080abc')).toBe('64080'));
  it('formats zip+4', () => expect(normalizeZip('123456789')).toBe('12345-6789'));
});

describe('phones', () => {
  it('stores digits only', () => expect(normalizePhone('+1 (555) 123-4567')).toBe('5551234567'));
  it('formats for display', () => expect(formatPhone('5551234567')).toBe('(555) 123-4567'));
});
