/**
 * PRESENTATION ONLY — how outstanding paperwork READS on the driver's home card.
 *
 * The predicate (src/lib/loadPaperwork.ts) and the slot definitions
 * (src/lib/loadoutSlots.ts) are untouched by this module. It takes the
 * requirements the predicate already found outstanding and decides how to word
 * them in a place with one line of room.
 *
 * A loadout owes up to sixteen guided photos. Naming each one on the first
 * screen a driver sees turns the home card into a paragraph of link text; the
 * capture screen already lists them, grouped and with instructions, which is
 * where that detail belongs. So loadout stages collapse to a COUNT, while
 * ordinary document types keep their names — there are only ever two or three
 * of those and the name is the useful part.
 *
 * Only REQUIRED items ever reach here (the caller passes outstandingRequired),
 * so optional slots can never inflate a number that reads as work owed.
 */
import type { PaperworkRequirement } from '@/lib/loadPaperwork';
import { LOADOUT_STAGE_DOCUMENT_TYPE, LOADOUT_STAGE_LABEL, LOADOUT_STAGES } from '@/lib/loadoutSlots';

const STAGE_BY_DOCUMENT_TYPE = new Map(
  LOADOUT_STAGES.map(stage => [LOADOUT_STAGE_DOCUMENT_TYPE[stage] as string, stage] as const),
);

/** One short line per group, in matrix order. */
export function summarizeOutstandingPaperwork(
  outstanding: PaperworkRequirement[] | null | undefined,
): string[] {
  const lines: string[] = [];
  const counts = new Map<string, number>();

  (outstanding ?? []).forEach(req => {
    const stage = STAGE_BY_DOCUMENT_TYPE.get(req.documentType as string);
    if (!stage) {
      lines.push(req.label);
      return;
    }
    if (!counts.has(stage)) {
      counts.set(stage, 0);
      lines.push(`\u0000${stage}`); // placeholder holds the group's position
    }
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  });

  return lines.map(line => {
    if (!line.startsWith('\u0000')) return line;
    const stage = line.slice(1) as (typeof LOADOUT_STAGES)[number];
    const n = counts.get(stage) ?? 0;
    return `${LOADOUT_STAGE_LABEL[stage]} — ${n} ${n === 1 ? 'photo' : 'photos'} still needed`;
  });
}
