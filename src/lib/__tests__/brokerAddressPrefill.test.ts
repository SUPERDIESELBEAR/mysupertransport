import { describe, expect, it } from 'vitest';
import { appendNote, brokerAddressPrefill } from '@/lib/brokerAddressPrefill';
import type { ParsedRateConfirmation } from '@/lib/rateConfirmation';

type Broker = ParsedRateConfirmation['broker'];

const f = (value: string | null, confidence: 'high' | 'medium' | 'low' = 'high') => ({ value, confidence });

function broker(over: Partial<Broker> = {}): Broker {
  return {
    company_name: f('Blue Grace Logistics'),
    mc_number: f('123456'),
    contact_name: f(null, 'low'),
    contact_phone: f(null, 'low'),
    contact_email: f(null, 'low'),
    address_line1: f(null, 'low'),
    address_line2: f(null, 'low'),
    city: f(null, 'low'),
    state: f(null, 'low'),
    zip: f(null, 'low'),
    address_source: null,
    ...over,
  } as Broker;
}

// Noon-anchored so the Central conversion cannot roll the date.
const parsedAt = new Date('2026-08-21T17:00:00Z');

describe('brokerAddressPrefill', () => {
  it('fills the address and names a bill-to source', () => {
    const out = brokerAddressPrefill(broker({
      address_line1: f('2846 S FALKENBURG RD'),
      city: f('RIVERVIEW'),
      state: f('fl'),
      zip: f('33578'),
      address_source: 'bill_to',
    }), parsedAt);

    expect(out.address_line1).toBe('2846 S Falkenburg Rd');
    expect(out.city).toBe('Riverview');
    expect(out.state).toBe('FL');
    expect(out.zip).toBe('33578');
    expect(out.sourceLabel).toBe('Bill To block');
    expect(out.note).toBe('Address captured from Bill To block on rate confirmation, 8/21/26.');
  });

  it('labels a remit-to source', () => {
    const out = brokerAddressPrefill(broker({
      address_line1: f('1 Remit Way'), city: f('Tampa'), state: f('FL'), zip: f('33601'),
      address_source: 'remit_to',
    }), parsedAt);
    expect(out.sourceLabel).toBe('Remit To block');
    expect(out.note).toContain('Remit To block');
  });

  it('labels a letterhead fallback', () => {
    const out = brokerAddressPrefill(broker({
      address_line1: f('9 Corporate Dr', 'medium'), city: f('Tampa', 'medium'),
      state: f('FL', 'medium'), zip: f('33602', 'medium'),
      address_source: 'letterhead',
    }), parsedAt);
    expect(out.sourceLabel).toBe('letterhead');
    expect(out.note).toBe('Address captured from letterhead on rate confirmation, 8/21/26.');
  });

  it('drops low-confidence values rather than trusting a guess', () => {
    const out = brokerAddressPrefill(broker({
      address_line1: f('Maybe Street', 'low'),
      city: f('Riverview'),
      state: f('FL'),
      zip: f('33578', 'low'),
      address_source: 'bill_to',
    }), parsedAt);
    expect(out.address_line1).toBe('');
    expect(out.zip).toBe('');
    expect(out.city).toBe('Riverview');
  });

  it('leaves everything blank and writes no note when no address was printed', () => {
    const out = brokerAddressPrefill(broker(), parsedAt);
    expect(out).toMatchObject({
      address_line1: '', address_line2: '', city: '', state: '', zip: '',
      sourceLabel: null, note: null,
    });
  });

  it('writes no note when an address survives but the source block is unknown', () => {
    const out = brokerAddressPrefill(broker({
      address_line1: f('5 Somewhere Rd'), address_source: null,
    }), parsedAt);
    expect(out.note).toBeNull();
    expect(out.sourceLabel).toBeNull();
  });
});

describe('appendNote', () => {
  it('appends after existing notes without overwriting', () => {
    expect(appendNote('Pays slow.', 'Address captured from Bill To block on rate confirmation, 8/21/26.'))
      .toBe('Pays slow.\nAddress captured from Bill To block on rate confirmation, 8/21/26.');
  });

  it('returns the note alone when notes are empty', () => {
    expect(appendNote('', 'note line')).toBe('note line');
    expect(appendNote(null, 'note line')).toBe('note line');
  });

  it('leaves notes untouched when there is no note to add', () => {
    expect(appendNote('Pays slow.', null)).toBe('Pays slow.');
  });

  it('does not duplicate a note already present', () => {
    expect(appendNote('note line', 'note line')).toBe('note line');
  });
});
