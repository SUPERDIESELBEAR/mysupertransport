import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPgFake } from '@/test/helpers/pgFake';

/**
 * The diagnostics view exists so an unrecognised heading survives a reload.
 * It had never been rendered by a test, so nothing checked that it can read
 * the rows the parser actually writes.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __diagFake: { client: unknown } };
holder.__diagFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__diagFake.client; },
}));

beforeEach(() => {
  fake.reset();
  (fake.tables.parser_diagnostics ??= []).push({
    id: 'diag-1',
    kind: 'anchor_miss',
    field: 'special_instructions_verbatim',
    failure: 'no_anchor',
    occurrences: 2,
    stop_number: null,
    headings: ['SHIPPER NOTES', 'LOAD REQUIREMENTS'],
    label: null,
    reference_class: null,
    load_id: 'load-1',
    load_number: 'ST26035',
    document_label: 'bluegrace.pdf',
    parser_contract: 4,
    resolved_at: null,
    created_at: '2026-08-23T18:00:00Z',
  });
});

describe('ParserDiagnosticsPage against real query output', () => {
  it('renders an open anchor miss with the headings the document printed', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: Page } = await import('../ParserDiagnosticsPage');

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <Page />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Unrecognised heading')).toBeInTheDocument();
    expect(screen.getByText(/SHIPPER NOTES/)).toBeInTheDocument();
    expect(screen.getByText(/ST26035/)).toBeInTheDocument();
  });
});
