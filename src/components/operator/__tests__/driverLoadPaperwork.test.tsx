/**
 * The driver's paperwork list is READ from src/lib/loadPaperwork.ts, never
 * re-derived. If this component ever grows its own matrix, the driver, the
 * dispatcher and the office start disagreeing about what a load owes — and the
 * driver is the one standing at the dock.
 *
 * Required and expected stay visually separate: required holds the load,
 * expected is chased and never blocks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let docRows: Array<{ document_type: string; photo_label: string | null }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: table === 'load_documents' ? docRows : [], error: null }),
      }),
    }),
  },
}));

const { uploadLoadDocument } = vi.hoisted(() => ({
  uploadLoadDocument: vi.fn(async (_input: { loadId: string; documentType: string; file: File }) => 'doc-1'),
}));
vi.mock('@/lib/loadDocuments', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/loadDocuments')>();
  return { ...actual, uploadLoadDocument };
});

import { LoadPaperworkUpload } from '@/components/operator/LoadPaperworkUpload';
import { DEFAULT_LOAD_PAPERWORK, evaluateLoadPaperwork } from '@/lib/loadPaperwork';

beforeEach(() => {
  docRows = [];
  uploadLoadDocument.mockClear();
});

describe('driver paperwork upload list', () => {
  it('renders exactly what the predicate says a per_ton load owes, split by level', async () => {
    const expected = evaluateLoadPaperwork('per_ton', [], []);
    render(<LoadPaperworkUpload loadId="load-1" loadType="per_ton" />);

    await screen.findByText('Required');
    for (const req of expected.outstandingRequired) {
      expect(screen.getByText(req.label)).toBeTruthy();
    }
    for (const req of expected.outstandingExpected) {
      expect(screen.getByText(req.label)).toBeTruthy();
    }
    expect(screen.getByText(/expected — send it when you have it/i)).toBeTruthy();

    // Nothing outside the matrix leaked in.
    const labels = DEFAULT_LOAD_PAPERWORK.per_ton.map(r => r.label);
    DEFAULT_LOAD_PAPERWORK.standard
      .filter(r => !labels.includes(r.label))
      .forEach(r => expect(screen.queryByText(r.label)).toBeNull());
  });

  it('an upload writes load_documents and the outstanding list updates', async () => {
    render(<LoadPaperworkUpload loadId="load-1" loadType="standard" />);
    await screen.findByText('Proof of delivery');

    // Simulate the document landing, then fire the camera input.
    uploadLoadDocument.mockImplementationOnce(async () => {
      docRows = [{ document_type: 'pod', photo_label: null }];
      return 'doc-1';
    });

    const input = screen.getByTestId('camera-load-1-pod') as HTMLInputElement;
    const file = new File(['x'], 'pod.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadLoadDocument).toHaveBeenCalledTimes(1));
    expect(uploadLoadDocument.mock.calls[0]?.[0]).toMatchObject({ loadId: 'load-1', documentType: 'pod' });
    await waitFor(() => expect(screen.queryByText('Proof of delivery')).toBeNull());
  });

  it('offers a camera path and a file path per requirement', async () => {
    render(<LoadPaperworkUpload loadId="load-1" loadType="standard" />);
    await screen.findByText('Proof of delivery');
    expect(screen.getByTestId('camera-load-1-pod').getAttribute('capture')).toBe('environment');
    expect(screen.getByTestId('file-load-1-pod')).toBeTruthy();
  });
});
