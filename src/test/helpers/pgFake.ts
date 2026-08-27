import { resolveMigrationFunctions, stagedMigrationSql, stripComments } from './migrationFunctions';

/**
 * A Postgres-SHAPED fake for the actor-stamping tests.
 *
 * Two things make it different from the hand-written mocks the suite already
 * has, and both are the point:
 *
 * 1. It enforces the real `profiles(id)` foreign keys. Passing an auth uid
 *    where a profile id is required raises 23503 here, exactly as the database
 *    does. The existing mocks accept any uuid, which is why a write that
 *    stamped `auth.uid()` passed its unit test and failed in production.
 * 2. Its RPC behaviour is DERIVED FROM THE CHECKED-IN SQL, not reimplemented in
 *    TypeScript. It reads the migration set, resolves each function to its
 *    final definition, and works out which expression that definition assigns
 *    to each actor column. So the fake tells the truth about what the database
 *    will do, and a regression in the SQL fails the test.
 *
 * The seeded profile deliberately has `id` !== `user_id`. A fake where the two
 * coincide cannot detect the bug this file exists for.
 */

export const AUTH_UID = '5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe';
export const PROFILE_ID = 'b1e0f0aa-1111-4444-8888-0c0ffee00001';

export interface Row { [k: string]: unknown }

/** Columns whose value must be a `profiles.id`. */
export const PROFILE_FK_COLUMNS: Record<string, string[]> = {
  detention_claims: ['reported_to', 'notified_by', 'created_by', 'updated_by'],
  load_change_history: ['changed_by'],
  load_references: ['created_by'],
  load_status_history: ['changed_by'],
  load_stops: ['arrival_recorded_by', 'departure_recorded_by'],
  loads: ['created_by', 'updated_by', 'dispatcher_id'],
  parser_diagnostics: ['created_by', 'resolved_by'],
};

