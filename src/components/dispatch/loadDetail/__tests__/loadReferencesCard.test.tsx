import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * Reader-boundary cover for the second new read-side card.
 *
 * Rows are written through the real save path and read back through the real
 * fetch — including the embedded `load_reference_citations` shape PostgREST
 * returns — so the card is rendered against query output, never against
 * pre-mapped objects.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __refsCardFake: { client: unknown } };
holder.__refsCardFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__refsCardFake.client; },
}));

const LOAD_ID = 'load-1';

beforeEach(() => fake.reset());

async function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { default: Card } = await import('../LoadReferencesCard');
  return render(
    <QueryClientProvider client={qc}>
      <Card loadId={LOAD_ID} />
    </QueryClientProvider>,
  );
}

describe('LoadReferencesCard against real query output', () => {
  it('renders filed references with their class and stop citations', async () => {
    const { saveLoadReferences } = await import('@/lib/loadReferences');
    await saveLoadReferences(LOAD_ID, [
      {
        reference_class: 'pickup_number',
        label: 'PU#',
        value: 'IX00286060',
        citations: [{ stopSequence: 1, printedLabel: 'PU#' }],
      },
      { reference_class: 'bol', label: 'BOL', value: '562117', citations: [] },
    ] as never);

    await renderCard();

    expect(await screen.findByText('IX00286060')).toBeInTheDocument();
    expect(screen.getByText('562117')).toBeInTheDocument();
    expect(screen.getByText(/cited at stop 1/)).toBeInTheDocument();
    expect(screen.getByText(/load-level/)).toBeInTheDocument();
  });

  it('says so plainly when no baseline is on file', async () => {
    await renderCard();
    expect(
      await screen.findByText(/No reference numbers are on file/),
    ).toBeInTheDocument();
  });
});
