import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RotateCcw, Mail, XCircle } from 'lucide-react';
import { ReviewActionButton, type ReviewActionTone } from './ReviewActionButton';

/**
 * Visual regression coverage for the pending review action buttons. We assert
 * the structural CSS contract that keeps the icon aligned with the first line
 * of wrapped labels and prevents text from bleeding across buttons.
 *
 * These spacing tokens are the ones that previously regressed:
 *  - whitespace-normal   (allows label wrap)
 *  - h-auto / min-h-[3.25rem] (height grows with wrap, but stays consistent)
 *  - items-start         (icon hugs the first line, not vertically centred)
 *  - [&>svg]:mt-0.5      (optical nudge so icon baseline matches text)
 *  - gap-2 / text-left   (consistent icon↔label gap and left alignment)
 */

const REQUIRED_SPACING_CLASSES = [
  'whitespace-normal',
  'h-auto',
  'min-h-[3.25rem]',
  'py-2.5',
  'leading-snug',
  'items-start',
  'justify-start',
  'text-left',
  'gap-2',
  '[&>svg]:mt-0.5',
];

const CASES: Array<{ tone: ReviewActionTone; icon: typeof RotateCcw; label: string; testid: string }> = [
  { tone: 'revise', icon: RotateCcw, label: 'Send back to applicant for corrections', testid: 'btn-revise' },
  { tone: 'propose', icon: Mail, label: 'Propose changes for applicant approval', testid: 'btn-propose' },
  { tone: 'deny', icon: XCircle, label: 'Deny', testid: 'btn-deny' },
];

const BREAKPOINTS: Array<{ name: string; width: number }> = [
  { name: 'desktop', width: 1380 },
  { name: 'mobile', width: 390 },
];

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('ReviewActionButton — spacing regression coverage', () => {
  afterEach(() => {
    cleanup();
  });

  BREAKPOINTS.forEach(({ name, width }) => {
    describe(`${name} viewport (${width}px)`, () => {
      beforeEach(() => setViewport(width));

      CASES.forEach(({ tone, icon, label, testid }) => {
        it(`${tone}: keeps icon + wrapped label aligned`, () => {
          render(
            <ReviewActionButton
              tone={tone}
              icon={icon}
              label={label}
              onClick={() => undefined}
              data-testid={testid}
            />,
          );

          const btn = screen.getByTestId(testid);
          // Every spacing token that governs alignment must be present.
          for (const cls of REQUIRED_SPACING_CLASSES) {
            expect(btn.className).toContain(cls);
          }

          // Icon must precede label and be a direct child (so [&>svg]:mt-0.5 applies).
          const svg = btn.querySelector(':scope > svg');
          expect(svg).not.toBeNull();
          expect(svg?.classList.contains('h-4')).toBe(true);
          expect(svg?.classList.contains('w-4')).toBe(true);

          // Label lives in a flex-1 span so it absorbs remaining width and wraps.
          const labelSpan = screen.getByText(label);
          expect(labelSpan.tagName).toBe('SPAN');
          expect(labelSpan.className).toContain('flex-1');

          // Sanity: full label rendered (no truncation).
          expect(btn.textContent).toContain(label);
        });
      });

      it('all three tones expose consistent height + alignment classes', () => {
        const { container } = render(
          <div>
            {CASES.map(({ tone, icon, label, testid }) => (
              <ReviewActionButton
                key={tone}
                tone={tone}
                icon={icon}
                label={label}
                onClick={() => undefined}
                data-testid={testid}
              />
            ))}
          </div>,
        );

        const buttons = container.querySelectorAll('button');
        expect(buttons).toHaveLength(3);
        // Pull the alignment-critical subset of classes and assert all three match.
        const alignmentSignature = (el: Element) =>
          ['min-h-[3.25rem]', 'items-start', 'gap-2', 'leading-snug', 'whitespace-normal']
            .map((c) => (el.classList.contains(c) ? c : `MISSING:${c}`))
            .join('|');
        const signatures = Array.from(buttons).map(alignmentSignature);
        expect(new Set(signatures).size).toBe(1);
      });
    });
  });

  it('invokes onClick when pressed', () => {
    const onClick = vi.fn();
    render(
      <ReviewActionButton
        tone="revise"
        icon={RotateCcw}
        label="Send back to applicant for corrections"
        onClick={onClick}
        data-testid="btn-click"
      />,
    );
    fireEvent.click(screen.getByTestId('btn-click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});