export class FkViolation extends Error {
  code = '23503';
  constructor(table: string, column: string, value: unknown) {
    super(
      `insert or update on table "${table}" violates foreign key constraint ` +
        `"${table}_${column}_fkey" — Key (${column})=(${String(value)}) is not present in table "profiles".`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Reading the actor expression out of the checked-in SQL              */
/* ------------------------------------------------------------------ */

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export type ActorKind = 'profile' | 'auth_uid' | 'unknown';

export function classifyActorExpression(expr: string, body = ''): ActorKind {
  const e = expr.toLowerCase().trim();
  if (/current_profile_id\s*\(/.test(e)) return 'profile';
  if (/auth\.uid\s*\(/.test(e)) return 'auth_uid';
  // plpgsql assigns through a local, either at declaration
  // (`v_profile uuid := public.current_profile_id();`) or in the body
  // (`v_profile := public.current_profile_id();`). Both forms occur in the
  // checked-in SQL, and reading only the first made `create_load_with_stops`
  // look like it stamped nobody.
  const ident = /^([a-z_][a-z0-9_]*)$/.exec(e)?.[1];
  if (ident && body) {
    const decl = new RegExp(`\\b${ident}\\s+uuid\\s*:=\\s*([^;]+);`, 'i').exec(body);
    if (decl) return classifyActorExpression(decl[1], '');
    const assign = new RegExp(`\\b${ident}\\s*:=\\s*([^;]+);`, 'i').exec(body);
    if (assign) return classifyActorExpression(assign[1], '');
  }

  return 'unknown';
}

let bodyCache: Map<string, string> | null = null;

/** Body of a function, resolved to its LAST definition across the migrations. */
export function functionBody(name: string): string | null {
  if (!bodyCache) {
    // Resolving the whole migration set is expensive; do it once per process.
    bodyCache = new Map();
    for (const f of resolveMigrationFunctions().values()) {
      bodyCache.set(f.name.replace(/^public\./, ''), stripComments(f.block));
    }
  }
  return bodyCache.get(name.replace(/^public\./, '')) ?? null;
}

/**
 * How a SQL function stamps `column` on `table` — read from its own text.
 * Covers `INSERT INTO t (cols) VALUES (exprs)` and `UPDATE t SET col = expr`.
 */
export function actorExpressionFor(
  fnName: string,
  table: string,
  column: string,
): { kind: ActorKind; expr: string } | null {
  const body = functionBody(fnName);
  if (!body) return null;
  return actorExpressionInBody(body, table, column);
}

/** Same read, against a body the caller already has. */
export function actorExpressionInBody(
  body: string,
  table: string,
  column: string,
): { kind: ActorKind; expr: string } | null {

  const insertRe = new RegExp(
    `insert\\s+into\\s+(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\)\\s*values\\s*\\(([\\s\\S]*?)\\)\\s*(?:on\\s+conflict|returning|;)`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = insertRe.exec(body)) !== null) {
    const cols = splitTop(m[1]).map(c => c.trim().toLowerCase());
    const vals = splitTop(m[2]);
    const at = cols.indexOf(column);
    if (at >= 0 && vals[at] !== undefined) {
      const expr = vals[at].trim();
      return { kind: classifyActorExpression(expr, body), expr };
    }
  }

  const setRe = new RegExp(`\\b${column}\\s*=\\s*([^,\\n]+)`, 'gi');
  const updateSection = body.slice(body.toLowerCase().indexOf(`update public.${table}`));
  const s = setRe.exec(updateSection);
  if (s) return { kind: classifyActorExpression(s[1], body), expr: s[1].trim() };

  return null;
}

/** Turns the SQL's actor expression into the uuid the fake will store. */
export function actorValue(kind: ActorKind): string | null {
  if (kind === 'profile') return PROFILE_ID;
  if (kind === 'auth_uid') return AUTH_UID;
  return null;
}


/* ------------------------------------------------------------------ */
/* Column coercion, as the save RPCs perform it                        */
/* ------------------------------------------------------------------ */

/**
 * `NULLIF(p_load->>'k','')`. Every value the load form sends is a string, and
 * the empty string means "not set" — a fake that stored `''` would report a
 * change on every field the form leaves blank.
 */
export const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v : String(v);
  return s === '' ? null : s;
};

/** `NULLIF(...,'')::numeric`. */
export const numOrNull = (v: unknown): number | null => {
  const s = txt(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const boolOrFalse = (v: unknown): boolean => v === true || v === 'true';

/** Load columns the RPCs cast to numeric. */
export const NUMERIC_LOAD_KEYS = [
  'weight_lbs', 'linehaul_rate', 'fsc_amount', 'rate_per_mile', 'rate_per_ton',
  'estimated_tons', 'total_load_value', 'loaded_miles', 'deadhead_miles',
  'reefer_temp_f', 'reefer_temp_min_f', 'reefer_temp_max_f', 'permit_cost',
  'loadout_relocation_fee', 'loadout_use_period_days',
];

const BOOLEAN_LOAD_KEYS = [
  'fsc_bundled_into_linehaul', 'reefer_precool_required', 'reefer_continuous_run',
  'is_team_load', 'is_hazmat', 'permit_required',
];

/** The keys `update_load_with_stops` treats as moving money. */
export const FINANCIAL_LOAD_KEYS = [
  'rate_type', 'linehaul_rate', 'rate_per_mile', 'rate_per_ton', 'estimated_tons',
  'fsc_bundled_into_linehaul', 'fsc_amount', 'loadout_relocation_fee', 'permit_cost',
  'permit_recovery_method', 'loaded_miles',
];

/** Every load column the save payload carries, in the RPCs' own coercions. */
export function coerceLoadColumns(p: Row): Row {
  const out: Row = {};
  Object.keys(p).forEach(k => {
    if (BOOLEAN_LOAD_KEYS.includes(k)) out[k] = boolOrFalse(p[k]);
    else if (NUMERIC_LOAD_KEYS.includes(k)) out[k] = numOrNull(p[k]);
    else out[k] = txt(p[k]);
  });
  if (out.load_type == null) out.load_type = 'standard';
  if (out.rate_type == null) out.rate_type = 'flat';
  return out;
}

/** Stop columns, minus the sequence and stop-off fields the caller decides. */
export function coerceStopColumns(s: Row): Row {
  const out: Row = {};
  ['stop_type', 'facility_id', 'facility_name', 'address_line1', 'address_line2',
    'city', 'state', 'zip', 'contact_name', 'contact_phone',
    'appointment_start', 'appointment_end', 'reference_number', 'reference_label',
    'stop_notes', 'stop_notes_verbatim'].forEach(k => { out[k] = txt(s[k]); });
  if (out.stop_type == null) out.stop_type = 'pickup';
  if (txt(s.id)) out.id = txt(s.id);
  return out;
}

/* ------------------------------------------------------------------ */
/* The client                                                          */
/* ------------------------------------------------------------------ */


export interface PgFake {
  tables: Record<string, Row[]>;
  client: unknown;
  reset(): void;
}

export function createPgFake(): PgFake {
  const tables: Record<string, Row[]> = {
    profiles: [],
    load_stops: [],
    load_references: [],
    load_reference_citations: [],
    load_change_history: [],
    loads: [],
    load_charges: [],
    load_documents: [],
    pay_policies: [],
    pay_policy_assignments: [],
    facilities: [],
    parser_diagnostics: [],
    detention_claims: [],

  };


  const seed = () => {
    Object.keys(tables).forEach(k => { tables[k].length = 0; });
    tables.profiles.push({ id: PROFILE_ID, user_id: AUTH_UID, full_name: 'Test Dispatcher' });
    tables.loads.push({ id: 'load-1', load_number: 'TEST-1' });
    // The company default pay policy, including the charge → pay class map the
    // reimbursement class is read from.
    tables.pay_policies.push({
      id: 'policy-default',
      name: 'Company default',
      is_company_default: true,
      is_active: true,
      effective_date: '2026-01-01',
      linehaul_pct: 72,
      fsc_pct: 72,
      detention_pct: 100,
      layover_pct: 100,
      stopoff_pct: 72,
      lumper_reimbursement_pct: 100,
      tonu_pct: 72,
      other_accessorial_pct: 72,
      charge_pay_classes: {
        linehaul: 'revenue', fsc: 'revenue', detention: 'revenue', stopoff: 'revenue',
        layover: 'revenue', tonu: 'revenue', other: 'revenue',
        lumper: 'revenue', reimbursement: 'reimbursement',
      },
    });
    tables.load_stops.push(
      { id: 'stop-a', load_id: 'load-1', stop_sequence: 1 },
      { id: 'stop-b', load_id: 'load-1', stop_sequence: 2 },
    );
  };
  seed();

  const enforce = (table: string, row: Row) => {
    for (const col of PROFILE_FK_COLUMNS[table] ?? []) {
      const v = row[col];
      // A null actor is allowed everywhere: the FK never rejects a null, and a
      // diagnostic must degrade to an unattributed row rather than not writing.
      if (v == null) continue;
      if (!tables.profiles.some(p => p.id === v)) throw new FkViolation(table, col, v);
    }
  };

  /**
   * `stamp_detention_claim_actor`, mirrored. The uuid it stamps is not
   * hard-coded here: it is read from the trigger's own `v_profile` assignment
   * in the checked-in SQL, so a trigger that switched to `auth.uid()` would
   * stamp the auth uid in the fake too and fail the foreign key exactly as
   * Postgres would.
   */
  const stampDetentionClaim = (row: Row, old: Row | null): Row => {
    // Staged (draft) migrations are not in the resolved function map, so fall
    // back to the staged SQL text — the actor still comes from the SQL, never
    // from a constant written here.
    const body = functionBody('stamp_detention_claim_actor') ?? stagedMigrationSql();
    const actor = actorValue(classifyActorExpression('v_profile', body));
    const next = { ...row };
    if (!old) {
      next.created_by = actor;
      next.updated_by = actor;
      next.reported_to = next.reported_to ?? actor;
      if (next.broker_notified_at == null) {
        next.notified_by = null;
        next.notification_method = null;
      } else {
        next.notified_by = next.notified_by ?? actor;
      }
      return next;
    }
    next.created_by = old.created_by ?? null;
    next.updated_by = actor;
    if (next.broker_notified_at == null) {
      next.notified_by = null;
      next.notification_method = null;
    } else if (next.broker_notified_at !== old.broker_notified_at && next.notified_by == null) {
      next.notified_by = actor;
    }
    return next;
  };

  const insertRows = (table: string, payload: Row | Row[], idPrefix = 'row') => {
    const list = Array.isArray(payload) ? payload : [payload];
    const written: Row[] = [];
    list.forEach((p, i) => {
      const stamped = table === 'detention_claims' ? stampDetentionClaim(p, null) : p;
      enforce(table, stamped);
      const row = { id: `${idPrefix}-${tables[table].length + i + 1}`, ...stamped };
      tables[table].push(row);
      written.push(row);
    });
    return written;
  };


  /** Mimics the RPCs, taking the actor from the SQL's own text. */
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    try {
      if (fn === 'log_parser_diagnostics') {
        // The SQL inserts with INSERT ... SELECT, so the actor is read off the
        // local the body assigns rather than a VALUES position.
        const body = functionBody(fn) ?? '';
        if (!body) throw new Error('log_parser_diagnostics is not in the migration set');
        const actor = actorValue(classifyActorExpression('v_profile', body));
        const rowsIn = (args.p_rows ?? []) as Row[];
        if (!Array.isArray(rowsIn) || rowsIn.length === 0) return { data: 0, error: null };
        let written = 0;
        rowsIn.forEach(r => {
          if (!r.kind) return;
          // A client-sent actor is ignored: the body never reads those keys.
          const { created_by: _c, resolved_by: _r, ...rest } = r;
          insertRows('parser_diagnostics', { ...rest, created_by: actor }, 'diag');
          written += 1;
        });
        return { data: written, error: null };
      }

      if (fn === 'file_load_references' || fn === 'record_load_reference_baseline') {
        const refs = (args.p_refs ?? []) as {
          reference_class: string; label: string; value: string; value_key: string;
          citations?: { stopSequence: number; printedLabel?: string | null }[];
        }[];

        // The single-transaction contract: references, citations and the
        // history entry either all land or none do.
        const snapshot = JSON.parse(JSON.stringify(tables));
        try {
          if (fn === 'file_load_references') {
            const created = actorExpressionFor(fn, 'load_references', 'created_by');
            const actor = actorValue(created?.kind ?? 'unknown');
            refs.forEach(r => {
              const existing = tables.load_references.find(
                x => x.load_id === args.p_load_id
                  && x.reference_class === r.reference_class
                  && x.value_key === r.value_key,
              );
              const row: Row = {
                load_id: args.p_load_id,
                reference_class: r.reference_class,
                label: r.label,
                value: r.value,
                value_key: r.value_key,
                source: args.p_source ?? 'rate_confirmation',
                created_by: actor,
              };
              enforce('load_references', row);
              const refId = existing
                ? (Object.assign(existing, row), existing.id as string)
                : (insertRows('load_references', row, 'ref')[0].id as string);

              for (let i = tables.load_reference_citations.length - 1; i >= 0; i -= 1) {
                if (tables.load_reference_citations[i].reference_id === refId) {
                  tables.load_reference_citations.splice(i, 1);
                }
              }
              (r.citations ?? []).forEach(c => {
                insertRows('load_reference_citations', {
                  reference_id: refId,
                  load_stop_id: tables.load_stops.find(
                    s => s.load_id === args.p_load_id && s.stop_sequence === c.stopSequence,
                  )?.id ?? null,
                  stop_sequence: c.stopSequence,
                  printed_label: (c.printedLabel ?? '').trim() || r.label,
                }, 'cite');
              });
            });
          }

          // Removals, in the same transaction as the writes. A reference the
          // revised document no longer prints is deleted and the deletion is
          // explained in the load's history — an accepted "reference removed"
          // that changed nothing is the bug this mirrors.
          const removals = (args.p_removals ?? []) as {
            reference_class: string; value_key: string;
          }[];
          removals.forEach(rm => {
            const at = tables.load_references.findIndex(
              r => r.load_id === args.p_load_id
                && r.reference_class === rm.reference_class
                && r.value_key === rm.value_key,
            );
            if (at < 0) return;
            const [gone] = tables.load_references.splice(at, 1);
            // ON DELETE CASCADE.
            for (let i = tables.load_reference_citations.length - 1; i >= 0; i -= 1) {
              if (tables.load_reference_citations[i].reference_id === gone.id) {
                tables.load_reference_citations.splice(i, 1);
              }
            }
            const changed = actorExpressionFor(fn, 'load_change_history', 'changed_by');
            insertRows('load_change_history', {
              load_id: args.p_load_id,
              field_path: `references.${String(gone.reference_class)}`,
              previous_value: `${String(gone.label)}: ${String(gone.value)}`,
              new_value: null,
              is_financial: false,
              reason: `Reference removed from ${(args.p_document_label as string) || 'a revised rate confirmation'}`,
              change_source: (args.p_source as string) || 'rate_confirmation',
              changed_by: actorValue(changed?.kind ?? 'unknown'),
            }, 'hist');
          });



          if (args.p_summary) {
            const changed = actorExpressionFor(fn, 'load_change_history', 'changed_by');
            insertRows('load_change_history', {
              load_id: args.p_load_id,
              field_path: 'references.baseline',
              new_value: args.p_summary,
              change_source: 'reference_baseline',
              changed_by: actorValue(changed?.kind ?? 'unknown'),
            }, 'hist');
          }
        } catch (err) {
          Object.keys(tables).forEach(k => {
            tables[k].length = 0;
            (snapshot[k] as Row[]).forEach(r => tables[k].push(r));
          });
          throw err;
        }
        return { data: null, error: null };
      }

      if (fn === 'set_load_verbatim_verification') {
        const upd = actorExpressionFor(fn, 'loads', 'updated_by');
        const load = tables.loads.find(l => l.id === args.p_load_id);
        if (!load) throw new Error('load not found');
        const records = args.p_records as unknown;
        if (records != null && !Array.isArray(records)) {
          throw new Error('verbatim verification must be an array of field records');
        }
        const actor = actorValue(upd?.kind ?? 'unknown');
        const next = { ...load, updated_by: actor };
        enforce('loads', next);
        // The SQL does NOT store the array as given: it wraps it in the
        // envelope the reader has to understand. A fake that stored the array
        // verbatim is exactly the fiction that let the reader ship broken.
        Object.assign(load, next, {
          verbatim_verification: {
            checked_at: new Date().toISOString(),
            checked_by: actor,
            fields: ((records ?? []) as Row[]).map(rec =>
              rec.source === 'manual_repair' && rec.repaired_at == null
                ? { ...rec, repaired_at: new Date().toISOString(), repaired_by: actor }
                : rec,
            ),
          },
        });
        return { data: null, error: null };
      }


      /* ---------------------------------------------------------------- */
      /* The load save path                                                */
      /* ---------------------------------------------------------------- */

      if (fn === 'generate_load_number') {
        const cfg = (tables.load_number_config ??= []);
        if (!cfg.length) cfg.push({ id: 'cfg-1', prefix: 'ST', separator: '', include_year: true, sequence_padding: 3, next_sequence: 1 });
        const c = cfg[0];
        const seq = Number(c.next_sequence);
        c.next_sequence = seq + 1;
        const yr = String(new Date().getFullYear()).slice(2);
        return {
          data: `${c.prefix}${c.include_year ? String(c.separator) + yr : ''}${String(c.separator)}${String(seq).padStart(Math.max(Number(c.sequence_padding), 1), '0')}`,
          error: null,
        };
      }

      if (fn === 'create_load_with_stops') {
        const body = functionBody(fn) ?? '';
        if (!body) throw new Error('create_load_with_stops is not in the migration set');
        const actor = actorValue(classifyActorExpression('v_profile', body));
        const p = (args.p_load ?? {}) as Row;
        const stopsIn = (args.p_stops ?? []) as Row[];
        const chargesIn = (args.p_charges ?? []) as Row[];
        if (stopsIn.length < 2) throw new Error('A load requires at least two stops');

        const load: Row = {
          ...coerceLoadColumns(p),
          status: 'available',
          dispatcher_id: actor,
          created_by: actor,
          updated_by: actor,
        };
        const loadId = insertRows('loads', load, 'load')[0].id as string;

        const stopIds: string[] = [];
        stopsIn.forEach((s, i) => {
          const middle = i > 0 && i < stopsIn.length - 1;
          const row = insertRows('load_stops', {
            load_id: loadId,
            stop_sequence: i + 1,
            ...coerceStopColumns(s),
            stopoff_charge_eligible: middle,
            stopoff_charge_amount: middle ? numOrNull(s.stopoff_charge_amount) : null,
          }, 'stop')[0];
          stopIds.push(row.id as string);
        });

        chargesIn.forEach(c => {
          const at = txt(c.stop_index) === null ? null : Number(c.stop_index);
          insertRows('load_charges', {
            load_id: loadId,
            load_stop_id: at !== null && stopIds[at] ? stopIds[at] : null,
            charge_type: txt(c.charge_type) ?? 'other',
            description: txt(c.description),
            amount: numOrNull(c.amount) ?? 0,
            source: txt(c.source) ?? 'manual',
            funding_source: txt(c.funding_source),
            actual_cost: numOrNull(c.actual_cost),
            proof_document_id: txt(c.proof_document_id),
          }, 'charge');

        });

        return { data: loadId, error: null };
      }

      if (fn === 'update_load_with_stops') {
        const body = functionBody(fn) ?? '';
        if (!body) throw new Error('update_load_with_stops is not in the migration set');
        const actor = actorValue(classifyActorExpression('v_profile', body));
        const loadId = args.p_load_id as string;
        const load = tables.loads.find(l => l.id === loadId);
        if (!load) throw new Error('Load not found');
        const p = (args.p_load ?? {}) as Row;
        const stopsIn = (args.p_stops ?? []) as Row[];
        const chargesIn = (args.p_charges ?? []) as Row[];
        const reason = ((args.p_reason as string) ?? '').trim() || null;
        if (stopsIn.length < 2) throw new Error('A load requires at least two stops');
        if (txt(p.load_number) && txt(p.load_number) !== load.load_number) {
          throw new Error('The load number cannot be changed');
        }

        const next = coerceLoadColumns(p);
        const changes: { f: string; a: unknown; b: unknown; fin: boolean }[] = [];
        let financial = false;
        Object.keys(next).forEach(k => {
          if (k === 'load_number') return;
          const a = load[k] ?? null;
          const b = next[k] ?? null;
          const same = NUMERIC_LOAD_KEYS.includes(k)
            ? Number(a ?? NaN) === Number(b ?? NaN) || (a == null && b == null)
            : a === b;
          if (same) return;
          const fin = FINANCIAL_LOAD_KEYS.includes(k);
          if (fin) financial = true;
          changes.push({ f: k, a, b, fin });
        });

        const oldCharges = tables.load_charges
          .filter(c => c.load_id === loadId)
          .reduce((s, c) => s + Number(c.amount ?? 0), 0);
        const newCharges = chargesIn.reduce((s, c) => s + (numOrNull(c.amount) ?? 0), 0);
        if (oldCharges !== newCharges) {
          financial = true;
          changes.push({ f: 'charges_total', a: String(oldCharges), b: String(newCharges), fin: true });
        }

        // The database refuses a money change with no written reason. A fake
        // that accepted one would let the revision test pass a payload the
        // real save rejects.
        if (financial && !reason) {
          throw new Error('A reason is required when a change affects the value of the load');
        }

        const kept = stopsIn.map(s => txt(s.id)).filter(Boolean) as string[];
        for (let i = tables.load_stops.length - 1; i >= 0; i -= 1) {
          const s = tables.load_stops[i];
          if (s.load_id !== loadId || kept.includes(s.id as string)) continue;
          insertRows('load_change_history', {
            load_id: loadId,
            field_path: 'stop_removed',
            previous_value: `Stop ${String(s.stop_sequence)}: ${String(s.facility_name ?? '')}`,
            new_value: null,
            is_financial: false,
            reason,
            changed_by: actor,
          }, 'hist');
          tables.load_charges.forEach(c => { if (c.load_stop_id === s.id) c.load_stop_id = null; });
          tables.load_stops.splice(i, 1);
        }

        stopsIn.forEach((s, i) => {
          const middle = i > 0 && i < stopsIn.length - 1;
          const patch = {
            stop_sequence: i + 1,
            ...coerceStopColumns(s),
            stopoff_charge_eligible: middle,
            stopoff_charge_amount: middle ? numOrNull(s.stopoff_charge_amount) : null,
          };
          const id = txt(s.id);
          const existing = id ? tables.load_stops.find(x => x.id === id && x.load_id === loadId) : null;
          if (id && !existing) throw new Error('A stop being edited no longer exists on this load');
          if (existing) Object.assign(existing, patch);
          else insertRows('load_stops', { load_id: loadId, ...patch }, 'stop');
        });

        for (let i = tables.load_charges.length - 1; i >= 0; i -= 1) {
          if (tables.load_charges[i].load_id === loadId) tables.load_charges.splice(i, 1);
        }
        const seq = tables.load_stops
          .filter(s => s.load_id === loadId)
          .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
        chargesIn.forEach(c => {
          const at = txt(c.stop_index) === null ? null : Number(c.stop_index);
          insertRows('load_charges', {
            load_id: loadId,
            load_stop_id: at !== null && seq[at] ? seq[at].id : null,
            charge_type: txt(c.charge_type) ?? 'other',
            description: txt(c.description),
            amount: numOrNull(c.amount) ?? 0,
            source: txt(c.source) ?? 'manual',
            funding_source: txt(c.funding_source),
            actual_cost: numOrNull(c.actual_cost),
            proof_document_id: txt(c.proof_document_id),
          }, 'charge');
        });


        changes.forEach(c => {
          insertRows('load_change_history', {
            load_id: loadId,
            field_path: c.f,
            previous_value: c.a === null ? null : String(c.a),
            new_value: c.b === null ? null : String(c.b),
            is_financial: c.fin,
            reason,
            changed_by: actor,
          }, 'hist');
        });

        const merged = { ...load, ...next, updated_by: actor };
        enforce('loads', merged);
        Object.assign(load, merged);
        return { data: loadId, error: null };
      }

      return { data: null, error: { message: `unhandled rpc ${fn}`, code: 'P0001' } };

    } catch (err) {
      const e = err as FkViolation;
      return { data: null, error: { message: e.message, code: e.code ?? 'P0001', details: '', hint: '' } };
    }
  };

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: AUTH_UID } }, error: null }),
    },
    rpc,
    from(table: string) {
      const rows = (tables[table] ??= []);
      const api = {
        _filters: [] as ((r: Row) => boolean)[],
        select(cols?: string) {
          const embedCitations = !!cols && cols.includes('load_reference_citations(');
          const list = rows
            .filter(r => this._filters.every(f => f(r)))
            .map(r => (embedCitations
              ? {
                ...r,
                load_reference_citations: tables.load_reference_citations
                  .filter(c => c.reference_id === r.id)
                  .map(c => ({ stop_sequence: c.stop_sequence, printed_label: c.printed_label })),
              }
              : r));
          const resolved = (l: Row[]): unknown => Object.assign(
            Promise.resolve({ data: l, error: null }),
            {
              eq: (c: string, v: unknown) => resolved(l.filter(r => r[c] === v)),
              is: (c: string, v: unknown) => resolved(l.filter(r => (r[c] ?? null) === v)),
              in: (c: string, vs: unknown[]) => resolved(l.filter(r => vs.includes(r[c]))),
              order: () => resolved(l),
              limit: (n: number) => resolved(l.slice(0, n)),
              maybeSingle: () => Promise.resolve({ data: l[0] ?? null, error: null }),
              // PostgREST fails a `.single()` that does not match exactly one row,
              // and code branches on that error. A fake that returned the first
              // row regardless would hide the branch.
              single: () => Promise.resolve(l.length === 1
                ? { data: l[0], error: null }
                : {
                  data: null,
                  error: {
                    code: 'PGRST116',
                    message: `JSON object requested, multiple (or no) rows returned (${l.length})`,
                  },
                }),
            },
          );

          return resolved(list);
        },
        eq(col: string, val: unknown) { this._filters.push(r => r[col] === val); return this; },
        in(col: string, vals: unknown[]) { this._filters.push(r => vals.includes(r[col])); return this; },
        insert(payload: Row | Row[]) {
          try {
            insertRows(table, payload);
            return Promise.resolve({ data: null, error: null });
          } catch (err) {
            const e = err as FkViolation;
            return Promise.resolve({ data: null, error: { message: e.message, code: e.code } });
          }
        },
        update(patch: Row) {
          const self = api;
          return {
            eq(col: string, val: unknown) {
              try {
                rows.filter(r => r[col] === val).forEach(r => {
                  const merged = { ...r, ...patch };
                  const next = table === 'detention_claims'
                    ? stampDetentionClaim(merged, r)
                    : merged;
                  enforce(table, next);
                  Object.keys(next).forEach(k => { r[k] = next[k]; });
                });
                void self;
                return Promise.resolve({ data: null, error: null });
              } catch (err) {
                const e = err as FkViolation;
                return Promise.resolve({ data: null, error: { message: e.message, code: e.code } });
              }
            },
          };
        },
        delete() {
          return {
            in(col: string, vals: unknown[]) {
              for (let i = rows.length - 1; i >= 0; i -= 1) {
                if (vals.includes(rows[i][col])) rows.splice(i, 1);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
      return api;
    },
  };

  return { tables, client, reset: seed };
}
