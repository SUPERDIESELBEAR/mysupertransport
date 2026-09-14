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

    const label = screen.getByText('Add note');
    expect(label.className).toContain('text-muted-foreground');
    expect(label.className).not.toContain('text-gold');
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

    const label = screen.getByText('See note');
    expect(label.className).toContain('text-gold');
    expect(screen.getByText('1 · M. Mueller')).toBeInTheDocument();
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

    const label = screen.getByText('See notes');
    expect(label.className).toContain('text-gold');
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

    expect(screen.getByRole('button').textContent).toContain('See note');
    expect(document.querySelectorAll('svg')).toHaveLength(1);

    rerender(
      <ApplicationInterviewNotesButton
        applicationId="app-4"
        applicantName="Alice"
        notes={{ count: 1, latest: 'M. Mueller' }}
        expanded={true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole('button').textContent).toContain('See note');
    expect(document.querySelectorAll('svg')).toHaveLength(1);
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
