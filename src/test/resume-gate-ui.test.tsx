import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Resume-link gate, 2026-09-03.
 *
 * The invariant that matters: RENDERING /apply?resume=<token> must not invoke
 * `consume-application-resume`. A mail scanner renders; it does not click.
 */

const invoke = vi.fn();
const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));

vi.mock('@/lib/application/identity', () => ({
  useCompanyIdentity: () => ({}),
  identityLine: () => '',
}));

import ApplicationForm from '@/pages/ApplicationForm';

const TOKEN = 'tok_abc123456789';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/apply${search}`]}>
      <ApplicationForm />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  localStorage.clear();
  rpc.mockReturnValue({ single: async () => ({ data: null }) });
});

describe('resume gate', () => {
  it('mounting with ?resume does NOT consume the token', async () => {
    renderAt(`?resume=${TOKEN}`);
    await screen.findByTestId('resume-continue');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('clicking Continue consumes the token and loads the draft', async () => {
    invoke.mockResolvedValue({ data: { draft_token: 'draft-1' }, error: null });
    rpc.mockReturnValue({
      single: async () => ({ data: { id: 'app-1', current_step: 3, first_name: 'Timothy' } }),
    });

    renderAt(`?resume=${TOKEN}`);
    await userEvent.click(await screen.findByTestId('resume-continue'));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('consume-application-resume', { body: { token: TOKEN } });
    await waitFor(() =>
      expect(localStorage.getItem('supertransport_draft_token')).toBe('draft-1'),
    );
    expect(rpc).toHaveBeenCalledWith('get_application_by_draft_token', { p_token: 'draft-1' });
  });

  it.each(['token_used', 'token_expired'])(
    'renders the recovery dialog with the email prefilled on %s',
    async (code) => {
      invoke.mockResolvedValue({
        data: { error: code, email: 'stranded@example.com' },
        error: null,
      });

      renderAt(`?resume=${TOKEN}`);
      await userEvent.click(await screen.findByTestId('resume-continue'));

      const open = await screen.findByTestId('resume-recovery-open');
      await userEvent.click(open);

      const field = await screen.findByPlaceholderText('you@example.com');
      expect((field as HTMLInputElement).value).toBe('stranded@example.com');
    },
  );
});
