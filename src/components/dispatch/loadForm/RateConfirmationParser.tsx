import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  AlertTriangle, Check, FileText, Loader2, Sparkles, Upload, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/loadFormat';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import { normalizeImportedName } from '@/lib/textNormalize';
import { pdfFileToImages } from '@/lib/pdfToImages';
import { useFacilities } from '@/hooks/useFacilities';
import type { Facility } from '@/lib/facilities';
import { matchFacilities } from '@/lib/facilityMatch';
import type { LoadFormValues } from '@/pages/dispatch/loadFormSchema';
import {
  collectLoadoutFields, applyParsedToForm, assessLoadout, fileToBase64, matchBroker,
  validateRateConFile,
  type BrokerCandidate, type LoadoutAssessment, type ParsedRateConfirmation,
  type UnassignedRateLine,
  parserContractWarning,
} from '@/lib/rateConfirmation';
import BrokerDialog, { type BrokerDialogValues } from './BrokerDialog';
import { appendNote, brokerAddressPrefill } from '@/lib/brokerAddressPrefill';
import BrokerCandidateRow from './BrokerCandidateRow';
import { verifyParsedVerbatim, type VerbatimCheck } from '@/lib/verbatimCheck';
import { logParserDiagnostics, type DiagnosticWriteResult } from '@/lib/parserDiagnostics';
import {
  buildParseFingerprint, fingerprintSummary, type ParseRunFingerprint,
} from '@/lib/parseFingerprint';

import { useLoadTypeChange, type LoadoutField } from './useLoadTypeChange';


interface Props {
  /** The parsed file is attached to the load as its rate confirmation after saving. */
  onSourceFileChange: (file: File | null) => void;
  /** Broker name read off the document, shown in the Broker field until it is linked. */
  onExtractedBroker?: (name: string | null) => void;
  /** Directory facilities that look like each parsed stop, keyed by stop index. */
  onFacilitySuggestions?: (byStopIndex: Record<number, Facility[]>) => void;
  /** The raw extraction, lifted so the host can run its own checks on it. */
  onParsed?: (result: ParsedRateConfirmation | null) => void;
}

/** functions.invoke hides the response body — dig the real message out of it. */

/** A parse that produced nothing is a failure, never a silent "found nothing". */
function isEmptyResult(r: ParsedRateConfirmation): boolean {
  return (
    !r.broker?.company_name?.value &&
    !r.load?.broker_load_number?.value &&
    !r.load?.bol_number?.value &&
    (r.rate?.total?.value ?? null) === null &&
    (r.rate?.linehaul?.value ?? null) === null &&
    (r.rate?.line_items?.length ?? 0) === 0 &&
    (r.stops?.length ?? 0) === 0
  );
}

async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch { /* fall through */ }
  }
  return getDbErrorMessage(error, fallback);
}

