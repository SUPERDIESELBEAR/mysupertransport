import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPgFake, PROFILE_ID } from '@/test/helpers/pgFake';
import { blueGraceTextLayer } from '@/test/fixtures/blueGracePage';
import { blueGraceParse, blueGraceRevisedParse } from '@/test/fixtures/blueGraceParseResult';

/**
 * THE CREATE AND REVISION PATHS, END TO END, AGAINST DATABASE STATE.
 *
 * Everything before this file tested one link at a time. Five defects in a row
 * reached production through the joints instead: a writer whose reader could
 * not read it back, a baseline that sent an auth uid where a profile id was
 * required, a diagnostics write with no reader, references that would not
 * delete, and a confidence gate that emptied form fields a diagnostic still
 * reported as read. Each link had a passing test. Nothing drove the whole path.
 *
 * So this does. One document goes in; the assertions are rows in the fake
 * database, which enforces the real foreign keys and takes its RPC behaviour
 * from the checked-in SQL.
 *
 * WHAT IS STUBBED, AND WHY — everything downstream of each stub is real:
 *
 *   1. `parse-rate-confirmation`. It calls a model over the network. Its answer
 *      is the fixture in `blueGraceParseResult.ts`.
 *   2. `textLayerFor`. pdf.js needs a worker and a real PDF binary. The layer
 *      is the fixture page in `blueGracePage.ts`; every line of region
 *      resolution, damage measurement and adoption runs against it for real.
 *   3. Storage. `uploadLoadDocument` writes to a bucket; the load's attachment
 *      is not what this file is about.
 *   4. React rendering of the two screens. The form is a real
 *      `react-hook-form` instance with the real zod resolver, populated by the
 *      real `applyParsedToForm`; that the screens call these functions is held
 *      by `parserPathWiring.test.ts`.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __e2eFake: { client: unknown } };
holder.__e2eFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__e2eFake.client; },
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

let layerRevised = false;
vi.mock('@/lib/pdfTextLayer', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/pdfTextLayer')>();
  return { ...actual, textLayerFor: async () => blueGraceTextLayer({ revised: layerRevised }) };
});

const PDF = () => new File(['%PDF-1.4'], 'bluegrace.pdf', { type: 'application/pdf' });

/* ------------------------------------------------------------------ */
/* The create path                                                     */
/* ------------------------------------------------------------------ */

async function makeForm(defaults?: unknown) {
  const { loadFormSchema, loadFormDefaults } = await import('@/pages/dispatch/loadFormSchema');
  type V = import('@/pages/dispatch/loadFormSchema').LoadFormValues;
  const { result } = renderHook(() => useForm<V>({
    resolver: zodResolver(loadFormSchema),
    defaultValues: (defaults as V) ?? loadFormDefaults(),
  }));
  return result;
}

/** Drives the whole create path and returns the new load id. */
async function createFromBlueGrace() {
  const { supabase } = await import('@/integrations/supabase/client');
  const { verifyParsedVerbatim } = await import('@/lib/verbatimCheck');
  const { applyParsedToForm } = await import('@/lib/rateConfirmation');
  const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');
  const { saveLoadReferences } = await import('@/lib/loadReferences');
  const { saveVerbatimVerification } = await import('@/lib/verbatimPersist');
  const { logParserDiagnostics } = await import('@/lib/parserDiagnostics');

  layerRevised = false;
  const file = PDF();
  // (1) stubbed edge function
  const parsed = blueGraceParse();

  const { checks, adopted } = await verifyParsedVerbatim(file, parsed);
  const result = adopted;
  result.verbatim_verification = checks;

  const form = await makeForm();
  const rpc = (supabase as unknown as {
    rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: unknown }>;
  }).rpc.bind(supabase);
  const { data: number } = await rpc('generate_load_number');
  let applied!: ReturnType<typeof applyParsedToForm>;
  await act(async () => {
    form.current.setValue('load_number', number as string, { shouldValidate: true });
    applied = applyParsedToForm(result, (name, value) =>
      form.current.setValue(name as never, value as never, { shouldDirty: true }));
  });

  const diagnostics = await logParserDiagnostics(applied.classified, {
    documentLabel: file.name, parserContract: 5,
  });

  // The real resolver, on the real schema. A payload the form would refuse is
  // not a payload the save path can be asked about.
  const valid = await act(async () => form.current.trigger());
  const values = form.current.getValues();
  const payload = buildLoadSavePayload(values, { isEdit: false });

  const { data: loadId, error } = await rpc('create_load_with_stops', {
    p_load: payload.load, p_stops: payload.stops, p_charges: payload.charges,
  });
  if (error) throw error;

  await saveLoadReferences(loadId as string, payload.references ?? []);
  await saveVerbatimVerification(loadId as string, checks);

  return { loadId: loadId as string, checks, applied, diagnostics, values, valid, form };
}

