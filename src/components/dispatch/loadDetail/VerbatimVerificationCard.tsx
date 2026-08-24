import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, PenLine, ShieldQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import type { LoadDetail } from '@/lib/loadDetail';
import type {
  TranscriptionArtifact, VerbatimVerdict, VerbatimVerification,
} from '@/lib/verbatimVerify';

/**
 * How each verbatim capture on this load was judged, read back from the load.
 *
 * The verdicts were being written and shown nowhere: a `transcription_damaged`
 * flag or a hand-repaired span vanished when the review closed. Someone opening
 * the load next week has to see the same flag the dispatcher saw, or the
 * persistence was pointless.
 */

/** The stored record carries the repair attribution the RPC stamps server-side. */
type StoredVerification = VerbatimVerification & {
  repaired_by?: string | null;
  repaired_at?: string | null;
  verified_at?: string | null;
  /**
   * Where the stored text came from. Older records predate source selection and
   * carry nothing, which reads as the model — that is what they were.
   */
  valueOrigin?: 'text_layer' | 'model' | null;
  originReason?: string | null;
  layerLengthRatio?: number | null;
  truncationSignals?: string[] | null;
};

const ORIGIN_BLURBS: Record<string, string> = {
  layer_clean: 'Stored from the document\u2019s own text layer: the region resolved, carried no corruption markers, and passed the truncation check. The verdict above still describes the model\u2019s transcription of the same block.',
  layer_damaged: 'Stored from the model\u2019s transcription because the region\u2019s text layer carries corruption the printed page does not have.',
  region_truncated: 'Stored from the model\u2019s transcription because the resolved region did not look like the whole printed block.',
  region_unresolved: 'Stored from the model\u2019s transcription because no printed heading placed this field on the page.',
  no_layer: 'Stored from the model\u2019s transcription because the document has no usable text layer.',
  manual_repair: 'Stored as typed by a person from the rendered page.',
};

const TRUNCATION_LABELS: Record<string, string> = {
  shorter_than_model: 'region materially shorter than the model\u2019s capture',
  model_continues_past_region: 'the model\u2019s capture continues past the region\u2019s end',
  ends_mid_sentence: 'the region\u2019s last line breaks mid-sentence',
};

const FIELD_LABELS: Record<string, string> = {
  special_instructions_verbatim: 'Special instructions',
  broker_terms_verbatim: 'Broker terms',
};

const VERDICTS: Record<VerbatimVerdict, { label: string; tone: string; blurb: string }> = {
  verified: {
    label: 'Verified', tone: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    blurb: 'The capture matched the text the document prints in this region.',
  },
  transcription_damaged: {
    label: 'Transcription damaged', tone: 'border-red-300 bg-[#FFE8E8] text-red-800',
    blurb: 'The capture contains text-layer artifacts — characters copied out of a broken PDF text layer rather than read off the printed page.',
  },
  repaired: {
    label: 'Repaired by hand', tone: 'border-gold/50 bg-gold/10 text-[#2C2C2C]',
    blurb: 'A person typed this from the rendered page. It is not judged against the text layer.',
  },
  unverified: {
    label: 'Unverified', tone: 'border-amber-300 bg-amber-50 text-amber-900',
    blurb: 'The capture did not match the region closely enough to pass.',
  },
  layer_unreliable: {
    label: 'Layer unreliable', tone: 'border-amber-300 bg-amber-50 text-amber-900',
    blurb: 'The document\u2019s own text layer is too degraded to arbitrate this capture.',
  },
  no_layer: {
    label: 'No text layer', tone: 'border-slate-300 bg-slate-50 text-slate-700',
    blurb: 'The document has no usable text layer, so nothing could be compared.',
  },
  region_unresolved: {
    label: 'Region unresolved', tone: 'border-slate-300 bg-slate-50 text-slate-700',
    blurb: 'No heading on the page matched the anchor set, so no region could be compared.',
  },
};

const ARTIFACT_LABELS: Record<TranscriptionArtifact['kind'], string> = {
  pilcrow: 'Pilcrow (¶) standing in for printed glyphs',
  control_character: 'Control character',
  entity_chain: 'Repeated HTML entity escape',
  replacement_character: 'Replacement character (\uFFFD)',
};

const when = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * The stored shape is the ENVELOPE the writer builds, not a bare array.
 *
 * `set_load_verbatim_verification` writes
 * `{ checked_at, checked_by, fields: [...] }` — the load-level audit stamp an
 * array cannot carry. The card read the column as the array itself, so the
 * first load with a real record threw `records.map is not a function` and took
 * the whole page down with it. The envelope stays canonical; this derives the
 * list from it.
 *
 * A bare array is still accepted: in-memory review results have that shape
 * before they are ever written.
 */
export function normalizeVerification(raw: unknown): {
  records: StoredVerification[];
  checkedAt: string | null;
} {
  const asRecords = (v: unknown): StoredVerification[] =>
    (Array.isArray(v) ? v : []).filter(
      (r): r is StoredVerification => !!r && typeof r === 'object' && !Array.isArray(r),
    );

  if (Array.isArray(raw)) return { records: asRecords(raw), checkedAt: null };

  if (raw && typeof raw === 'object') {
    const env = raw as { fields?: unknown; checked_at?: unknown };
    return {
      records: asRecords(env.fields),
      checkedAt: typeof env.checked_at === 'string' ? env.checked_at : null,
    };
  }

  return { records: [], checkedAt: null };
}

