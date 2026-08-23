import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { pdfFileToImages } from '@/lib/pdfToImages';
import type { VerbatimCheck } from '@/lib/verbatimCheck';

/**
 * One verbatim field's verdict, plus — when the capture carries text-layer
 * damage — the printed page and a box to type what it actually says.
 *
 * The repair box is gated on the page rendering. Asking a dispatcher to correct
 * a span they cannot see would just move the guess from the model to them.
 */

export const VERDICT_COPY: Record<string, { label: string; tone: string; hint: string }> = {
  verified: {
    label: 'Matches the page',
    tone: 'border-success/40 bg-success/10',
    hint: 'The transcription matches the printed text.',
  },
  transcription_damaged: {
    label: 'Capture is corrupted',
    tone: 'border-destructive/50 bg-destructive/10',
    hint: 'The capture contains characters the page does not print, so the model copied the PDF\u2019s broken text instead of reading the page. Type what the document shows.',
  },
  repaired: {
    label: 'Repaired by hand',
    tone: 'border-primary/40 bg-primary/10',
    hint: 'Typed off the printed page by a person, so the PDF\u2019s text layer no longer decides it.',
  },
  unverified: {
    label: 'Does not match the page',
    tone: 'border-destructive/40 bg-destructive/10',
    hint: 'Read this field off the document before saving.',
  },
  layer_unreliable: {
    label: 'Page text is damaged',
    tone: 'border-warning/40 bg-warning/10',
    hint: 'The PDF\u2019s own text is degraded here, so the check cannot judge the transcription.',
  },
  no_layer: {
    label: 'No text layer',
    tone: 'border-border bg-muted',
    hint: 'This document is a scan \u2014 nothing to check against.',
  },
  region_unresolved: {
    label: 'Field not found on the page',
    tone: 'border-border bg-muted',
    hint: 'No printed heading matched, so nothing was compared.',
  },
};

const ARTIFACT_NAME: Record<string, string> = {
  pilcrow: 'Paragraph mark (\u00b6)',
  control_character: 'Control character',
  entity_chain: 'Escaped entity',
  replacement_character: 'Replacement character (\ufffd)',
};

export const pct = (n: number | null) => (n === null ? '\u2014' : `${(n * 100).toFixed(1)}%`);

export const fieldLabel = (field: string) =>
  field.replace(/_verbatim$/, '').replace(/_/g, ' ');

interface Props {
  check: VerbatimCheck;
  /** The source document, so the damaged page can be rendered for the repair. */
  file: File | null;
  /** The capture as it currently stands, repaired or not. */
  value: string;
  /** Called with the hand-typed replacement. */
  onRepair?: (text: string) => void;
  /** Extra line under the verdict, e.g. which stop this belongs to. */
  subtitle?: string;
}

