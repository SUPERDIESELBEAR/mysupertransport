import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the resume-link fix of 2026-09-03.
 *
 * These assert the RESOLVED (newest) definition of
 * `consume_application_resume_token` in the migration set, per the standing
 * newest-definition rule. Live behaviour is exercised separately against the
 * database; this is the fast pre-commit approximation.
 */

const MIG_DIR = join(process.cwd(), 'supabase/migrations');

function newestDefinition(): { file: string; body: string } {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIG_DIR, f), 'utf8');
    const idx = sql.toLowerCase().indexOf('function public.consume_application_resume_token');
    if (idx === -1) continue;
    if (!/create\s+or\s+replace\s+function\s+public\.consume_application_resume_token/i.test(sql)) continue;
    const start = sql.toLowerCase().lastIndexOf('create', idx);
    const end = sql.indexOf('$function$;', start);
    found = { file: f, body: sql.slice(start, end === -1 ? undefined : end + 11) };
  }
  if (!found) throw new Error('consume_application_resume_token not found in migrations');
  return found;
}

describe('consume_application_resume_token — resolved definition', () => {
  const { body } = newestDefinition();

  it('is SECURITY DEFINER pinned to public, extensions', () => {
    expect(body).toMatch(/SECURITY DEFINER/i);
    expect(body).toMatch(/SET search_path TO 'public',\s*'extensions'/i);
  });

  it('names the reuse window as a constant, not a magic number inline', () => {
    expect(body).toMatch(/c_reuse_window\s+CONSTANT\s+interval\s*:=\s*interval\s*'30 minutes'/i);
    // The literal must appear exactly once — in the constant.
    expect(body.match(/interval\s*'30 minutes'/gi)?.length).toBe(1);
  });

  it('refuses an expired token BEFORE it consults the reuse window', () => {
    const expiredAt = body.indexOf("RAISE EXCEPTION 'token_expired'");
    const windowAt = body.indexOf('c_reuse_window');
    const constAt = body.indexOf('c_reuse_window CONSTANT');
    expect(expiredAt).toBeGreaterThan(-1);
    // the first use of the constant after its declaration is the comparison
    const compareAt = body.indexOf('c_reuse_window', constAt + 10);
    expect(expiredAt).toBeLessThan(compareAt);
    expect(windowAt).toBeGreaterThan(-1);
  });

  it('raises token_used only outside the window', () => {
    expect(body).toMatch(
      /used_at IS NOT NULL AND v_row\.used_at < now\(\) - c_reuse_window\s*THEN\s*RAISE EXCEPTION 'token_used'/i,
    );
  });

  it('writes used_at only AFTER the application row resolves', () => {
    const appNotFound = body.indexOf("RAISE EXCEPTION 'application_not_found'");
    const update = body.indexOf('UPDATE public.application_resume_tokens');
    expect(appNotFound).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(appNotFound);
  });

  it('stamps first use only, so reuse does not slide the window forward', () => {
    expect(body).toMatch(/IF v_row\.used_at IS NULL THEN\s*UPDATE public\.application_resume_tokens/i);
  });
});

describe('the three functions this pass must not touch', () => {
  it('get_application_by_draft_token, save_application_draft and submit_application_draft are untouched', () => {
    const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
    // Newest migration is the one this pass added; it must not redefine them.
    const newest = files[files.length - 1];
    const sql = readFileSync(join(MIG_DIR, newest), 'utf8').toLowerCase();
    for (const fn of [
      'get_application_by_draft_token',
      'save_application_draft',
      'submit_application_draft',
    ]) {
      expect(sql.includes(`function public.${fn}`), `${newest} must not redefine ${fn}`).toBe(false);
    }
  });
});