export default function VerbatimVerificationCard({ load }: { load: LoadDetail }) {
  const { records, checkedAt } = normalizeVerification(
    (load as unknown as { verbatim_verification?: unknown }).verbatim_verification,
  );

  const repairerIds = Array.from(new Set(
    records.map(r => r.repaired_by).filter((v): v is string => !!v),
  ));

  const { data: names } = useQuery({
    queryKey: ['verbatim-repairers', repairerIds.sort().join(',')],
    enabled: repairerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', repairerIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach(p => {
        map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Staff';
      });
      return map;
    },
  });

  // A load with every capture verified needs no card: the flag is the point.
  // A capture taken from the page instead of the model is notable too — the
  // origin of stored broker-authored text has to be answerable later.
  const notable = records.filter(r =>
    r.verdict !== 'verified' || r.source === 'manual_repair' || r.valueOrigin === 'text_layer');
  if (!records.length || !notable.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldQuestion className="h-4 w-4 text-[#555555]" />
          Verbatim capture verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Per-stop captures repeat the same field name, so the field alone is
            not unique; the position within the stored envelope is. */}
        {notable.map((r, i) => (
          <VerificationRow
            key={`${r.field}-${i}`}
            record={r}
            repairedByName={r.repaired_by ? names?.[r.repaired_by] ?? null : null}
            checkedAt={checkedAt}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function VerificationRow({ record, repairedByName, checkedAt }: {
  record: StoredVerification;
  repairedByName: string | null;
  /** Envelope-level stamp, used when a record carries no `verified_at`. */
  checkedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const spec = VERDICTS[record.verdict] ?? VERDICTS.unverified;
  const artifacts = record.transcriptionDamage ?? [];
  const repaired = record.source === 'manual_repair';
  const repairedAt = when(record.repaired_at);

  return (
    <div className="rounded-md border border-border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium text-[#2C2C2C]">
            {FIELD_LABELS[record.field] ?? record.field}
          </span>
          <Badge variant="outline" className={spec.tone}>
            {record.verdict === 'verified'
              ? <CheckCircle2 className="mr-1 h-3 w-3" />
              : <AlertTriangle className="mr-1 h-3 w-3" />}
            {spec.label}
          </Badge>
          {repaired ? (
            <Badge variant="outline" className="border-gold/50 bg-gold/10 text-[#2C2C2C]">
              <PenLine className="mr-1 h-3 w-3" />
              Manually repaired
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-300 bg-[#E8F0FF] text-slate-700">
              <FileText className="mr-1 h-3 w-3" />
              {record.valueOrigin === 'text_layer' ? 'Stored from the page' : 'Stored from the model'}
            </Badge>
          )}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto gap-1 text-xs">
              Details
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {repaired ? (
          <p className="px-3 pb-3 text-xs text-[#555555]">
            Typed from the rendered page
            {repairedByName ? ` by ${repairedByName}` : ''}
            {repairedAt ? ` on ${repairedAt}` : ''}.
          </p>
        ) : null}

        <CollapsibleContent>
          <div className="space-y-2 border-t border-border p-3 text-xs text-[#555555]">
            <p>{spec.blurb}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              <Fact label="Similarity" value={
                record.similarity === null ? '—' : `${Math.round(record.similarity * 1000) / 10}%`} />
              <Fact label="Region source" value={record.regionSource === 'anchor' ? `Anchor: ${record.anchorId ?? '—'}` : 'None'} />
              <Fact label="Region failure" value={record.regionFailure ?? '—'} />
              <Fact label="Layer degradation" value={
                record.layerDegradation === null ? '—' : `${Math.round(record.layerDegradation * 1000) / 10}%`} />
              <Fact label="Checked" value={when(record.verified_at) ?? when(checkedAt) ?? '—'} />
            </dl>

            {record.missingTokens?.length ? (
              <p>
                <span className="font-medium text-[#2C2C2C]">Tokens the region prints but the capture dropped: </span>
                {record.missingTokens.join(', ')}
              </p>
            ) : null}

            {record.unknownWords?.length ? (
              <p>
                <span className="font-medium text-[#2C2C2C]">Words the capture prints but the page does not: </span>
                {record.unknownWords.join(', ')}
              </p>
            ) : null}


            {artifacts.length ? (
              <div className="space-y-1">
                <p className="font-medium text-[#2C2C2C]">Artifacts found in the capture</p>
                <ul className="space-y-1">
                  {artifacts.map((a, i) => (
                    <li key={`${a.kind}-${a.offset}-${i}`} className="rounded bg-[#F9F9F9] p-2">
                      <span className="font-medium">{ARTIFACT_LABELS[a.kind] ?? a.kind}</span>
                      {' at offset '}{a.offset}
                      {a.context ? <span className="mt-0.5 block font-mono">{a.context}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[#8a8a8a]">{label}</dt>
      <dd className="text-[#2C2C2C]">{value}</dd>
    </div>
  );
}
