import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicationInterviewNotesButton } from '../ApplicationInterviewNotesButton';

describe('ApplicationInterviewNotesButton', () => {
  it('renders "Add note" in muted gray when no notes exist', () => {
    render(
      <ApplicationInterviewNotesButton
        applicationId="app-1"
        applicantName="John Doe"
        notes={null}
        expanded={false}
        onToggle={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /Add interview note for John Doe/i });
    expect(button).toBeInTheDocument();
    expect(button.textContent).toBe('Add note');
    expect(button.className).toContain('text-muted-foreground');
    expect(button.className).not.toContain('text-gold');
  });

  it('renders "See note" in gold for a single note', () => {
    render(
      <ApplicationInterviewNotesButton
        applicationId="app-2"
        applicantName="Jane Smith"
        notes={{ count: 1, latest: 'M. Mueller' }}
        expanded={false}
        onToggle={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /See 1 interview note for Jane Smith, most recent by M\. Mueller/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('See note')).toBeInTheDocument();
    expect(screen.getByText('1 · M. Mueller')).toBeInTheDocument();
    expect(button.textContent).toContain('See note');
    expect(button.className).not.toContain('text-muted-foreground');
  });

  it('renders "See notes" in gold for multiple notes', () => {
    render(
      <ApplicationInterviewNotesButton
        applicationId="app-3"
        applicantName="Bob Brown"
        notes={{ count: 3, latest: 'S. Figueroa' }}
        expanded={false}
        onToggle={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /See 3 interview notes for Bob Brown, most recent by S\. Figueroa/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('See notes')).toBeInTheDocument();
    expect(screen.getByText('3 · S. Figueroa')).toBeInTheDocument();
  });

  it('shows a down chevron when expanded and a right chevron when collapsed', () => {
    const { rerender } = render(
      <ApplicationInterviewNotesButton
        applicationId="app-4"
        applicantName="Alice"
        notes={{ count: 1, latest: 'M. Mueller' }}
        expanded={false}
        onToggle={vi.fn()}
      />,
    );

    expect(document.querySelector('svg')).toHaveAttribute('data-lucide-icon', 'chevron-right');

    rerender(
      <ApplicationInterviewNotesButton
        applicationId="app-4"
        applicantName="Alice"
        notes={{ count: 1, latest: 'M. Mueller' }}
        expanded={true}
        onToggle={vi.fn()}
      />,
    );

    expect(document.querySelector('svg')).toHaveAttribute('data-lucide-icon', 'chevron-down');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(
      <ApplicationInterviewNotesButton
        applicationId="app-5"
        applicantName="Charlie"
        notes={{ count: 2, latest: 'M. Mueller' }}
        expanded={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