export default function RateConfirmationParser({
  onSourceFileChange, onExtractedBroker, onFacilitySuggestions, onParsed,
}: Props) {
  const form = useFormContext<LoadFormValues>();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[] | null>(null);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedRateConfirmation | null>(null);
  const [verify, setVerify] = useState<string[]>([]);
  const [verbatim, setVerbatim] = useState<VerbatimCheck[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedRateLine[]>([]);
  const [candidates, setCandidates] = useState<BrokerCandidate[]>([]);
  const [brokerResolved, setBrokerResolved] = useState(false);
  const [brokerDialogOpen, setBrokerDialogOpen] = useState(false);
  const [brokerDialogInitial, setBrokerDialogInitial] = useState<Partial<BrokerDialogValues>>({});
  const [brokerAddressSource, setBrokerAddressSource] = useState<string | null>(null);
  const { data: facilities } = useFacilities();
  const [loadout, setLoadout] = useState<LoadoutAssessment | null>(null);
  /** null = unanswered; the banner stays visible after an answer so it can be reversed. */
  const [loadoutAnswer, setLoadoutAnswer] = useState<'yes' | 'no' | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticWriteResult | null>(null);
  const [fingerprint, setFingerprint] = useState<ParseRunFingerprint | null>(null);
  const [showFingerprint, setShowFingerprint] = useState(false);

  const { changeLoadType, undoLastChange, redoLastChange, canUndo, canRedo } = useLoadTypeChange(form);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Render PDF pages with pdf.js — browsers do not reliably display PDFs in <object>.
  // The effect must NOT depend on the state it sets: `setPdfRendering(true)` used to
  // re-run it, and the cleanup cancelled the render that was already in flight.
  const renderedForRef = useRef<File | null>(null);
  useEffect(() => {
    if (!file || file.type !== 'application/pdf' || !showSource) return;
    if (renderedForRef.current === file) return;
    renderedForRef.current = file;
    let cancelled = false;
    setPdfRendering(true);
    setPdfError(null);
    pdfFileToImages(file, { scale: 1.6, maxPages: 15 })
      .then(pages => { if (!cancelled) setPdfPages(pages); })
      .catch(err => {
        if (!cancelled) setPdfError(err instanceof Error ? err.message : 'Could not render this PDF.');
      })
      .finally(() => { if (!cancelled) setPdfRendering(false); });
    return () => { cancelled = true; };
  }, [file, showSource]);

  const stops = form.watch('stops') ?? [];
  const middleStops = stops
    .map((s, i) => ({ i, label: `Stop ${i + 1}${s.city ? ` — ${s.city}` : ''}` }))
    .filter(({ i }) => i > 0 && i < stops.length - 1);

  const reset = () => {
    setParsed(null);
    setVerify([]);
    setVerbatim([]);
    setUnassigned([]);
    setCandidates([]);
    setBrokerResolved(false);
    setLoadout(null);
    onParsed?.(null);
    onFacilitySuggestions?.({});
  };

  const pickFile = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    reset();
    setPdfPages(null);
    setPdfError(null);
    renderedForRef.current = null;
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      onSourceFileChange(null);
      return;
    }
    const problem = validateRateConFile(f);
    if (problem) {
      toast({ variant: 'destructive', description: problem });
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    onSourceFileChange(f);
  };

  const parse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const file_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('parse-rate-confirmation', {
        body: { file_base64, mime_type: file.type, file_name: file.name },
      });
      if (error) throw error;

      const parsedResult = data as ParsedRateConfirmation;
      if (!parsedResult?.stops || isEmptyResult(parsedResult)) {
        throw new Error(
          'The document was read but no load data could be extracted from it. Enter the load manually, or try a clearer copy of the rate confirmation.',
        );
      }

      const contractWarning = parserContractWarning(parsedResult);
      if (contractWarning) {
        toast({ variant: 'destructive', title: 'Parser version mismatch', description: contractWarning });
      }

      // Verification and source selection run BEFORE the form is filled: where
      // the page's own text layer is clean it is the better source than a
      // transcription of it, so the value the form receives is the adopted one.
      const { checks, layer, adopted } = await verifyParsedVerbatim(file, parsedResult);
      const result = adopted;
      result.verbatim_verification = checks;
      setVerbatim(checks);

      const applied = applyParsedToForm(result, (name, value) =>
        form.setValue(name as never, value as never, { shouldDirty: true, shouldValidate: false }));

      // One comparable record per run. Two runs of the same document diverged
      // with nothing kept to say whether the text layer or the model moved.
      // The discards from THIS apply travel with it: the fingerprint printed
      // both appointment windows while both form fields were empty, because it
      // read the raw values and the form read them through the confidence gate.
      setFingerprint(buildParseFingerprint({ layer, checks, parsed: result, discarded: applied.discarded }));

      // The loadout assessment is scored from the model's signals AND the
      // printed text layer, because one model answer was not a stable enough
      // basis for a feature to exist: the same document scored above the
      // threshold three times and below it once, and below it the banner
      // rendered nothing at all.
      const loadoutAssessment = assessLoadout(result, layer?.text ?? null);

      // Anchor and label misses are filed here, on the create path. The same
      // call runs on the revision path — a check that exists on only one of the
      // two is the failure mode this wiring is guarding against.
      // Collected and written are reported separately: zero written is only a
      // clean document when zero were collected, and reading it as success is
      // how a batch the database rejected passed for a healthy parse.
      const result_ = await logParserDiagnostics(applied.classified, {
        documentLabel: file.name,
        parserContract: (result as { parser_contract?: number }).parser_contract ?? null,
      }, loadoutAssessment);
      setDiagnostics(result_);







      setParsed(result);
      onParsed?.(result);
      onExtractedBroker?.(result.broker?.company_name?.value?.trim() || null);
      setVerify(applied.verify);
      setUnassigned(applied.unassigned);
      setLoadout(loadoutAssessment);
      setLoadoutAnswer(null);

      // Suggest-only: never rewrite what the broker printed, just point at our record.
      const filled = form.getValues('stops') ?? [];
      const suggestions: Record<number, Facility[]> = {};
      filled.forEach((s, i) => {
        const hits = matchFacilities(s, facilities ?? []);
        if (hits.length) suggestions[i] = hits;
      });
      onFacilitySuggestions?.(suggestions);
      setShowSource(true);

      const found = await matchBroker(result.broker).catch(() => []);
      setCandidates(found);
      setBrokerResolved(false);

      toast({
        description: applied.stopCount
          ? `Rate confirmation read. ${applied.stopCount} stops pre-filled — review before saving.`
          : 'Rate confirmation read. Review the pre-filled fields before saving.',
      });
    } catch (e) {
      logDbError('parse-rate-confirmation', e, { name: file.name });
      const message = await invokeErrorMessage(e, 'Could not read that rate confirmation.');
      toast({ variant: 'destructive', title: 'Parsing failed', description: message });
    } finally {
      setParsing(false);
    }
  };

  /*
   * Verbatim verification still runs on every parse and still persists with the
   * load — it is simply not shown here. Nothing a dispatcher is creating depends
   * on it: a capture on the create path replaces no stored value, and the rate
   * confirmation PDF stays attached as the authority for any disputed charge.
   * The verdicts are read on Load Detail and in Parser Diagnostics, which staff
   * open deliberately. The repair affordance lives on the revision path, where a
   * corrupted capture would overwrite a good stored value.
   */




  const chooseBroker = (id: string) => {
    form.setValue('broker_id', id, { shouldDirty: true });
    setBrokerResolved(true);
    onExtractedBroker?.(null);
  };

  const openCreateBrokerDialog = () => {
    if (!parsed) return;
    const name = parsed.broker.company_name.value?.trim();
    if (!name) {
      toast({ variant: 'destructive', description: 'No broker name was found on the document.' });
      return;
    }
    const address = brokerAddressPrefill(parsed.broker);
    setBrokerDialogInitial({
      company_name: normalizeImportedName(name),
      mc_number: parsed.broker.mc_number.value ?? '',
      primary_contact_name: parsed.broker.contact_name.value ?? '',
      primary_contact_phone: parsed.broker.contact_phone.value ?? '',
      primary_contact_email: parsed.broker.contact_email.value ?? '',
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      city: address.city,
      state: address.state,
      zip: address.zip,
      // Provenance survives the save: the brokers table holds one address and no
      // indication of whether it is corporate or remit-to.
      notes: appendNote('', address.note),
    });
    setBrokerAddressSource(address.sourceLabel);
    setBrokerDialogOpen(true);
  };

  const handleBrokerCreated = (id: string) => {
    chooseBroker(id);
    toast({ description: `${normalizeImportedName(parsed?.broker?.company_name?.value ?? '')} added and selected.` });
  };

  const assignLine = (line: UnassignedRateLine, target: string) => {
    if (target === 'load') {
      const current = form.getValues('charges') ?? [];
      form.setValue(
        'charges',
        [...current, { charge_type: line.category, description: line.description, amount: String(line.amount) }],
        { shouldDirty: true },
      );
      toast({ description: `${formatCurrency(line.amount)} added to the load total.` });
    } else if (target !== 'ignore') {
      const index = Number(target);
      form.setValue(`stops.${index}.stopoff_charge_amount` as never, String(line.amount) as never, { shouldDirty: true });
      toast({ description: `${formatCurrency(line.amount)} applied to stop ${index + 1}.` });
    }
    setUnassigned(prev => prev.filter(l => l.id !== line.id));
  };

  /**
   * The banner answers through the same hook the Load Type buttons use, so the
   * parsed amount carries into the relocation fee here exactly as it does there.
   */
  const confirmLoadout = () => {
    if (!parsed) return;
    changeLoadType('loadout', {
      fields: collectLoadoutFields(parsed) as Partial<Record<LoadoutField, string>>,
    });
    setLoadoutAnswer('yes');
    toast({ description: 'Switched to Loadout and filled the trailer details.' });
  };

  const isPdf = file?.type === 'application/pdf';

  return (
    <section className="rounded-lg border border-gold/40 bg-gold/5 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Sparkles className="h-5 w-5 text-gold shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Parse Rate Confirmation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload the broker&rsquo;s rate confirmation and the form fills itself. Nothing saves until you review it.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={e => pickFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          {file ? 'Choose a different file' : 'Choose PDF or image'}
        </Button>
        {file && (
          <>
            <Button
              type="button"
              className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
              onClick={() => void parse()}
              disabled={parsing}
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {parsing ? 'Reading document…' : parsed ? 'Parse again' : 'Parse'}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-[220px]">{file.name}</span>
            </span>
            <Button
              type="button" variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => pickFile(null)} aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {file && (
        <p className="text-xs text-muted-foreground">
          This file is attached to the load as its rate confirmation once you save.
        </p>
      )}

      {diagnostics !== null && (() => {
        const unresolved = verbatim.filter(v => v.regionFailure).length;
        const lost = diagnostics.collected - diagnostics.written;
        // Zero recorded is only a clean document when nothing was collected AND
        // nothing on screen is unresolved. Anything else is a failure to log,
        // and the two numbers are stated so the gap is the message.
        //
        // This line is a record of the parser's own bookkeeping, so it is worded
        // and toned as such. A region the parser could not locate is a parser
        // problem, never a dispatcher's: it writes nothing to the load, the
        // extracted fields above stand on their own, and the attached PDF remains
        // the authority. Hence a warning tone rather than a destructive one, and
        // an explicit sentence that the load in progress is unaffected.
        const failed = lost > 0 || (diagnostics.written === 0 && unresolved > 0);
        return (
          <div className={failed
            ? 'rounded-md border border-warning/40 bg-warning/10 p-2.5 space-y-1'
            : 'space-y-1'}>
            <p className={failed ? 'text-xs font-medium text-foreground' : 'text-xs text-muted-foreground'}>
              {failed
                ? `The parser's own log did not record: ${diagnostics.collected} unrecognised item${diagnostics.collected === 1 ? '' : 's'} collected, ${diagnostics.written} recorded` +
                  (unresolved > 0 ? `, with ${unresolved} field${unresolved === 1 ? '' : 's'} the parser could not locate on the page.` : '.')
                : diagnostics.collected === 0
                  ? 'No parser diagnostics recorded — nothing on this document went unrecognised.'
                  : `${diagnostics.written} parser diagnostic${diagnostics.written === 1 ? '' : 's'} recorded from this parse — a note for staff, not something to act on here.`}
            </p>
            {failed && (
              <p className="text-xs text-muted-foreground">
                This is about the parser&rsquo;s logging, not this load. The extracted fields above are
                unaffected and the rate confirmation stays attached as the record.
              </p>
            )}
            {failed && diagnostics.error && (
              // Each part on its own line. The code identifies the class of
              // failure, so it leads; a flattened sentence hid it before.
              <div className="space-y-0.5 text-xs">
                <p className="font-medium text-foreground">
                  {diagnostics.error.code
                    ? `Insert rejected — ${diagnostics.error.code}`
                    : 'Insert rejected — no error code returned'}
                </p>
                <p className="text-muted-foreground">{diagnostics.error.message}</p>
                {diagnostics.error.details && diagnostics.error.details !== diagnostics.error.message && (
                  <p className="text-muted-foreground">Details: {diagnostics.error.details}</p>
                )}
                {diagnostics.error.hint && (
                  <p className="text-muted-foreground">Hint: {diagnostics.error.hint}</p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {fingerprint && (
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
          <button
            type="button"
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => setShowFingerprint(v => !v)}
          >
            {showFingerprint ? 'Hide' : 'Show'} parse run fingerprint
          </button>
          {showFingerprint && (
            <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {/* Same document, two runs: a matching layer hash with different
                  field outcomes means the model moved, not the extraction. */}
              <p className="font-mono break-all">{fingerprintSummary(fingerprint)}</p>
              {/* Which builds produced this line. Three "missing content" reports
                  in this panel turned out to be one stale bundle plus one stale
                  edge deploy, and nothing on screen could have told them apart. */}
              <p className="font-mono break-all">
                client build {typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : 'dev'}
                {' · '}parser build {parsed?.parser_build
                  ? `contract ${parsed.parser_build.contract} @ ${parsed.parser_build.built_at}${parsed.parser_build.code_hash ? ` · ${parsed.parser_build.code_hash}` : ''}`
                  : 'unknown'}
              </p>
              <ul className="space-y-0.5">
                {fingerprint.fields.map(f => (
                  <li key={f.field} className="font-mono">{f.field}: {f.verdict}</li>
                ))}
              </ul>
              {/* A printed value used to mean nothing about whether the form got
                  it. Each appointment now carries the confidence the form's gate
                  reads, and anything the gate refused is listed below. */}
              <ul className="space-y-0.5">
                {fingerprint.appointments.map(a => (
                  <li key={a.stop} className="font-mono">
                    stop {a.stop} appt: {a.start ?? 'null'} [{a.startConfidence ?? '—'}]
                    {a.end ? ` → ${a.end} [${a.endConfidence ?? '—'}]` : ''}
                  </li>
                ))}
              </ul>
              {fingerprint.discarded.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">
                    Discarded by the low-confidence gate — read from the document but NOT filled in:
                  </p>
                  <ul className="space-y-0.5">
                    {fingerprint.discarded.map(d => (
                      <li key={d.field} className="font-mono">
                        {d.field}: {d.value} [{d.confidence}]
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Origin, not verdict. The verdict judges the model's reading of
                  the page; this says which text the load will actually hold. */}
              <VerbatimSourceRows checks={verbatim} />


            </div>
          )}
        </div>
      )}


      {/* Rendered on EVERY parse, suspected or not. Gating the whole block on
          `suspected` meant a score that drifted one point below the threshold
          deleted the only route to the Loadout switch — and with it the derived
          use window, which runs inside the load-type change. An assessment that
          ran always says so, and the switch is always reachable. */}
      {parsed && loadout && (
        <div className={`rounded-md border p-3 space-y-2 ${
          loadout.suspected ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted/30'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className={`h-4 w-4 ${loadout.suspected ? 'text-warning' : 'text-muted-foreground'}`} />
            {loadout.suspected
              ? 'This looks like a loadout (trailer relocation)'
              : 'This does not look like a loadout'}
          </div>
          <p className="text-xs text-muted-foreground">
            Loadout score {loadout.score} of {loadout.maxScore} — threshold 4.
            {loadout.documentRead ? ' Scored from the model and the printed page.' : ' Scored from the model only: no text layer was readable.'}
          </p>
          {loadout.suppressedPoints > 0 && (
            <p className="text-xs text-muted-foreground">
              {loadout.suppressedPoints} point{loadout.suppressedPoints === 1 ? '' : 's'} withheld from{' '}
              {loadout.signals.filter(s => s.contradicted).map(s => s.key).join(', ')} — the model reported{' '}
              {loadout.suppressedPoints === 1 ? 'it' : 'them'} but the printed page says otherwise. It would have
              scored {loadout.unsuppressedScore} of {loadout.maxScore} if contradicted signals counted.
            </p>
          )}
          {loadout.reasons.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              {loadout.reasons.map(r => <li key={r}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No loadout signals fired on this document.</p>
          )}
          {loadout.disagreements.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Model and printed page disagree on: {loadout.disagreements.map(d => d.key).join(', ')}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {loadoutAnswer === null && loadout.suspected && (
              <>
                <Button type="button" size="sm" className="bg-gold text-surface-dark hover:bg-gold-light" onClick={confirmLoadout}>
                  Yes — switch to Loadout
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setLoadoutAnswer('no')}>
                  No — keep as is
                </Button>
              </>
            )}
            {loadoutAnswer === null && !loadout.suspected && (
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => { confirmLoadout(); setLoadoutAnswer('yes'); }}
              >
                Switch to Loadout anyway
              </Button>
            )}
            {loadoutAnswer === 'yes' && (
              <>
                <span className="text-xs font-medium text-foreground">Switched to Loadout.</span>
                <Button
                  type="button" size="sm" variant="outline" disabled={!canUndo}
                  onClick={() => { undoLastChange(); setLoadoutAnswer('no'); }}
                >
                  Undo
                </Button>
              </>
            )}
            {loadoutAnswer === 'no' && (
              <>
                <span className="text-xs font-medium text-foreground">Kept as is.</span>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => {
                    // Redo replays the recorded snapshot — the trailer details
                    // and the use window come back without a re-parse.
                    if (canRedo) redoLastChange(); else confirmLoadout();
                    setLoadoutAnswer('yes');
                  }}
                >
                  Switch to Loadout
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {parsed && !brokerResolved && (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
          {/* The broker is who pays the invoice — it is the headline of this
              card, not a caption under its own section label. */}
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Broker on the document
          </p>
          <div className="space-y-0.5">
            <p className="text-base font-semibold leading-tight text-foreground">
              {parsed.broker.company_name.value ?? 'No name found'}
            </p>
            {parsed.broker.mc_number.value && (
              <p className="text-xs text-muted-foreground">MC {parsed.broker.mc_number.value}</p>
            )}
          </div>

          {candidates.length > 0 ? (
            <div className="space-y-1.5">
              {candidates.map(c => (
                <BrokerCandidateRow
                  key={c.id}
                  candidate={c}
                  onSelect={() => chooseBroker(c.id)}
                  actionLabel="Use this broker"
                  showBadge
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No broker in the directory matches this document.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => openCreateBrokerDialog()}>
              Create new broker from document
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setBrokerResolved(true)}>
              I&rsquo;ll pick the broker myself
            </Button>
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="rounded-md border border-info/40 bg-info/10 p-3 space-y-2">
          <p className="text-sm font-semibold text-foreground">Rate lines that need a decision</p>
          <p className="text-xs text-muted-foreground">
            {middleStops.length
              ? 'These charges were on the document. Attach each one to a stop, add it to the load total, or leave it out.'
              : 'These charges were on the document. This load has no middle stop, so attach each one to the load total or leave it out.'}
          </p>
          {unassigned.map(line => (
            <div key={line.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
              <span className="text-sm text-foreground">{line.description}</span>
              <span className="text-sm font-semibold text-foreground">{formatCurrency(line.amount)}</span>
              {line.stop_hint && <span className="text-xs text-muted-foreground">({line.stop_hint})</span>}
              <div className="ml-auto w-full sm:w-56">
                <Select onValueChange={v => assignLine(line, v)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                  <SelectContent>
                    {middleStops.map(s => (
                      <SelectItem key={s.i} value={String(s.i)}>{s.label} stop-off charge</SelectItem>
                    ))}
                    <SelectItem value="load">Add to load total (no stop)</SelectItem>
                    <SelectItem value="ignore">Leave it out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}

      {verify.length > 0 && (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
          <p className="text-sm font-semibold text-foreground">Verify these against the document</p>
          <div className="flex flex-wrap gap-1.5">
            {verify.map(v => (
              <Badge key={v} variant="outline" className="border-warning/40 bg-warning/10 text-[11px] font-normal">
                {v}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Anything the parser was unsure of was left blank on purpose.
          </p>
        </div>
      )}



      {previewUrl && (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowSource(v => !v)}>
            {showSource ? 'Hide source document' : 'Show source document'}
          </Button>
          {showSource && (
            <div className="rounded-md border border-border bg-background overflow-hidden">
              {isPdf ? (
                <div className="max-h-[70vh] overflow-y-auto">
                  {pdfRendering && (
                    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rendering the document…
                    </div>
                  )}
                  {pdfError && (
                    <p className="p-4 text-sm text-muted-foreground">
                      {pdfError}{' '}
                      <a href={previewUrl} target="_blank" rel="noreferrer" className="text-gold underline">
                        Open it in a new tab
                      </a>.
                    </p>
                  )}
                  {pdfPages?.map((page, i) => (
                    <figure key={i} className="border-b border-border last:border-b-0">
                      <img src={page} alt={`Rate confirmation page ${i + 1}`} className="w-full" />
                      <figcaption className="px-3 py-1.5 text-[11px] text-muted-foreground">
                        Page {i + 1} of {pdfPages.length}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <img src={previewUrl} alt="Rate confirmation source document" className="max-h-[70vh] w-full object-contain" />
              )}
            </div>
          )}
        </div>
      )}

      <BrokerDialog
        open={brokerDialogOpen}
        onOpenChange={setBrokerDialogOpen}
        initial={brokerDialogInitial}
        addressSourceLabel={brokerAddressSource}
        onCreated={handleBrokerCreated}
        onUseExisting={id => chooseBroker(id)}
      />
    </section>
  );
}
