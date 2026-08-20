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
 * THESE ASSERTIONS ARE READ-ONLY, AND THAT IS A CONSTRAINT, NOT A GAP TO BE
 * "IMPROVED" LATER. Driving the throttle for real means writing 60 access rows
 * against a token that exists in production. Every inspection_document token
 * is a QR sticker physically stuck in a truck; rate-limiting one means a real
 * officer at a real roadside gets nothing. That happened once by hand during
 * the build (see docs/eld-officer-packet-sharing.md, "Near-miss"), and the
 * probe rows were deleted immediately. Do not add a test that writes to
 * share_token_access_log, share_tokens or officer_packet_links against this
 * database. Behavioural coverage of the counter belongs on a disposable
 * instance, not here.
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

    // The ceiling is 60 served opens/hour. Worst legitimate hour measured
    // against: ~10-20 opens for a QR sticker at a shop or scale house.
    expect(gate).toMatch(/c_limit constant bigint := 60;/);
  });

  it('counts served opens only, so a refusal cannot extend the lockout', () => {
    const gate = defOf('_share_token_gate');
    // Counting 'throttled' too meant an attacker hammering a link kept it dark
    // forever and the driver could never wait it out.
    expect(gate).toMatch(/l\.outcome = 'ok'/);
    expect(gate).not.toMatch(/l\.outcome IN \('ok', 'throttled'\)/);
    // Throttled attempts are still recorded — the log is the abuse evidence.
    expect(gate).toMatch(/INSERT INTO public\.share_token_access_log/);
  });

  it('surfaces throttled to the callers so they can say "try again"', () => {
    for (const fn of ['resolve_share_token', 'resolve_officer_packet_token']) {
      expect(defOf(fn), `${fn} must distinguish throttled`).toMatch(/'throttled'/);
    }
    // The ok-path shape for the QR sticker viewer is unchanged.
    const cols = psql(`SELECT string_agg(a, ',' ORDER BY o) FROM (
      SELECT unnest(p.proargnames) a, generate_subscripts(p.proargnames, 1) o
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='resolve_share_token') s`).trim();
    for (const c of ['id', 'name', 'file_url', 'expires_at', 'outcome']) {
      expect(cols).toContain(c);
    }
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

    // The resolve used to be executed here. It no longer is, for two reasons,
    // and neither is "the sandbox cannot run it" alone:
    //
    //   1. The sandbox psql role is deliberately barred from EXECUTE, so the
    //      call returned `permission denied for function resolve_share_token`.
    //      Granting EXECUTE to work around that is forbidden.
    //   2. Re-pointing it at the REST RPC endpoint would have worked — and
    //      would have been WRONG. `_share_token_gate` INSERTs into
    //      share_token_access_log on EVERY outcome, including 'ok'. Executing
    //      the resolver here writes a row against a production token and burns
    //      one of that QR sticker's 60 served opens per hour. That is exactly
    //      the write the header of this file forbids.
    //
    // So the NULL-expiry ok-path is asserted structurally instead: the resolver
    // delegates to the gate, and the gate's only expiry branch treats NULL as
    // never-expired (asserted above). What is NOT covered is a real end-to-end
    // resolve. See the banner below.
    const resolver = defOf('resolve_share_token');
    expect(resolver).toContain('_share_token_gate');
    // Anything the gate does not call 'ok' returns nothing; only 'ok' reaches
    // the per-scope SELECT that yields the row.
    expect(resolver).toMatch(/v_gate\.outcome IS DISTINCT FROM 'ok'/);
    expect(resolver).toMatch(/'ok'::text/);
  });

  it('DOES NOT execute the resolver end-to-end, and says so', () => {
    console.warn(
      [
        '',
        '  ############################################################',
        '  #  share-token-throttle: END-TO-END RESOLVE DID NOT RUN    #',
        '  #                                                          #',
        '  #  resolve_share_token is NOT executed by this suite.      #',
        '  #  The sandbox psql role cannot EXECUTE functions, and     #',
        '  #  resolving over REST would write a share_token_access_log #',
        '  #  row against a real printed QR sticker and consume one    #',
        '  #  of its 60 served opens/hour.                             #',
        '  #                                                          #',
        '  #  A green run here is evidence about the FUNCTION BODIES   #',
        '  #  and GRANTS only. It is NOT evidence that a token         #',
        '  #  resolves. That belongs on a disposable instance.         #',
        '  ############################################################',
        '',
      ].join('\n'),
    );
    expect(true).toBe(true);
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

  it('per-IP limiting lives in the officer endpoint, fails open, and is documented as weak', () => {
    const source = execFileSync('cat', ['supabase/functions/officer-packet-download/index.ts'], { encoding: 'utf8' });
    expect(source).toContain('IP_LIMIT');
    // The catch returns false: a broken counter must not deny a real officer.
    expect(source).toMatch(/catch\s*{\s*return false; \/\/ fail open/);
    // In-isolate and therefore not a control. The comment must keep saying so.
    expect(source).toMatch(/isolate/i);
    // Throttled is a 429, not a 404 — a valid link must not read as dead.
    expect(source).toContain('429');
    expect(source).toContain("row?.outcome === 'throttled'");
  });
});