beforeEach(() => {
  fake.reset();
  // The seed row exists for the narrower suites; this file starts from nothing.
  fake.tables.loads.length = 0;
  fake.tables.load_stops.length = 0;
});

describe('create path — Blue Grace rate confirmation to database rows', () => {
  it('parses, populates a valid form, and writes the load with its stops', async () => {
    const { loadId, valid, values } = await createFromBlueGrace();
    expect(valid).toBe(true);

    const load = fake.tables.loads.find(l => l.id === loadId) as Record<string, unknown>;
    expect(load.load_number).toBe(values.load_number);
    expect(load.equipment_type).toBe('reefer');
    expect(load.commodity).toBe('Avocados');
    expect(load.linehaul_rate).toBe(3200);
    expect(load.fsc_amount).toBe(400);
    expect(load.total_load_value).toBe(3600);
    expect(load.reefer_temp_f).toBe(34);
    expect(load.mode).toBe('TL');
    // Stamped with the profile id, never the auth uid.
    expect(load.created_by).toBe(PROFILE_ID);

    const stops = fake.tables.load_stops.filter(s => s.load_id === loadId);
    expect(stops).toHaveLength(2);
    expect(stops[0].city).toBe('Santa Paula');
    expect(stops[0].stop_sequence).toBe(1);
    expect(stops[1].city).toBe('Cincinnati');
    // The stop's printed comment line survives the save. It is captured,
    // verified and carried in the payload; only the write proves it lands.
    expect(stops[0].stop_notes_verbatim).toBe('Comments: PU# IX00286060');
  });

  it('stores every reference the document printed, with its stop citation', async () => {
    const { loadId } = await createFromBlueGrace();
    const refs = fake.tables.load_references.filter(r => r.load_id === loadId);

    const values = refs.map(r => r.value).sort();
    expect(values).toContain('BG969676425');
    expect(values).toContain('562117');
    expect(values).toContain('IX00286060');
    expect(values).toContain('001000562117');
    // `Mode: TL` is an attribute wearing a reference label; it lives on the load.
    expect(values).not.toContain('TL');
    refs.forEach(r => expect(r.created_by).toBe(PROFILE_ID));

    const pickup = refs.find(r => r.value === 'IX00286060');
    const cites = fake.tables.load_reference_citations.filter(c => c.reference_id === pickup?.id);
    expect(cites).toHaveLength(1);
    // The label as THAT stop printed it, not the row's own label.
    expect(cites[0].printed_label).toBe('PU#');
    expect(cites[0].load_stop_id).toBe(
      fake.tables.load_stops.find(s => s.load_id === loadId && s.stop_sequence === 1)?.id,
    );
  });

  it('stores the verdicts in the envelope the reader reads', async () => {
    const { loadId, checks } = await createFromBlueGrace();
    const load = fake.tables.loads.find(l => l.id === loadId) as Record<string, unknown>;
    const env = load.verbatim_verification as { fields: Record<string, unknown>[]; checked_by: string };

    expect(Array.isArray(env)).toBe(false);
    expect(env.checked_by).toBe(PROFILE_ID);
    expect(env.fields.length).toBe(checks.length);

    const si = env.fields.find(r => r.field === 'special_instructions_verbatim')!;
    const terms = env.fields.find(r => r.field === 'broker_terms_verbatim')!;
    // The damaged region keeps the model's transcription; the clean one is
    // taken from the page itself.
    expect(si.valueOrigin).toBe('model');
    expect(si.originReason).toBe('layer_damaged');
    // The model resolved the layer's `¶` back to `53' 102"`, so the CAPTURE is
    // sound even though the page it came from is not — a damaged layer refuses
    // adoption, it does not condemn the transcription.
    expect(si.verdict).toBe('verified');
    expect(String(si.value)).toContain('53\' 102"');
    expect(String(si.value)).toContain('OS&D');
    expect(terms.valueOrigin).toBe('text_layer');
    expect(terms.originReason).toBe('layer_clean');
  });

  it('reports the diagnostics it collected and the rows the server took', async () => {
    const { diagnostics, loadId } = await createFromBlueGrace();
    expect(diagnostics.error).toBeNull();
    // Collected and written are separate numbers; a zero write with a non-zero
    // collect is the failure that once read as a clean document.
    expect(diagnostics.written).toBe(diagnostics.collected);
    fake.tables.parser_diagnostics.forEach(r => expect(r.created_by).toBe(PROFILE_ID));
    expect(loadId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* The revision path                                                   */
/* ------------------------------------------------------------------ */

describe('revision path — revised tender applied to the stored load', () => {
  it('writes the accepted changes, removes the dropped reference, and keeps the new one', async () => {
    const { loadId } = await createFromBlueGrace();

    const { fetchLoadForEdit, updateLoadWithStops } = await import('@/lib/loadDetail');
    const { loadToFormValues } = await import('@/lib/loadEdit');
    const { verifyParsedVerbatim } = await import('@/lib/verbatimCheck');
    const {
      applyRevision, buildRevisionDiff, buildRevisionReason, initialDecisions,
    } = await import('@/lib/revisedRateCon');
    const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');
    const { saveLoadReferences } = await import('@/lib/loadReferences');

    layerRevised = true;
    const edit = await fetchLoadForEdit(loadId);
    expect(edit).toBeTruthy();
    const current = loadToFormValues(edit!);
    expect(current.references?.some(r => r.value === '562117')).toBe(true);

    const { adopted } = await verifyParsedVerbatim(PDF(), blueGraceRevisedParse());
    const diff = buildRevisionDiff(current, adopted);

    const decisions = initialDecisions(diff);
    diff.nonFinancial.forEach(d => { decisions.accepted[d.id] = true; });
    diff.financial.forEach(d => {
      decisions.accepted[d.id] = true;
      decisions.classifications[d.id] = decisions.classifications[d.id] ?? 'linehaul';
    });

    const removal = diff.nonFinancial.find(d => d.reference?.op === 'removed');
    const addition = diff.nonFinancial.find(d => d.reference?.op === 'added');
    expect(removal?.reference?.value).toBe('562117');
    // A PRO whose value equals the BOL is its own row, not a duplicate.
    expect(addition?.reference?.value).toBe('BG969676425');
    expect(addition?.reference?.reference_class).toBe('pro');

    const { values, financialSummary, removedReferences } = applyRevision(current, diff, decisions);
    expect(removedReferences.map(r => r.value)).toEqual(['562117']);

    const payload = buildLoadSavePayload(values, { isEdit: true });
    await updateLoadWithStops({
      loadId,
      load: payload.load,
      stops: payload.stops,
      charges: payload.charges,
      reason: buildRevisionReason({ financialSummary }),
    });
    await saveLoadReferences(loadId, payload.references ?? [], {
      source: 'revised_rate_confirmation',
      removals: removedReferences,
    });

    // --- the load itself
    const load = fake.tables.loads.find(l => l.id === loadId) as Record<string, unknown>;
    expect(load.linehaul_rate).toBe(3450);
    expect(load.updated_by).toBe(PROFILE_ID);

    // --- the stop that moved, and the one that did not
    const stops = fake.tables.load_stops
      .filter(s => s.load_id === loadId)
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    expect(stops).toHaveLength(2);
    expect(String(stops[1].appointment_start)).toContain('2025-06-21');
    expect(String(stops[0].appointment_start)).toContain('2025-06-18');

    // --- references: one gone, one new, the rest untouched
    const refs = fake.tables.load_references.filter(r => r.load_id === loadId);
    const stored = refs.map(r => `${String(r.reference_class)}:${String(r.value)}`).sort();
    expect(stored).not.toContain('pickup_number:562117');
    expect(stored).toContain('pro:BG969676425');
    expect(stored).toContain('pickup_number:IX00286060');

    // --- the removal is explained in the load's history, with an actor
    const history = fake.tables.load_change_history.filter(h => h.load_id === loadId);
    const removed = history.find(h => String(h.previous_value ?? '').includes('562117'));
    expect(removed).toBeTruthy();
    expect(removed!.new_value).toBeNull();
    expect(removed!.changed_by).toBe(PROFILE_ID);
    expect(history.some(h => h.field_path === 'linehaul_rate' && h.is_financial === true)).toBe(true);
  });

  it('refuses a money change with no written reason, as the database does', async () => {
    const { loadId } = await createFromBlueGrace();
    const { updateLoadWithStops } = await import('@/lib/loadDetail');
    const { fetchLoadForEdit } = await import('@/lib/loadDetail');
    const { loadToFormValues } = await import('@/lib/loadEdit');
    const { buildLoadSavePayload } = await import('@/lib/loadSavePayload');

    const current = loadToFormValues((await fetchLoadForEdit(loadId))!);
    const payload = buildLoadSavePayload({ ...current, linehaul_rate: '9999' }, { isEdit: true });

    await expect(updateLoadWithStops({
      loadId, load: payload.load, stops: payload.stops, charges: payload.charges, reason: null,
    })).rejects.toMatchObject({ message: expect.stringContaining('reason is required') });
  });
});
