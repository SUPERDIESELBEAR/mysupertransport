import { describe, expect, it } from 'vitest';
import { findDuplicateBrokers, normalizeBrokerName, normalizeMC } from '@/lib/brokerDuplicates';
import type { BrokerDuplicate } from '@/lib/brokerDuplicates';

const base = (overrides: Partial<BrokerDuplicate> = {}): BrokerDuplicate => ({
  id: '00000000-0000-0000-0000-000000000000',
  company_name: 'Acme Logistics',
  mc_number: '123456',
  city: 'Kansas City',
  state: 'MO',
  primary_contact_name: 'Jane Doe',
  ...overrides,
});

describe('normalizeMC', () => {
  it('strips non-digits', () => {
    expect(normalizeMC('MC 123456')).toBe('123456');
    expect(normalizeMC('123-456')).toBe('123456');
    expect(normalizeMC('mc123456')).toBe('123456');
  });

  it('handles null/empty', () => {
    expect(normalizeMC(null)).toBe('');
    expect(normalizeMC('')).toBe('');
  });
});

describe('normalizeBrokerName', () => {
  it('strips legal entity suffixes and punctuation', () => {
    expect(normalizeBrokerName('Acme Logistics Inc.')).toBe('acme logistics');
    expect(normalizeBrokerName('Acme Logistics LLC')).toBe('acme logistics');
    expect(normalizeBrokerName('Acme Logistics Ltd.')).toBe('acme logistics');
    expect(normalizeBrokerName('Acme Logistics Corp')).toBe('acme logistics');
    expect(normalizeBrokerName('Acme Logistics Co.')).toBe('acme logistics');
    expect(normalizeBrokerName('Acme Logistics LP')).toBe('acme logistics');
    expect(normalizeBrokerName('Acme Logistics LLP')).toBe('acme logistics');
  });

  it('keeps industry words', () => {
    expect(normalizeBrokerName('Smith Logistics')).toBe('smith logistics');
    expect(normalizeBrokerName('Smith Trucking')).toBe('smith trucking');
    expect(normalizeBrokerName('Smith Transport')).toBe('smith transport');
    expect(normalizeBrokerName('Smith Freight')).toBe('smith freight');
    expect(normalizeBrokerName('Smith Express')).toBe('smith express');
  });
});

describe('findDuplicateBrokers', () => {
  it('matches on MC number and marks it authoritative', () => {
    const existing = [base({ id: 'a', mc_number: '123456' })];
    const result = findDuplicateBrokers({ company_name: 'Acme', mc_number: 'MC 123456' }, existing);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(result[0].matchReason).toBe('mc');
  });

  it('does not match by name when candidate has an MC that does not match', () => {
    const existing = [base({ id: 'a', mc_number: '999999', company_name: 'Acme Logistics' })];
    const result = findDuplicateBrokers({ company_name: 'Acme Logistics', mc_number: '123456' }, existing);
    expect(result).toHaveLength(0);
  });

  it('matches by name when no MC is present on either side', () => {
    const existing = [base({ id: 'a', mc_number: null, company_name: 'Acme Logistics Inc' })];
    const result = findDuplicateBrokers({ company_name: 'Acme Logistics LLC', mc_number: null }, existing);
    expect(result).toHaveLength(1);
    expect(result[0].matchReason).toBe('name');
  });

  it('does not match unrelated names', () => {
    const existing = [base({ id: 'a', company_name: 'BlueGrace Logistics' })];
    const result = findDuplicateBrokers({ company_name: 'Cahaba Transportation', mc_number: null }, existing);
    expect(result).toHaveLength(0);
  });

  it('sorts MC matches first', () => {
    const existing = [
      base({ id: 'name', mc_number: null, company_name: 'Acme Logistics' }),
      base({ id: 'mc', mc_number: '123456', company_name: 'Acme Freight' }),
    ];
    const result = findDuplicateBrokers({ company_name: 'Acme', mc_number: '123456' }, existing);
    expect(result.map(r => r.id)).toEqual(['mc', 'name']);
  });

  it('suffix distinction: Smith Logistics and Smith Trucking do not match', () => {
    const existing = [base({ id: 'a', mc_number: null, company_name: 'Smith Logistics' })];
    const result = findDuplicateBrokers({ company_name: 'Smith Trucking', mc_number: null }, existing);
    expect(result).toHaveLength(0);
  });

  it('suffix distinction: Acme Logistics Inc and Acme Logistics LLC do match', () => {
    const existing = [base({ id: 'a', mc_number: null, company_name: 'Acme Logistics Inc' })];
    const result = findDuplicateBrokers({ company_name: 'Acme Logistics LLC', mc_number: null }, existing);
    expect(result).toHaveLength(1);
    expect(result[0].matchReason).toBe('name');
  });
});
