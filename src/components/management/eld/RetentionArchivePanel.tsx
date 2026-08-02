/**
 * §6 — Retention archive.
 *
 * Search across every retained ELD artifact and export a combined PDF. The
 * search, the demo predicate and the audit write all live server-side; this
 * panel only collects the criteria and shows what came back, so there is no
 * client path that produces an unaudited copy of a federal record.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Archive, Download, FileText, Loader2, Search } from 'lucide-react';
import { fetchProfileNames, formatProfileName } from '@/lib/profileNames';

type ArtifactRow = {
  artifact_type: string;
  artifact_id: string;
  operator_id: string | null;
  log_date: string | null;
  occurred_at: string | null;
  status: string | null;
  label: string | null;
  truck_number: string | null;
  supersedes_day_id: string | null;
  event_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  is_demo: boolean;
};

type OperatorOption = { id: string; name: string; unit: string | null };

const TYPE_LABEL: Record<string, string> = {
  rods_day: 'Duty-status log',
  malfunction_event: 'Malfunction event',
  malfunction_notice: 'Malfunction notice',
  extension_request: 'FMCSA extension request',
  officer_packet: 'Officer packet',
  share_token_access: 'Share-token access',
  unlock_event: 'Authorized unlock',
  amendment: 'Amendment',
  correction_request: 'Correction request',
};

const STATUS_OPTIONS = ['certified', 'draft', 'superseded', 'open', 'granted', 'denied'];

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { timeZone: 'America/Chicago' });
}

export default function RetentionArchivePanel() {
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [operatorId, setOperatorId] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [truck, setTruck] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState<string>('any');
  const [includeDemo, setIncludeDemo] = useState(false);

  const [rows, setRows] = useState<ArtifactRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('operators').select('id, user_id, unit_number');
      const list = data ?? [];
      const names = await fetchProfileNames(list.map((o) => o.user_id).filter(Boolean) as string[]);
      setOperators(
        list
          .map((o) => ({
            id: o.id,
            unit: o.unit_number,
            name: formatProfileName(names[o.user_id ?? '']) || `Unit ${o.unit_number ?? '—'}`,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
  }, []);

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc('search_retention_archive', {
        _operator_ids: operatorId === 'all' ? null : [operatorId],
        _from: from || null,
        _to: to || null,
        _truck: truck.trim() || null,
        _event_id: eventId.trim() || null,
        _status: status === 'any' ? null : status,
        _include_demo: includeDemo,
      });
      if (error) throw error;
      setRows((data ?? []) as ArtifactRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [operatorId, from, to, truck, eventId, status, includeDemo]);

  const runExport = useCallback(async (kind: 'archive' | 'timeline', forEventId?: string) => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-retention-archive', {
        body: {
          kind,
          operatorIds: operatorId === 'all' ? [] : [operatorId],
          from: from || null,
          to: to || null,
          truck: truck.trim() || null,
          eventId: kind === 'timeline' ? forEventId : (eventId.trim() || null),
          status: status === 'any' ? null : status,
          includeDemo,
        },
      });
      if (error) {
        // The envelope carries the real cause; a bare non-2xx says nothing.
        let detail = error.message;
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          if (ctx) detail = JSON.parse(await ctx.text()).error ?? detail;
        } catch { /* keep the generic message */ }
        throw new Error(detail);
      }
      const parts = (data?.parts ?? []) as Array<{ part: number; url: string | null }>;
      if (parts.length === 0) throw new Error('The export produced no documents.');
      parts.forEach((p) => { if (p.url) window.open(p.url, '_blank', 'noopener'); });
      toast.success(
        parts.length === 1
          ? 'Export ready. The audit record was written before the file was built.'
          : `Export ready in ${parts.length} parts, split on driver and date boundaries — nothing was downsampled.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [operatorId, from, to, truck, eventId, status, includeDemo]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.artifact_type, (byType.get(r.artifact_type) ?? 0) + 1);
    return [...byType.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const timelineEvents = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.event_id).filter(Boolean) as string[])],
    [rows],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-gold" />
            Retention Archive
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Every retained duty-status version, malfunction notice, extension filing, officer packet and access
            record. Retained under 49 CFR 395.8(k)(1) until an explicit, audited purge — there is no six-month
            auto-delete.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Driver</Label>
              <Select value={operatorId} onValueChange={setOperatorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All drivers</SelectItem>
                  {operators.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}{o.unit ? ` — Unit ${o.unit}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Truck number</Label>
              <Input value={truck} onChange={(e) => setTruck(e.target.value)} placeholder="Any" />
            </div>
            <div className="space-y-1">
              <Label>Malfunction event ID</Label>
              <Input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Any" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any status</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={includeDemo} onCheckedChange={(v) => setIncludeDemo(v === true)} />
            Include demo records (recorded on the audit entry for any export)
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Search
            </Button>
            <Button
              variant="outline"
              onClick={() => runExport('archive')}
              disabled={exporting || !rows || rows.length === 0}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export combined PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {rows.length} record{rows.length === 1 ? '' : 's'}
            </CardTitle>
            <div className="flex flex-wrap gap-2 pt-1">
              {(summary ?? []).map(([type, n]) => (
                <Badge key={type} variant="secondary" className="whitespace-nowrap">
                  {TYPE_LABEL[type] ?? type}: {n}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {timelineEvents.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2">
                {timelineEvents.map((id) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="outline"
                    disabled={exporting}
                    onClick={() => runExport('timeline', id)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Compliance timeline — {id.slice(0, 8)}
                  </Button>
                ))}
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
              {rows.map((r) => (
                <div
                  key={`${r.artifact_type}-${r.artifact_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {TYPE_LABEL[r.artifact_type] ?? r.artifact_type}
                      {r.log_date ? ` — ${r.log_date}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.label ?? '—'} · {fmt(r.occurred_at)}
                      {r.truck_number ? ` · Truck ${r.truck_number}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.supersedes_day_id && (
                      <Badge variant="outline" className="whitespace-nowrap">amended version</Badge>
                    )}
                    {r.is_demo && <Badge variant="destructive" className="whitespace-nowrap">demo</Badge>}
                    {r.status && <Badge variant="secondary" className="whitespace-nowrap">{r.status}</Badge>}
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground">Nothing matched that search.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
