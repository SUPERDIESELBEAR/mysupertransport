import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { roadsideDb } from '@/lib/eld/offline/db';
import { enqueue, enqueueCoalesced } from '@/lib/eld/offline/queue/store';

/**
 * Every queued payload must carry `operator_id`.
 *
 * `reportTerminal` addresses its alert by operator. A payload without one
 * produces an alert nobody can be told about: the console logged
 * "alert has no operator_id and cannot be delivered" and the office heard
 * nothing about a certification the server had refused.
 *
 * The base type `SyncPayload` is the real guarantee — a new `SyncKind` cannot
 * typecheck without it. This test is the backstop for the payload assembled
 * loosely and cast on its way in, which typing cannot see, and it runs in
 * `test:guards` so it is not a test somebody has to remember.
 */
const SRC = path.resolve(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

beforeEach(async () => {
  await roadsideDb.open();
  await roadsideDb.sync_queue.clear();
});

describe('queued payloads carry operator_id', () => {
  it('refuses an enqueue whose payload omits it', async () => {
    await expect(enqueue({
      kind: 'upload_rods_pdf',
      payload: { log_date: '2026-08-01', path: 'x.pdf' } as never,
    })).rejects.toThrow(/operator_id/);
    expect(await roadsideDb.sync_queue.count()).toBe(0);
  });

  it('refuses a coalesced enqueue whose payload omits it', async () => {
    await expect(enqueueCoalesced({
      kind: 'save_draft_day',
      coalesce_key: 'save_draft_day:2026-08-01',
      payload: { log_date: '2026-08-01' } as never,
    })).rejects.toThrow(/operator_id/);
    expect(await roadsideDb.sync_queue.count()).toBe(0);
  });

  it('accepts one that carries it', async () => {
    const entry = await enqueue({
      kind: 'upload_rods_pdf',
      payload: { operator_id: 'op-1', log_date: '2026-08-01', path: 'x.pdf' },
    });
    expect(entry.payload.operator_id).toBe('op-1');
  });

  it('every enqueue call site in src/ names operator_id in its payload', () => {
    // Source-level sweep, because a producer that never runs under test still
    // ships. Any literal `payload: {` inside an enqueue/queueEntry call has to
    // mention operator_id — by key or by spreading a payload that carries it.
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (!/\b(enqueue|enqueueCoalesced|queueEntry)\s*\(/.test(text)) continue;
      const calls = text.match(/payload:\s*\{[\s\S]{0,600}?\n\s*\},/g) ?? [];
      for (const call of calls) {
        if (!call.includes('operator_id') && !call.includes('...payload')) {
          offenders.push(`${path.relative(SRC, file)}: ${call.slice(0, 80).replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
