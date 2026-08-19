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
