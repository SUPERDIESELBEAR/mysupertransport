import { useMemo, useState, useEffect } from 'react';
import { ShieldAlert, ChevronRight, Search, List, LayoutGrid, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ComplianceDriverRow {
  operatorId: string;
  name: string;
  cdl: { expiryDate: string; daysUntil: number } | null;
  med: { expiryDate: string; daysUntil: number } | null;
  worstDays: number;
}

interface Props {
  rows: ComplianceDriverRow[];
  onOpenOperator: (operatorId: string) => void;
  onViewAll: () => void;
}

type ViewMode = 'list' | 'cards';
const STORAGE_KEY = 'mgmt_compliance_summary_view';

function statusTier(days: number): 'expired' | 'critical' | 'warning' {
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  return 'warning';
}

function tierClasses(tier: 'expired' | 'critical' | 'warning') {
  if (tier === 'expired' || tier === 'critical') {
    return 'text-destructive bg-destructive/10 border-destructive/30';
  }
  return 'text-gold bg-gold/10 border-gold/30';
}

function tierStripe(tier: 'expired' | 'critical' | 'warning') {
  if (tier === 'expired' || tier === 'critical') return 'bg-destructive';
  return 'bg-gold';
}

function daysLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d left`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString();
}

function CertPill({ label, days }: { label: string; days: number }) {
  const tier = statusTier(days);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tierClasses(tier)}`}>
      <span className="opacity-80">{label}</span>
      <span>·</span>
      <span>{daysLabel(days)}</span>
    </span>
  );
}

export default function ComplianceSummaryCard({ rows, onOpenOperator, onViewAll }: Props) {
  const [view, setView] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {}
  }, []);

  const setViewPersisted = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch {}
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  // When not searching, list view caps to 5 to preserve previous behavior.
  const visible = useMemo(() => {
    if (query.trim()) return filtered;
    if (view === 'list') return filtered.slice(0, 5);
    return filtered;
  }, [filtered, query, view]);

  if (rows.length === 0) return null;

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Compliance Summary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Drivers with nearest CDL or Med Cert expiries</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drivers"
              className="h-8 pl-7 pr-7 text-xs w-[170px] sm:w-[200px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border bg-secondary/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewPersisted('list')}
              className={`h-7 px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                view === 'list' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={view === 'list'}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setViewPersisted('cards')}
              className={`h-7 px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                view === 'cards' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={view === 'cards'}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs gap-1 text-muted-foreground h-7 px-2 shrink-0">
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Empty filter state */}
      {visible.length === 0 && (
        <div className="px-4 sm:px-5 py-8 text-center text-sm text-muted-foreground">
          No drivers match "{query}".
        </div>
      )}

      {/* List view */}
      {view === 'list' && visible.length > 0 && (
        <div className="divide-y divide-border">
          {visible.map((row) => {
            const tier = statusTier(row.worstDays);
            return (
              <div
                key={row.operatorId}
                className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-secondary/30 transition-colors gap-3"
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <span className={`shrink-0 w-1 self-stretch rounded-full ${tierStripe(tier)}`} />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{row.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {row.cdl && <CertPill label="CDL" days={row.cdl.daysUntil} />}
                      {row.med && <CertPill label="Med Cert" days={row.med.daysUntil} />}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onOpenOperator(row.operatorId)}
                  className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5 transition-colors"
                >
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Card view */}
      {view === 'cards' && visible.length > 0 && (
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((row) => {
            const tier = statusTier(row.worstDays);
            return (
              <div
                key={row.operatorId}
                className="relative border border-border rounded-lg bg-card overflow-hidden hover:shadow-sm transition-shadow flex flex-col"
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${tierStripe(tier)}`} />
                <div className="px-4 py-3 pl-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground text-sm truncate">{row.name}</p>
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tierClasses(tier)}`}>
                      {tier === 'expired' ? 'Expired' : tier === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {row.cdl && (
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-muted-foreground">CDL · {formatDate(row.cdl.expiryDate)}</span>
                        <CertPill label="CDL" days={row.cdl.daysUntil} />
                      </div>
                    )}
                    {row.med && (
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-muted-foreground">Med Cert · {formatDate(row.med.expiryDate)}</span>
                        <CertPill label="Med Cert" days={row.med.daysUntil} />
                      </div>
                    )}
                    {!row.cdl && !row.med && (
                      <p className="text-xs text-muted-foreground">No expiring certs</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onOpenOperator(row.operatorId)}
                  className="mt-auto border-t border-border px-4 py-2 text-xs text-primary hover:bg-secondary/40 font-medium flex items-center justify-end gap-0.5 transition-colors"
                >
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}