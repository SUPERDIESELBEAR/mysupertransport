import { describe, expect, it } from 'vitest';
import { quotesFor } from '@/components/dispatch/loadForm/VerbatimSourceRows';

/**
 * The origin rows exist to answer one question on Nationwide: did the stored
 * value recover the dollar amount and the email the model dropped. The quoted
 * window is that answer, so it has to render when both are present.
 */
describe('quotesFor', () => {
  const stored = [
    'Detention billed after 2 hours. Rate is $1,600.00 all in, no exceptions.',
    'Email invoices to Support@triumphpay.freshdesk.com within 24 hours of delivery.',
  ].join(' ');

  it('quotes a window around both the dollar amount and the email', () => {
    const q = quotesFor(stored);
    expect(q.map(x => x.label)).toEqual(['dollar amount', 'email address']);
    expect(q[0].match).toBe('$1,600.00');
    expect(q[0].before).toContain('Rate is');
    expect(q[1].match).toBe('Support@triumphpay.freshdesk.com');
  });

  it('returns nothing to quote when neither is present', () => {
    expect(quotesFor('DO NOT STACK. Driver assist required.')).toEqual([]);
  });

  it('marks elision when the match sits inside a long block', () => {
    const long = `${'x'.repeat(400)} $500.00 ${'y'.repeat(400)}`;
    const [q] = quotesFor(long);
    expect(q.before.startsWith('…')).toBe(true);
    expect(q.after.endsWith('…')).toBe(true);
  });
});
