import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  classifyError, classifyStringFallbackCount, resetClassifyStringFallbackCount, extractSqlState,
} from '../queue/classify';

function pgErr(code: string, message: string) {
  return { code, message, details: null, hint: null };
}

describe('classifyError', () => {
  beforeEach(() => {
    resetClassifyStringFallbackCount();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('rejects on a class-P0 SQLSTATE without touching message text', () => {
    for (const code of ['P0002', 'P0013', 'P0023', 'P0030', 'P0031', 'P0040', 'P0041']) {
      const r = classifyError(pgErr(code, 'opaque text the client must not parse'));
      expect(r.klass, code).toBe('rejected');
    }
    expect(classifyStringFallbackCount()).toBe(0);
  });

  it('counts a message-text classification as a fallback hit', () => {
    const r = classifyError(new Error('rods_duplicate_certified_date: already certified'));
    expect(r.klass).toBe('rejected');
    expect(classifyStringFallbackCount()).toBe(1);
  });

  it('parks an unnamed 4xx as server, and treats 5xx and 429 as network', () => {
    expect(classifyError({ status: 400, message: 'bad request' }).klass).toBe('server');
    expect(classifyError({ status: 503, message: 'upstream' }).klass).toBe('network');
    expect(classifyError({ status: 429, message: 'slow down' }).klass).toBe('network');
    expect(classifyStringFallbackCount()).toBe(0);
  });

  it('does not treat a raw 23505 as a rejection', () => {
    expect(classifyError(pgErr('23505', 'duplicate key value')).klass).toBe('server');
  });

  it('reads the SQLSTATE from a nested error envelope', () => {
    expect(extractSqlState({ error: { code: 'P0021' } })).toBe('P0021');
    expect(extractSqlState({ code: 'nope' })).toBeNull();
  });
});