export default function VerbatimRepairField({ check, file, value, onRepair, subtitle }: Props) {
  const copy = VERDICT_COPY[check.verdict] ?? VERDICT_COPY.region_unresolved;
  const damaged = (check.transcriptionDamage?.length ?? 0) > 0;
  const invented = (check.unknownWords?.length ?? 0) > 0;
  // A word the page does not print is repairable off the page in exactly the
  // same way a corrupted span is, and for the same reason.
  const repairable = (damaged || invented) && !!onRepair;


  const [pageImage, setPageImage] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const page = check.page;

  useEffect(() => {
    if (!repairable || !file || file.type !== 'application/pdf' || !page) return;
    let cancelled = false;
    setRendering(true);
    setRenderError(null);
    pdfFileToImages(file, { scale: 1.8, maxPages: page })
      .then(pages => { if (!cancelled) setPageImage(pages[page - 1] ?? null); })
      .catch(err => {
        if (!cancelled) setRenderError(err instanceof Error ? err.message : 'Could not render this page.');
      })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [repairable, file, page]);

  const canRepair = repairable && !!pageImage;

  return (
    <div className={`rounded border p-2 ${copy.tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground">{fieldLabel(check.field)}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        <Badge variant="outline" className="text-[11px] font-normal">{copy.label}</Badge>
        {check.source === 'manual_repair' && (
          <Badge variant="outline" className="text-[11px] font-normal">Hand-corrected</Badge>
        )}
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Similarity {pct(check.similarity)}
        {check.similarityPass === null ? '' : check.similarityPass ? ' (pass)' : ' (fail)'}
        {' \u00b7 '}Tokens {check.tokenPass === null ? '\u2014' : check.tokenPass ? 'all present' : `${check.missingTokens?.length ?? 0} missing`}
        {' \u00b7 '}Words {check.wordPass === null ? '\u2014' : check.wordPass ? 'all on the page' : `${check.unknownWords?.length ?? 0} not on the page`}
        {' \u00b7 '}Page damage {pct(check.layerDegradation)}
        {page ? ` \u00b7 Page ${page}` : ''}
      </p>

      {check.missingTokens && check.missingTokens.length > 0 && (
        <p className="mt-0.5 text-[11px] text-foreground">Dropped: {check.missingTokens.join(', ')}</p>
      )}

      {invented && (
        <p className="mt-0.5 text-[11px] text-foreground">
          Contains words the page does not print — {check.unknownWords!.join(', ')}
        </p>
      )}

      <p className="mt-0.5 text-[11px] text-muted-foreground">{copy.hint}</p>

      {check.regionFailure && (
        <details className="mt-2 rounded border border-border bg-background/70 p-2">
          <summary className="cursor-pointer text-[11px] font-medium text-foreground">
            {REGION_FAILURE_COPY[check.regionFailure] ?? check.regionFailure}
            <span className="ml-1 font-mono font-normal text-muted-foreground">
              ({check.regionFailure})
            </span>
          </summary>
          {check.documentHeadings?.length ? (
            <div className="mt-1.5">
              <p className="text-[11px] text-muted-foreground">
                Heading-shaped lines the parser saw and did not recognise:
              </p>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-foreground">
                {check.documentHeadings.map((h, i) => <li key={`${h}-${i}`}>{h}</li>)}
              </ul>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              No heading-shaped lines were found in this document&rsquo;s text layer.
            </p>
          )}
        </details>
      )}




      {damaged && (
        <div className="mt-2 space-y-1 rounded border border-destructive/30 bg-background/70 p-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            {check.transcriptionDamage!.length} corrupted span
            {check.transcriptionDamage!.length === 1 ? '' : 's'} in the capture
          </p>
          {check.transcriptionDamage!.map((a, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">
              <span className="text-foreground">{ARTIFACT_NAME[a.kind] ?? a.kind}</span>
              {' — '}
              <span className="font-mono">{a.context}</span>
            </p>
          ))}
        </div>
      )}

      {repairable && (
        <div className="mt-2 space-y-2">
          {!page && (
            <p className="text-[11px] text-muted-foreground">
              The page this field was read from could not be located, so there is nothing to
              correct against. Fix the value on the field itself after reviewing the document.
            </p>
          )}
          {page && rendering && (
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering page {page}…
            </p>
          )}
          {page && renderError && (
            <p className="text-[11px] text-muted-foreground">
              Page {page} could not be rendered ({renderError}), so this capture cannot be corrected here.
            </p>
          )}
          {pageImage && (
            <figure className="overflow-hidden rounded border border-border bg-background">
              <img src={pageImage} alt={`Source document page ${page}`} className="max-h-[45vh] w-full object-contain" />
              <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                Page {page} as printed — type the span exactly as it reads here.
              </figcaption>
            </figure>
          )}
          {canRepair && (
            <>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={4}
                className="text-xs"
                aria-label={`Corrected ${fieldLabel(check.field)}`}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft.trim() || draft === value}
                  onClick={() => onRepair?.(draft.trim())}
                >
                  Save correction
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(value)}>
                  Reset
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
