import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Users, AlertTriangle, CheckCircle2, Clock, Filter } from 'lucide-react';

interface OperatorRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  assigned_staff_name: string | null;
  current_stage: string;
  fully_onboarded: boolean;
  mvr_ch_approval: string;
  pe_screening_result: string;
  ica_status: string;
  insurance_added_date: string | null;
}

interface PipelineDashboardProps {
  onOpenOperator: (operatorId: string) => void;
}

function computeStage(os: Record<string, string | boolean | null>): string {
  if (os.insurance_added_date) return 'Stage 6 — Insurance';
  if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') return 'Stage 5 — Equipment';
  if (os.ica_status === 'complete') return 'Stage 4 — MO Registration';
  if (os.pe_screening_result === 'clear') return 'Stage 3 — ICA';
  if (os.mvr_ch_approval === 'approved') return 'Stage 2 — Documents';
  return 'Stage 1 — Background';
}

export default function PipelineDashboard({ onOpenOperator }: PipelineDashboardProps) {
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        assigned_onboarding_staff,
        onboarding_status (
          mvr_ch_approval,
          pe_screening_result,
          ica_status,
          decal_applied,
          eld_installed,
          fuel_card_issued,
          insurance_added_date,
          fully_onboarded
        ),
        profiles!operators_user_id_fkey (
          first_name,
          last_name,
          phone,
          home_state
        )
      `);

    if (data) {
      const rows: OperatorRow[] = data.map((op: any) => {
        const os = op.onboarding_status?.[0] ?? {};
        const profile = op.profiles ?? {};
        return {
          id: op.id,
          user_id: op.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          home_state: profile.home_state,
          assigned_staff_name: null,
          current_stage: computeStage(os),
          fully_onboarded: os.fully_onboarded ?? false,
          mvr_ch_approval: os.mvr_ch_approval ?? 'pending',
          pe_screening_result: os.pe_screening_result ?? 'pending',
          ica_status: os.ica_status ?? 'not_issued',
          insurance_added_date: os.insurance_added_date ?? null,
        };
      });
      setOperators(rows);
    }
    setLoading(false);
  };

  const filtered = operators.filter(op => {
    const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || (op.phone ?? '').includes(search);
    const matchStage = stageFilter === 'all' || op.current_stage === stageFilter;
    return matchSearch && matchStage;
  });

  const alertCount = operators.filter(op =>
    op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear'
  ).length;

  const stageCounts: Record<string, number> = {};
  operators.forEach(op => {
    stageCounts[op.current_stage] = (stageCounts[op.current_stage] ?? 0) + 1;
  });

  const stages = ['Stage 1 — Background', 'Stage 2 — Documents', 'Stage 3 — ICA', 'Stage 4 — MO Registration', 'Stage 5 — Equipment', 'Stage 6 — Insurance'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Onboarding Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all operators through the onboarding process</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{operators.length}</p>
              <p className="text-xs text-muted-foreground">Total in Pipeline</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-status-complete/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-status-complete" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{operators.filter(o => o.fully_onboarded).length}</p>
              <p className="text-xs text-muted-foreground">Fully Onboarded</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-status-progress/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-status-progress" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{operators.filter(o => !o.fully_onboarded).length}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{alertCount}</p>
              <p className="text-xs text-muted-foreground">Alerts / Denied</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stage breakdown */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-3">Pipeline by Stage</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {stages.map((stage, i) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
              className={`text-center p-3 rounded-lg border transition-colors ${
                stageFilter === stage
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-border hover:border-gold/40 text-foreground'
              }`}
            >
              <p className="text-xl font-bold">{stageCounts[stage] ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Stage {i + 1}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {stageFilter !== 'all' && (
          <Button variant="outline" size="sm" onClick={() => setStageFilter('all')}>
            Clear filter
          </Button>
        )}
      </div>

      {/* Operator table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">State</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Current Stage</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Status</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    {operators.length === 0 ? 'No operators in the pipeline yet.' : 'No operators match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map(op => (
                  <tr key={op.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {op.first_name || op.last_name ? `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() : '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{op.phone ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{op.home_state ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs border-gold/40 text-gold bg-gold/5">
                        {op.current_stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {op.fully_onboarded ? (
                        <Badge className="status-complete border text-xs">Onboarded</Badge>
                      ) : op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear' ? (
                        <Badge className="status-action border text-xs">Alert</Badge>
                      ) : (
                        <Badge className="status-progress border text-xs">In Progress</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenOperator(op.id)}
                        className="text-gold hover:text-gold-light hover:bg-gold/10 text-xs"
                      >
                        Open →
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
