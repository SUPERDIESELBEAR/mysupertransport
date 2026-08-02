import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Notification priority values must be ones the check constraint allows.
 *
 * `notify_rods_correction_request()` inserted `priority = 'high'`. The
 * constraint does not allow 'high', so every staff correction request failed
 * at the trigger — the request looked filed and the driver was never told.
 * A literal that the database will reject is a defect the type system cannot
 * see, so it is checked here, from the constraint itself.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const FUNCTIONS_DIR = path.resolve(__dirname, '../../supabase/functions');

function migrationSql(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
}

/** The allowed set, taken from the LAST definition of the check constraint. */
function allowedPriorities(): string[] {
  let allowed: string[] | null = null;
  for (const sql of migrationSql()) {
    const defs = sql.match(/notifications_priority_check\s+CHECK\s*\(([^)]*)\)/gi) ?? [];
    for (const def of defs) {
      const found = [...def.matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);
      if (found.length) allowed = [...new Set(found)];
    }
  }
  if (!allowed) throw new Error('No notifications_priority_check definition found in migrations.');
  return allowed;
}

function walkSql(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkSql(full);
    return /\.(sql|ts)$/.test(e.name) ? [full] : [];
  });
}

describe('notification priority literals', () => {
  const allowed = allowedPriorities();

  it('reads a non-empty allowed set from the constraint', () => {
    expect(allowed.length).toBeGreaterThan(0);
  });

  it('no migration or edge function writes a priority outside it', () => {
    const files = [...walkSql(MIGRATIONS_DIR), ...walkSql(FUNCTIONS_DIR)];
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (text.includes('notifications_priority_check')) continue;
      const literals = [
        ...text.matchAll(/priority\s*(?::|=|=>)\s*'([a-z_]+)'/gi),
        ...text.matchAll(/priority["']?\s*:\s*["']([a-z_]+)["']/gi),
      ].map((m) => m[1]);
      for (const value of literals) {
        if (!allowed.includes(value)) offenders.push(`${path.basename(file)}: '${value}'`);
      }
    }
    expect({ allowed, offenders }).toEqual({ allowed, offenders: [] });
  });
});
