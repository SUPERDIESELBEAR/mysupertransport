import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, RefreshCcw, Search, X } from 'lucide-react';

interface ErrorEntry {
  id: string;
  action: string;
  entity_id: string | null;
  entity_label: string | null;
  actor_name: string | null;
  created_at: string;
  metadata: {
    stage?: string;
    email?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    user_agent?: string | null;
  } | null;
}

const STAGE_OPTIONS = [
  { value: 'all', label: 'All stages' },
  { value: 'encrypt_ssn', label: 'SSN encryption' },
  { value: 'insert_application', label: 'Insert (new)' },
  { value: 'update_application', label: 'Update (existing)' },
  { value: 'unknown', label: 'Unknown' },
];

function deviceFromUA(ua: string | null | undefined): string {
  if (!ua) return '—';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

export default function ApplicationErrorsPanel() {
  const [entries, setEntries] = useState<ErrorEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string>('all');
  const [uaQuery, setUaQuery] = useState('');

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('audit_log')
      .select('id, action, entity_id, entity_label, actor_name, created_at, metadata')
      .eq('entity_type', 'application')
      .eq('action', 'application_submit_failed')
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) {
      setError(err.message);
      setEntries([]);
    } else {
      setEntries((data ?? []) as unknown as ErrorEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const s = e.metadata?.stage ?? 'unknown';
      if (stage !== 'all' && s !== stage) return false;
      if (uaQuery.trim()) {
        const ua = (e.metadata?.user_agent ?? '').toLowerCase();
        if (!ua.includes(uaQuery.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [entries, stage, uaQuery]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      const s = e.metadata?.stage ?? 'unknown';
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Application Errors
          </h1>
          <p className="text-sm text-muted-foreground">
            Recent submit and SSN encryption failures captured from public application form.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STAGE_OPTIONS.map((opt) => {
          const count = opt.value === 'all'
            ? entries.length
            : (stageCounts[opt.value] ?? 0);
          const isActive = stage === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setStage(opt.value)}
              className={`text-left rounded-lg border px-3 py-2 transition ${
                isActive
                  ? 'border-gold bg-gold/10'
                  : 'border-border bg-card hover:border-gold/40'
              }`}
            >
              <div className="text-xs text-muted-foreground">{opt.label}</div>
              <div className="text-xl font-bold text-foreground">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:w-56">
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={uaQuery}
            onChange={(e) => setUaQuery(e.target.value)}
            placeholder="Filter by user agent (e.g. iPhone, Android, Chrome)"
            className="pl-9 pr-9"
          />
          {uaQuery && (
            <button
              type="button"
              onClick={() => setUaQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {error && (
          <div className="p-4 text-sm text-destructive border-b border-border">
            {error}
          </div>
        )}
        {loading && entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No errors match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Stage</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Device</th>
                  <th className="text-left px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const m = e.metadata ?? {};
                  return (
                    <tr key={e.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {format(new Date(e.created_at), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-md bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
                          {m.stage ?? 'unknown'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-foreground">{m.email ?? e.entity_label ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{deviceFromUA(m.user_agent)}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[28ch]" title={m.user_agent ?? ''}>
                          {m.user_agent ?? ''}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs text-foreground">{m.error_code ?? '—'}</div>
                        {m.error_message && (
                          <div className="text-xs text-muted-foreground mt-0.5 break-words max-w-[60ch]">
                            {m.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}