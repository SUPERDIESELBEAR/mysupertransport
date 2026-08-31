import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TerminationBadge from '@/components/drivers/TerminationBadge';

/**
 * A voided Appendix C was generated in error and withdrawn. The one thing it
 * must never do is keep telling a dispatcher the driver's ICA ended.
 */
describe('TerminationBadge — voided rows', () => {
  it('renders nothing for a voided row on a board or roster', () => {
    const { container } = render(
      <TerminationBadge termination={{ effective_date: '2026-08-10', reason: 'cause', voided_at: '2026-08-31T00:00:00Z' }} />,
    );
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('termination-badge')).toBeNull();
  });

  it('reads as voided, never as terminated, where the document is owned', () => {
    render(
      <TerminationBadge
        showVoided
        termination={{ effective_date: '2026-08-10', reason: 'cause', voided_at: '2026-08-31T00:00:00Z' }}
      />,
    );
    expect(screen.getByTestId('termination-badge-voided').textContent).toContain('Termination Voided');
    expect(screen.queryByText(/ICA Terminated/)).toBeNull();
  });

  it('a genuine termination is unaffected', () => {
    render(<TerminationBadge termination={{ effective_date: '2026-08-10', reason: 'cause' }} />);
    expect(screen.getByTestId('termination-badge').textContent).toContain('ICA Terminated');
  });
});
