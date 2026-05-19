import { CORRECTION_FIELDS, getFieldDef, type CorrectionFieldDef } from '@/lib/applicationCorrections';
import type { EmployerRecord } from '@/components/application/types';

export interface DiffEntry {
  field_path: string;
  field_label: string;
  old_value: unknown;
  new_value: unknown;
  kind: CorrectionFieldDef['kind'];
}

function normalize(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'string') return v.trim();
  return v;
}

function equalScalar(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a) ?? null) === JSON.stringify(normalize(b) ?? null);
}

function equalArrayUnordered(a: unknown, b: unknown): boolean {
  const A = Array.isArray(a) ? [...a].sort() : [];
  const B = Array.isArray(b) ? [...b].sort() : [];
  return JSON.stringify(A) === JSON.stringify(B);
}

function equalEmployers(a: unknown, b: unknown): boolean {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  if (A.length !== B.length) return false;
  return JSON.stringify(A) === JSON.stringify(B);
}

/**
 * Compute the field-level diff between the original application snapshot and
 * the staff's edited draft, scoped to the whitelisted correction fields.
 */
export function computeApplicationDiff(
  snapshot: Record<string, unknown>,
  draft: Record<string, unknown>,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const def of CORRECTION_FIELDS) {
    const a = snapshot[def.path];
    const b = draft[def.path];
    let same = false;
    if (def.kind === 'multiselect') same = equalArrayUnordered(a, b);
    else if (def.kind === 'employers') same = equalEmployers(a, b);
    else same = equalScalar(a, b);
    if (!same) {
      out.push({
        field_path: def.path,
        field_label: def.label,
        old_value: a ?? null,
        new_value: b ?? null,
        kind: def.kind,
      });
    }
  }
  return out;
}

/** Build a short human-readable diff for an employer row (used by approval UI). */
export interface EmployerDiff {
  kind: 'added' | 'removed' | 'edited' | 'unchanged';
  index: number;
  old?: EmployerRecord;
  next?: EmployerRecord;
  changedFields: (keyof EmployerRecord)[];
}

const EMPLOYER_FIELDS: (keyof EmployerRecord)[] = [
  'name','city','state','position','reason_leaving','cmv_position','start_date','end_date','email',
];

function employerKey(e: EmployerRecord): string {
  return `${(e.name || '').toLowerCase().trim()}|${(e.start_date || '').trim()}`;
}

/**
 * Align two employer arrays by (name + start_date), falling back to index, and
 * report added/removed/edited rows for the applicant-facing diff viewer.
 */
export function diffEmployers(
  oldList: EmployerRecord[] | undefined,
  newList: EmployerRecord[] | undefined,
): EmployerDiff[] {
  const oldArr = Array.isArray(oldList) ? oldList : [];
  const newArr = Array.isArray(newList) ? newList : [];
  const result: EmployerDiff[] = [];
  const usedOld = new Set<number>();

  newArr.forEach((next, i) => {
    let matchIdx = oldArr.findIndex((o, oi) => !usedOld.has(oi) && employerKey(o) === employerKey(next));
    if (matchIdx === -1) {
      // fall back to same index if untouched key
      if (oldArr[i] && !usedOld.has(i) && employerKey(oldArr[i]) === employerKey(next)) matchIdx = i;
    }
    if (matchIdx === -1) {
      result.push({ kind: 'added', index: i, next, changedFields: [] });
      return;
    }
    usedOld.add(matchIdx);
    const old = oldArr[matchIdx];
    const changed = EMPLOYER_FIELDS.filter((f) => (old?.[f] ?? '') !== (next?.[f] ?? ''));
    result.push({
      kind: changed.length ? 'edited' : 'unchanged',
      index: i,
      old,
      next,
      changedFields: changed,
    });
  });

  oldArr.forEach((old, oi) => {
    if (!usedOld.has(oi)) result.push({ kind: 'removed', index: oi, old, changedFields: [] });
  });

  return result;
}

export { getFieldDef };