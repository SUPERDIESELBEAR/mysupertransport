/**
 * Pass 5 (P80/P81): the send function's rules. The pure rules are imported
 * from the exact file the edge function runs; the function's gates are
 * pinned against its source so a reorder or a widened role fails here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  MAX_TOTAL_BYTES, normalizeEmailList, resolveRecipients, buildSubject, buildFromAddress,
  combinedFileName, separateFileName, sizeRefusal, buildBody,
} from '../../supabase/functions/_shared/invoice/sendRules';

const src = fs.readFileSync('supabase/functions/send-invoice-packet/index.ts', 'utf8');
const saved = { to: ['sff@example.com'], cc: ['acct@example.com'] };

describe('recipients', () => {
  it('uses the saved lists by default', () => {
    expect(resolveRecipients(saved, {})).toEqual(saved);
  });
  it('an edited list applies to this send only and is validated like the settings', () => {
    expect(resolveRecipients(saved, { to: [' Other@Example.com '] })).toEqual({ to: ['other@example.com'], cc: saved.cc });
    expect(() => resolveRecipients(saved, { to: ['bad'] })).toThrow('"bad" is not a valid email address.');
    expect(() => resolveRecipients(saved, { cc: ['a@b.co', 'A@b.co'] })).toThrow('CC already lists a@b.co.');
    expect(() => normalizeEmailList(Array.from({ length: 11 }, (_, i) => `a${i}@b.co`), 'Send-to'))
      .toThrow('Send-to can hold at most 10 addresses.');
    expect(() => resolveRecipients(saved, { cc: ['sff@example.com'] })).toThrow('both a send-to and a CC');
  });
  it('refuses an empty send-to', () => {
    expect(() => resolveRecipients({ to: [], cc: [] }, {})).toThrow('no send-to address');
  });
  it('a test goes ONLY to the one address, never the saved lists', () => {
    expect(resolveRecipients(saved, { to: ['x@y.co'], cc: ['z@y.co'] }, 'marc@mysupertransport.com'))
      .toEqual({ to: ['marc@mysupertransport.com'], cc: [] });
  });
});

describe('email shape', () => {
  it('subject, with the [TEST] prefix on a test', () => {
    const s = { invoiceNumber: 'ST26-0001', brokerName: 'Beta', orderNumber: null, remitToName: 'Carrier LLC' };
    expect(buildSubject(s)).toBe('Invoice ST26-0001 — Beta — Order - — Carrier LLC');
    expect(buildSubject(s, true)).toBe('[TEST] Invoice ST26-0001 — Beta — Order - — Carrier LLC');
  });
  it('from uses the remit-to name and the configured domain; no carrier hard-coded', () => {
    expect(buildFromAddress('Carrier LLC', 'example.com')).toBe('Carrier LLC Billing <billing@example.com>');
    expect(src).not.toMatch(/SUPERTRANSPORT/);
  });
  it('file names', () => {
    expect(combinedFileName('ST26-0001', 'BETA-4411', 'ST-1')).toBe('ST26-0001 - BETA-4411.pdf');
    expect(combinedFileName('ST26-0001', null, 'ST-1')).toBe('ST26-0001 - ST-1.pdf');
    expect(separateFileName(2, 'ST26-0001', 'bol')).toMatch(/^02 ST26-0001/);
  });
  it('refuses over 35 MB, naming the largest', () => {
    expect(sizeRefusal([{ name: 'a.pdf', bytes: 1000 }])).toBeNull();
    const r = sizeRefusal([{ name: 'small.pdf', bytes: 10 }, { name: 'huge.pdf', bytes: MAX_TOTAL_BYTES }]);
    expect(r).toMatch(/over the 35 MB limit/);
    expect(r).toMatch(/huge\.pdf/);
  });
  it('a test body puts the missing items at the top', () => {
    const { text } = buildBody({
      invoiceNumber: 'ST26-0001', loadNumber: 'ST-1', orderNumber: null, brokerName: 'B', amount: 1875,
      remitToName: 'C', attachments: [{ name: 'x.pdf', bytes: 1 }], missing: ['Rate confirmation'],
    });
    expect(text.indexOf('Rate confirmation')).toBeLessThan(text.indexOf('Invoice: ST26-0001'));
  });
});

describe('function gates (source order)', () => {
  it('dispatcher, management, owner may send (P81); tests are management/owner only', () => {
    expect(src).toContain("const ROLES = ['dispatcher', 'management', 'owner']");
    expect(src).toContain("const TEST_ROLES = ['management', 'owner']");
  });
  it('401 before role, 404 for unknown or other-company invoices', () => {
    expect(src.indexOf("'Unauthorized' }, 401")).toBeLessThan(src.indexOf("'Forbidden' }, 403"));
    expect(src).toMatch(/\.eq\('id', invoiceId\)\.eq\('company_id', companyId\)/);
  });
  it('a real send refuses when readiness is not empty; a test skips it', () => {
    expect(src).toMatch(/if \(!testRecipient && missing\.length\)/);
  });
  it('a dry run returns before any provider call or record', () => {
    expect(src.indexOf('if (dryRun) return')).toBeLessThan(src.indexOf('api.resend.com'));
    expect(src.indexOf('if (dryRun) return')).toBeLessThan(src.indexOf("rpc('record_invoice_send'"));
  });
  it("a test's attachments are not saved", () => {
    expect(src).toMatch(/if \(!sendError && !testRecipient\)/);
  });
  it('the packet comes from the shared builder, not an HTTP call to build-invoice-packet', () => {
    expect(src).toContain("from '../_shared/invoice/packet.ts'");
    expect(src).not.toContain('functions/v1/build-invoice-packet');
    const preview = fs.readFileSync('supabase/functions/build-invoice-packet/index.ts', 'utf8');
    expect(preview).toContain("from '../_shared/invoice/packet.ts'");
  });
});

describe('invoice_sends migration', () => {
  const sql = fs.readFileSync('drizzle/migrations/0074_invoice_sends.sql', 'utf8');
  it('record_invoice_send is service-role only and no client write policy exists', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_invoice_send[\s\S]*FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_invoice_send[\s\S]*TO service_role/i);
    // The only FOR ALL policy is the RESTRICTIVE tenant filter, which grants nothing.
    const permissive = sql.match(/CREATE POLICY[^;]*;/gi)!.filter(p => !/AS RESTRICTIVE/i.test(p));
    expect(permissive.every(p => /FOR SELECT/i.test(p))).toBe(true);
  });
  it('only the first non-test sent row sets submitted_at', () => {
    expect(sql).toMatch(/p_status = 'sent' AND NOT coalesce\(p_is_test,false\) AND v_inv\.submitted_at IS NULL/);
  });
});
