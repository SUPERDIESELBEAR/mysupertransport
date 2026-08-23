import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * READER-BOUNDARY TEST.
 *
 * The suite validated `set_load_verbatim_verification` at the writer's
 * boundary — array in, actor stamped, wiring reachable — and never once
 * rendered the card that has to read the column back. The writer stores an
 * envelope; the card assumed a bare array; the first load with a real record
 * blanked the page.
 *
 * So the fixture here is NOT hand-authored. It is produced by driving the real
 * save path through the fake whose RPC behaviour comes from the checked-in
 * SQL, and then read out of the fake's `loads` row. If the writer's shape
 * changes, this fixture changes with it and the card fails here rather than in
 * production.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __verbFake: { client: unknown } };
holder.__verbFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__verbFake.client; },
}));

const LOAD_ID = 'load-1';

async function storedShapeFor(records: unknown[]): Promise<unknown> {
  const { saveVerbatimVerification } = await import('@/lib/verbatimPersist');
  await saveVerbatimVerification(LOAD_ID, records as never);
  return fake.tables.loads.find(l => l.id === LOAD_ID)?.verbatim_verification;
}

function renderCard(stored: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const load = { id: LOAD_ID, verbatim_verification: stored } as never;
  return import('../VerbatimVerificationCard').then(({ default: Card }) =>
    render(
      <QueryClientProvider client={qc}>
        <Card load={load} />
      </QueryClientProvider>,
    ),
  );
}

const DAMAGED = {
  field: 'special_instructions_verbatim',
  verdict: 'transcription_damaged',
  source: 'model',
  similarity: 0.82,
  regionSource: 'anchor',
  anchorId: 'special_instructions',
  regionFailure: null,
  layerDegradation: 0.31,
  missingTokens: ['53'],
  transcriptionDamage: [{ kind: 'pilcrow', offset: 12, context: '53\u2019 102 ¶' }],
};

const VERIFIED = {
  field: 'broker_terms_verbatim',
  verdict: 'verified',
  source: 'model',
  similarity: 0.99,
  regionSource: 'anchor',
  anchorId: 'terms',
  regionFailure: null,
  layerDegradation: 0.01,
  missingTokens: [],
  transcriptionDamage: [],
};

beforeEach(() => fake.reset());

describe('VerbatimVerificationCard against the writer\u2019s own output', () => {
  it('the writer stores an envelope, not an array', async () => {
    const stored = await storedShapeFor([DAMAGED]);
    expect(Array.isArray(stored)).toBe(false);
    expect(Object.keys(stored as object).sort()).toEqual(['checked_at', 'checked_by', 'fields']);
  });

  it('renders the stored verdict without throwing', async () => {
    const stored = await storedShapeFor([DAMAGED, VERIFIED]);
    await renderCard(stored);
    expect(screen.getByText('Transcription damaged')).toBeInTheDocument();
    expect(screen.getByText('Special instructions')).toBeInTheDocument();
    // A verified capture is not notable on its own.
    expect(screen.queryByText('Broker terms')).not.toBeInTheDocument();
  });

  it('marks a hand-repaired span, with the server-stamped attribution', async () => {
    const stored = await storedShapeFor([{ ...DAMAGED, source: 'manual_repair', verdict: 'repaired' }]);
    const fields = (stored as { fields: Record<string, unknown>[] }).fields;
    expect(fields[0].repaired_at).toBeTruthy();
    await renderCard(stored);
    expect(screen.getByText('Manually repaired')).toBeInTheDocument();
  });

  it('renders nothing when every capture verified', async () => {
    const stored = await storedShapeFor([VERIFIED]);
    const { container } = await renderCard(stored);
    expect(container).toBeEmptyDOMElement();
  });

  it('tolerates a bare array, null, and a malformed object', async () => {
    for (const shape of [[DAMAGED], null, undefined, {}, { fields: null }, 'nonsense']) {
      const { container } = await renderCard(shape);
      expect(container).toBeTruthy();
    }
    // The legacy bare array still renders its verdict.
    await renderCard([DAMAGED]);
    expect(screen.getAllByText('Transcription damaged').length).toBeGreaterThan(0);
  });
});

describe('envelope shape contract', () => {
  it('the keys the card reads are the keys the migration writes', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = 'supabase/migrations';
    const bodies = readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .map(f => readFileSync(`${dir}/${f}`, 'utf8'))
      .filter(sql => sql.includes('SET verbatim_verification = jsonb_build_object'));

    expect(bodies.length).toBeGreaterThan(0);
    const latest = bodies[bodies.length - 1];
    const block = latest.split('SET verbatim_verification = jsonb_build_object').pop() as string;
    const keys = Array.from(block.slice(0, 400).matchAll(/'([a-z_]+)',/g)).map(m => m[1]);

    // The reader depends on exactly these.
    expect(keys).toContain('fields');
    expect(keys).toContain('checked_at');
    expect(keys).toContain('checked_by');
  });
});
