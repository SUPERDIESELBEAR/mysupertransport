/**
 * NO SCREEN BUILDS ITS OWN DRIVER PICKER.
 *
 * THIS GUARD IS GREEN. It shipped after the last hand-built driver Select was
 * converted, so any file it names from now on is NEW — a picker that lists
 * drivers in a plain `Select` instead of the shared searchable
 * `src/components/shared/DriverCombobox.tsx`. It is a live defect, not
 * inherited noise.
 *
 * WHY IT EXISTS. Three times in one week a shared component was rebuilt by
 * hand instead of reused: the Driver Fuel Detail picker, the Inspection Program
 * unit resolver, and the 51-option state list in Add Driver. A roster of 59
 * drivers (154 including inactive) in an unsearchable dropdown is the shape
 * that keeps coming back.
 *
 * SHAPE, NOT A CENSUS. It matches a driver collection mapped directly into
 * `<SelectItem>`. It does not care how many screens exist, so adding screens
 * never breaks it. A picker that legitimately needs a plain Select goes in
 * ALLOWLIST with a reason — the same shape as the reachability guards.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** file -> why a plain Select is correct there. */
const ALLOWLIST: Record<string, string> = {};

const PATTERN =
  /(operators|drivers)[A-Za-z]*(\?\?\s*\[\])?\s*\.map\(\s*\(?\w+\)?\s*=>\s*\(?\s*<SelectItem/;

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      tsxFiles(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('driver pickers use the shared searchable component', () => {
  it('finds no driver roster mapped into a plain Select', () => {
    const findings = tsxFiles('src')
      .filter(f => !(f in ALLOWLIST))
      .filter(f => PATTERN.test(readFileSync(f, 'utf8')));
    expect(findings).toEqual([]);
  });

  it('names a reason for every allowlisted picker', () => {
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
    }
  });
});
