/**
 * One-off repair for `load_references` rows predating the `unclassified` class.
 *
 * Deliberately NOT a SQL migration. The rule that decides whether a stored
 * label is unrecognised is `classifyReferenceLabel`, including its prefix
 * fallback and `labelKey` normalization; reimplementing that in SQL creates a
 * second copy that drifts from the first. This imports the real function.
 *
 * Usage — the read and the write both go through the tooling that already has
 * the right privileges, so this stage only decides:
 *
 *   1. Dump the candidate rows:
 *        select r.id, r.load_id, r.reference_class, r.label, r.value, r.value_key,
 *               r.created_at,
 *               (select count(*) from load_reference_citations c
 *                  where c.reference_id = r.id) as citation_count
 *        from load_references r;
 *   2. bun scripts/reference-backfill.ts rows.json
 *   3. Run the emitted SQL. Every deletion also writes a `load_change_history`
 *      row naming this backfill, so no reference disappears unattributably.
 */
import { readFileSync } from 'node:fs';
import {
  backfillHistoryRow, planReferenceBackfill, type BackfillRow,
} from '../src/lib/referenceBackfill';

const path = process.argv[2];
if (!path) {
  console.error('usage: bun scripts/reference-backfill.ts <rows.json>');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(path, 'utf8')) as BackfillRow[];
const plan = planReferenceBackfill(rows);

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);

console.error(`rows read:              ${rows.length}`);
console.error(`to reclassify:          ${plan.reclassify.length}`);
console.error(`duplicates to collapse: ${plan.remove.length}`);
console.error(`no-label sentinels left alone: ${plan.sentinelsLeftAlone}`);

if (!plan.reclassify.length && !plan.remove.length) {
  console.error('nothing to do.');
  process.exit(0);
}

console.log('begin;');
plan.reclassify.forEach(a => {
  console.log(
    `update load_references set reference_class = 'unclassified' where id = ${q(a.id)}; `
    + `-- ${a.label}: ${a.value}`,
  );
});
plan.remove.forEach(a => {
  const h = backfillHistoryRow(a);
  console.log(
    'insert into load_change_history (load_id, field_path, previous_value, new_value, '
    + 'is_financial, reason, change_source) values ('
    + `${q(h.load_id)}, ${q(h.field_path)}, ${q(h.previous_value)}, null, false, `
    + `${q(h.reason)}, ${q(h.change_source)});`,
  );
  console.log(`delete from load_references where id = ${q(a.id)}; -- kept ${a.kept_id}`);
});
console.log('commit;');
