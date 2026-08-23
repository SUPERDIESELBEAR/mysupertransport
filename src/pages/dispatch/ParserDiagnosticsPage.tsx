import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  DIAGNOSTIC_KIND_LABELS, REGION_FAILURE_LABELS, fetchParserDiagnostics,
  resolveParserDiagnostic, type ParserDiagnosticRecord,
} from '@/lib/parserDiagnostics';

/**
 * What the rate-confirmation parser did not recognise, across every document.
 *
 * This exists to answer one question out loud: which headings and reference
 * labels do brokers print that the parser has never been taught? The log used
 * to live in memory and die on reload, which meant the answer was never
 * available at the moment a new broker's document was being parsed.
 */
export default function ParserDiagnosticsPage() {
  const qc = useQueryClient();
  const [includeResolved, setIncludeResolved] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['parser-diagnostics', includeResolved],
    queryFn: () => fetchParserDiagnostics({ includeResolved }),
  });

  const resolve = useMutation({
    mutationFn: resolveParserDiagnostic,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parser-diagnostics'] });
      toast({ description: 'Marked as taught.' });
    },
    onError: (e) => {
      logDbError('resolve parser diagnostic', e, {});
      toast({
        variant: 'destructive',
        description: getDbErrorMessage(e, 'Could not update that entry.'),
      });
    },
  });

  const rows = data ?? [];
  const grouped = rows.reduce<Record<string, ParserDiagnosticRecord[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#2C2C2C]">Parser diagnostics</h1>
          <p className="text-sm text-[#555555]">
            Headings and reference labels the rate-confirmation parser did not recognise.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="resolved" checked={includeResolved} onCheckedChange={setIncludeResolved} />
            <Label htmlFor="resolved" className="text-sm">Include resolved</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-[#555555]">
            Nothing unrecognised has been logged. Every heading and reference label the parser has
            seen so far matched something it knows.
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([kind, entries]) => (
          <Card key={kind}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-gold" />
                {DIAGNOSTIC_KIND_LABELS[kind as keyof typeof DIAGNOSTIC_KIND_LABELS] ?? kind}
                <span className="text-xs font-normal text-[#555555]">({entries.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {entries.map(r => (
                <DiagnosticRow
                  key={r.id}
                  row={r}
                  onResolve={() => resolve.mutate(r.id)}
                  busy={resolve.isPending}
                />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function DiagnosticRow({ row, onResolve, busy }: {
  row: ParserDiagnosticRecord;
  onResolve: () => void;
  busy: boolean;
}) {
  const stamped = new Date(row.created_at);
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {row.field ? (
          <Badge variant="outline" className="border-border bg-[#F9F9F9]">{row.field}</Badge>
        ) : null}
        {row.label ? (
          <span className="font-mono text-sm text-[#1A1A1A]">“{row.label}”</span>
        ) : null}
        {row.failure ? (
          <span className="text-sm text-[#555555]">
            {REGION_FAILURE_LABELS[row.failure] ?? row.failure}
          </span>
        ) : null}
        {row.stop_number !== null ? (
          <Badge variant="outline" className="border-border">Stop {row.stop_number}</Badge>
        ) : null}
        {row.resolved_at ? (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
            Taught
          </Badge>
        ) : (
          <Button
            variant="ghost" size="sm" className="ml-auto gap-1 text-xs"
            disabled={busy} onClick={onResolve}
          >
            <Check className="h-3.5 w-3.5" />
            Mark taught
          </Button>
        )}
      </div>

      {row.headings.length ? (
        <div className="rounded bg-[#F9F9F9] p-2 text-xs text-[#555555]">
          <p className="mb-1 font-medium text-[#2C2C2C]">Heading-shaped lines in the document</p>
          <ul className="space-y-0.5 font-mono">
            {row.headings.map((h, i) => <li key={`${h}-${i}`}>{h}</li>)}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-[#8a8a8a]">
        {stamped.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        {row.parser_contract ? ` · parser contract ${row.parser_contract}` : ''}
        {row.document_label ? ` · ${row.document_label}` : ''}
        {row.occurrences > 1 ? ` · seen ${row.occurrences}× in this document` : ''}
        {row.load_id ? (
          <>
            {' · '}
            <Link
              to={`/dispatch/loads/${row.load_id}`}
              className="inline-flex items-center gap-1 text-[#555555] underline"
            >
              {row.load_number ?? 'load'}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
