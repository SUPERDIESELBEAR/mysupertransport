import { useState } from 'react';
import type { VerbatimCheck } from '@/lib/verbatimCheck';

/**
 * Where each stored verbatim capture came from, for THIS parse run.
 *
 * The verdict answers a different question — it judges the model's
 * transcription against the page — and a dispatcher cannot act on either, which
 * is why this lives inside the collapsed fingerprint rather than on the parse
 * screen proper. It exists so the outcome of source selection is readable off a
 * run without saving the load: which source won, why, how much of the model's
 * length the region carried, and which truncation signals refused it.
 *
 * The highlighted windows are the point of the preview. A dollar amount or an
 * email the model dropped is the exact thing adoption was built to recover, so
 * the stored text is quoted around those matches instead of asking anyone to
 * scan an 800-character block by eye.
 */

const ORIGIN_LABEL: Record<string, string> = {
  layer_clean: 'the region resolved, prints no corruption, and looks complete',
  layer_damaged: 'the region prints corruption the rendered page does not have',
  region_unresolved: 'no printed anchor placed this field on the page',
  no_layer: 'no text layer to read (scan, photo, or extraction failure)',
  region_boundary_uncertain:
    'the region resolved, but its boundaries do not look like the whole printed block',
  // Records stored before the rename still carry the old token.
  region_truncated:
    'the region resolved, but its boundaries do not look like the whole printed block',
  manual_repair: 'typed off the rendered page by a person',
};

const SIGNAL_LABEL: Record<string, string> = {
  shorter_than_model: 'region materially shorter than the model capture',
  model_continues_past_region: 'model read past the region boundary',
  ends_mid_sentence: 'region ends mid-sentence',
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MONEY = /\$\s?\d[\d,]*(?:\.\d{2})?/;

const WINDOW = 120;

export interface Quote {
  label: string;
  before: string;
  match: string;
  after: string;
}

/** A quoted window around the first match, or null when the value has none. */
export function quoteAround(value: string, re: RegExp, label: string): Quote | null {
  const m = re.exec(value);
  if (!m || m.index === undefined) return null;
  const start = Math.max(0, m.index - WINDOW);
  const end = Math.min(value.length, m.index + m[0].length + WINDOW);
  return {
    label,
    before: `${start > 0 ? '…' : ''}${value.slice(start, m.index)}`,
    match: m[0],
    after: `${value.slice(m.index + m[0].length, end)}${end < value.length ? '…' : ''}`,
  };
}

export function quotesFor(value: string): Quote[] {
  return [
    quoteAround(value, MONEY, 'dollar amount'),
    quoteAround(value, EMAIL, 'email address'),
  ].filter((q): q is Quote => q !== null);
}

function fieldLabel(c: VerbatimCheck): string {
  return c.parsedStopIndex === null ? c.field : `${c.field} (stop ${c.parsedStopIndex + 1})`;
}

function Row({ check }: { check: VerbatimCheck }) {
  const [open, setOpen] = useState(false);
  const fromPage = check.valueOrigin === 'text_layer';
  const ratio = check.layerLengthRatio === null || check.layerLengthRatio === undefined
    ? null
    : `${Math.round(check.layerLengthRatio * 100)}%`;
  const quotes = quotesFor(check.value ?? '');
  const modelLen = (check.modelValue ?? '').length;
  const storedLen = (check.value ?? '').length;

  return (
    <li className="rounded border border-border/60 bg-background/40 p-1.5">
      <p className="font-mono break-all">
        {fieldLabel(check)}:{' '}
        <span className="font-semibold text-foreground">
          {fromPage ? 'stored from the page' : 'stored from the model'}
        </span>
        {' · '}{check.originReason}
        {ratio ? ` · region/model length ${ratio}` : ''}
      </p>
      <p className="font-mono break-all">
        {ORIGIN_LABEL[check.originReason] ?? check.originReason}
        {' · '}stored {storedLen} chars, model {modelLen} chars
      </p>
      {check.truncationSignals?.length ? (
        <p className="font-mono break-all text-foreground">
          truncation signals: {check.truncationSignals
            .map(s => SIGNAL_LABEL[s] ?? s)
            .join(' + ')}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-1 text-xs underline-offset-2 hover:underline"
        onClick={() => setOpen(v => !v)}
      >
        {open ? 'Hide' : 'Show'} stored text
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          {quotes.length ? (
            quotes.map(q => (
              <p key={q.label} className="font-mono break-all">
                <span className="text-foreground">{q.label}:</span> {q.before}
                <mark className="bg-primary/25 px-0.5 font-semibold text-foreground">{q.match}</mark>
                {q.after}
              </p>
            ))
          ) : (
            <p className="font-mono">no dollar amount or email address in the stored value</p>
          )}
          <p className="font-mono break-all">
            head: {(check.value ?? '').slice(0, 200)}
            {storedLen > 200 ? '…' : ''}
          </p>
          {storedLen > 400 ? (
            <p className="font-mono break-all">tail: …{(check.value ?? '').slice(-200)}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function VerbatimSourceRows({ checks }: { checks: VerbatimCheck[] }) {
  if (!checks.length) return null;
  return (
    <div>
      <p className="font-medium text-foreground">
        Verbatim source — which text this load will store, per field:
      </p>
      <ul className="mt-1 space-y-1">
        {checks.map((c, i) => (
          <Row key={`${c.field}-${c.parsedStopIndex ?? 'load'}-${i}`} check={c} />
        ))}
      </ul>
    </div>
  );
}
