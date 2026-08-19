import { Badge } from '@/components/ui/badge';
import { DetailSection } from './DetailPrimitives';
import type { LoadDetail } from '@/lib/loadDetail';

function NoteBlock({ label, body, staffOnly }: { label: string; body: string; staffOnly?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {staffOnly ? (
          <Badge variant="outline" className="border-border bg-muted text-[10px] text-muted-foreground">
            Staff only
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{body}</p>
    </div>
  );
}

/** Internal notes are staff-only; operators never see that block. */
export default function NotesSection({ load, canSeeInternal }: { load: LoadDetail; canSeeInternal: boolean }) {
  const internal = canSeeInternal && load.internal_notes?.trim() ? load.internal_notes : null;
  const driver = load.driver_facing_notes?.trim() ? load.driver_facing_notes : null;
  const special = load.special_instructions?.trim() ? load.special_instructions : null;
  if (!internal && !driver && !special) return null;

  return (
    <DetailSection title="Notes">
      <div className="space-y-4">
        {internal ? <NoteBlock label="Internal Notes" body={internal} staffOnly /> : null}
        {driver ? <NoteBlock label="Driver-Facing Notes" body={driver} /> : null}
        {special ? <NoteBlock label="Special Instructions" body={special} /> : null}
      </div>
    </DetailSection>
  );
}
