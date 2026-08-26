import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Reader cover for the Outstanding paperwork block on Load Detail.
 *
 * FIXTURE PROVENANCE — AUTHORED, not derived. The repo convention is that a
 * reader's fixture is the writer's output, but `document_exceptions` is not
 * modelled in `src/test/helpers/pgFake.ts` at all, and `load_documents` is
 * present only as an empty table with no write path (uploads go through
 * storage plus a direct insert the fake does not carry). There is therefore no
 * real writer to drive here, so the rows below are authored by hand and the
 * document/exception fetchers are mocked. Stated plainly rather than passed
 * off as derived.
 */

const docs = vi.fn();
const excs = vi.fn();

vi.mock('@/lib/loadDocuments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/loadDocuments')>('@/lib/loadDocuments');
  return {
    ...actual,
    fetchLoadDocuments: (...a: unknown[]) => docs(...a),
    fetchLoadDocumentExceptions: (...a: unknown[]) => excs(...a),
    createDocumentSignedUrl: vi.fn(async () => 'https://example.test/x'),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const load = (load_type: string) => ({
  id: 'load-1',
  load_type,
  stops: [],
}) as never;

async function renderSection(loadType: string) {
  const { default: DocumentsSection } = await import('../DocumentsSection');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DocumentsSection load={load(loadType)} canManage canSeeInternal />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  docs.mockReset();
  excs.mockReset();
  excs.mockResolvedValue([]);
});

describe('Outstanding paperwork block', () => {
  it('reads complete with the BOL listed as expected-not-received', async () => {
    docs.mockResolvedValue([
      { id: 'd1', document_type: 'pod', document_name: 'POD.pdf', upload_channel: 'office_upload', uploaded_at: null, file_path: 'p', file_type: 'application/pdf', file_size: 10, uploaded_by_name: null, notes: null, load_stop_id: null, photo_label: null },
    ]);
    await renderSection('standard');
    expect(await screen.findByText('Expected — not received')).toBeInTheDocument();
    expect(screen.getByText('Bill of lading (collected at pickup)')).toBeInTheDocument();
    expect(screen.queryByText('Required — outstanding')).not.toBeInTheDocument();
  });

  it('lists a missing POD as required outstanding', async () => {
    docs.mockResolvedValue([]);
    await renderSection('standard');
    expect(await screen.findByText('Required — outstanding')).toBeInTheDocument();
    expect(screen.getByText('Proof of delivery')).toBeInTheDocument();
  });

  it('shows the loadout roof check separately from the pickup set', async () => {
    docs.mockResolvedValue([
      { id: 'p1', document_type: 'loadout_pickup_inspection', document_name: 'front.jpg', upload_channel: 'driver_app', uploaded_at: null, file_path: 'p', file_type: 'image/jpeg', file_size: 10, uploaded_by_name: null, notes: null, load_stop_id: null, photo_label: 'Front' },
    ]);
    await renderSection('loadout');
    expect(await screen.findByText('Roof check — rear doors open')).toBeInTheDocument();
    expect(screen.getByText('Delivery inspection photos')).toBeInTheDocument();
    expect(screen.queryByText('Pickup inspection photos')).not.toBeInTheDocument();
  });

  it('notes a POD waived by an approved exception', async () => {
    docs.mockResolvedValue([]);
    excs.mockResolvedValue([{ id: 'e1', document_type: 'pod', status: 'approved' }]);
    await renderSection('standard');
    expect(await screen.findByText(/waived by approved exception/)).toBeInTheDocument();
  });
});
