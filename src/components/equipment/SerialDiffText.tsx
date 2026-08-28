import { normalizeSerial, serialDiffPositions } from '@/lib/equipmentSync';
import { cn } from '@/lib/utils';

/**
 * Renders a serial number with the characters that differ from `against`
 * marked, so staff can see at a glance which look-alike character separates
 * two near-twin records.
 *
 * Diff positions are computed on the normalized form (dashes/spaces stripped)
 * and mapped back onto the raw displayed value by index, so a serial typed with
 * separators still highlights the right glyph.
 */
export default function SerialDiffText({
  value,
  against,
  className,
}: {
  value: string;
  against: string | null | undefined;
  className?: string;
}) {
  const raw = value ?? '';
  const positions = new Set(serialDiffPositions(raw, against));
  const other = normalizeSerial(against) ?? '';

  if (positions.size === 0) {
    return <span className={cn('font-mono', className)}>{raw}</span>;
  }

  // Walk the raw string, counting only the characters that survive normalization.
  let normIndex = 0;
  const chars = Array.from(raw).map((ch, i) => {
    const isSignificant = !/[-.\s]/.test(ch);
    const idx = isSignificant ? normIndex++ : -1;
    const marked = idx >= 0 && positions.has(idx);
    if (!marked) return <span key={i}>{ch}</span>;
    return (
      <span
        key={i}
        className="rounded-sm bg-accent px-0.5 font-semibold text-accent-foreground"
        title={`This character differs — ${ch.toUpperCase()} here, ${other[idx] ?? 'nothing'} on the other record`}
      >
        {ch}
      </span>
    );
  });

  return (
    <span className={cn('font-mono', className)}>
      {chars}
      <span className="sr-only">
        {' '}
        (differs at {[...positions].map(p => p + 1).join(', ')})
      </span>
    </span>
  );
}
