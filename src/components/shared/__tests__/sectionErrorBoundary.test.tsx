import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';

/**
 * One broken card must not take the load with it.
 */
function Boom(): JSX.Element {
  throw new Error('records.map is not a function');
}

describe('SectionErrorBoundary', () => {
  it('degrades the failing section and leaves its siblings mounted', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <SectionErrorBoundary name="Verbatim capture verification">
          <Boom />
        </SectionErrorBoundary>
        <SectionErrorBoundary name="Documents">
          <p>Documents render fine</p>
        </SectionErrorBoundary>
      </div>,
    );

    expect(screen.getByText('This section could not be displayed.')).toBeInTheDocument();
    expect(screen.getByText('Verbatim capture verification')).toBeInTheDocument();
    expect(screen.getByText('records.map is not a function')).toBeInTheDocument();
    expect(screen.getByText('Documents render fine')).toBeInTheDocument();

    spy.mockRestore();
  });
});
