/**
 * Share-token throttling (Pass B §7), read against the live catalog.
 *
 * FINDING, RECORDED: §7 was specified with per-IP and per-token limiting and a
 * deliberate fail-mode split, and neither was ever shipped. `resolve_share_token`
 * logged every access and counted none of them, and no edge function fronted
 * it. That is fixed here for the per-token half, for every scope.
 *
 * STILL OPEN: `inspection_document` has no per-IP limit. Those tokens are the
 * printed QR stickers and the browser calls the resolver directly; adding the
 * per-IP limit means moving every already-printed sticker's resolution behind
 * an edge function. Only `officer_packet` goes through the new endpoint today.
 *
 * These assertions are deliberately read-only. Driving the throttle for real
 * needs 60 access rows against a live token, which rate-limits a sticker that
 * is physically in a truck — that was done once by hand during the build and
 * the probe rows were removed by migration afterwards.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  console.warn('\n  ##  share-token-throttle.test.ts DID NOT RUN — no PGHOST.  ##\n');
}

function psql(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function defOf(name: string): string {
  return psql(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '${name}'`);
}

const describeLive = HAS_DB ? describe : describe.skip;

describeLive('share token throttling', () => {
  it('counts accesses per token and fails closed', () => {
    const gate = defOf('_share_token_gate');
    expect(gate, 'the gate must exist').toContain('share_token_access_log');
    // The count is over a window, not all time.
    expect(gate).toMatch(/accessed_at > now\(\) - interval '1 hour'/);
    // FAIL CLOSED: an unreadable counter must produce a refusal, not a serve.
    expect(gate).toMatch(/EXCEPTION WHEN others THEN\s+v_recent := c_limit \+ 1;/);
    expect(gate).toContain("v_outcome := 'throttled'");
  });

  it('applies the gate to every scope, not just officer packets', () => {
    expect(defOf('resolve_share_token')).toContain('_share_token_gate');
    expect(defOf('resolve_officer_packet_token')).toContain('_share_token_gate');
  });

  it('does not change expiry semantics', () => {
    const gate = defOf('_share_token_gate');
    // Unchanged branch: a NULL expiry is never expired. Every QR sticker
    // already printed depends on this.
    expect(gate).toContain('v_tok.expires_at IS NOT NULL AND v_tok.expires_at <= now()');
    expect(gate).not.toMatch(/UPDATE\s+public\.share_tokens/i);

    const nullExpiry = Number(psql(
      "SELECT count(*) FROM public.share_tokens WHERE scope = 'inspection_document' AND expires_at IS NULL",
    ).trim());
    expect(nullExpiry).toBeGreaterThan(0);

    // And one of them still resolves through the new path.
    const resolved = Number(psql(`SELECT count(*) FROM public.resolve_share_token(
      (SELECT token FROM public.share_tokens
        WHERE scope = 'inspection_document' AND expires_at IS NULL AND revoked_at IS NULL
        LIMIT 1))`).trim());
    expect(resolved).toBe(1);
  });

  it('keeps the gate and the officer resolver off the public API', () => {
    for (const fn of ['_share_token_gate', 'resolve_officer_packet_token']) {
      const anon = psql(
        `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='${fn}'`,
      ).trim();
      expect(anon, `${fn} must not be anon-executable`).toBe('f');
    }
    // The inspection_document resolver stays public: that is the QR sticker path.
    expect(psql(`SELECT has_function_privilege('anon', p.oid, 'EXECUTE') FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='resolve_share_token'`).trim()).toBe('t');
  });

  it('per-IP limiting lives in the officer endpoint and fails open', () => {
    const source = execFileSync('cat', ['supabase/functions/officer-packet-download/index.ts'], { encoding: 'utf8' });
    expect(source).toContain('IP_LIMIT');
    // The catch returns false: a broken counter must not deny a real officer.
    expect(source).toMatch(/catch\s*{\s*return false; \/\/ fail open/);
  });
});