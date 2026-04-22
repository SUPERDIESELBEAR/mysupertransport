import React, { useState, useEffect, useRef, useCallback } from 'react';
import { reminderErrorToast } from '@/lib/reminderError';
import { formatPhoneDisplay } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBulkReminderCooldown } from '@/hooks/useBulkReminderCooldown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Users, AlertTriangle, CheckCircle2, Clock, Filter, X, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Truck, MessageSquare, ShieldAlert, ChevronDown, ChevronUp, ShieldCheck, Send, CheckCheck, RotateCcw, FileClock, Check, PauseCircle, ArchiveX } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, parseISO, format, formatDistanceToNowStrict } from 'date-fns';
import InspectionComplianceSummary from '@/components/inspection/InspectionComplianceSummary';
import { ScrollJumpButton } from '@/components/ui/ScrollJumpButton';

// ─── StageTrack ──────────────────────────────────────────────────────────────
// Parallel 6-node progress track — driven by pipeline_config DB records.

type NodeState = 'complete' | 'partial' | 'none' | 'na';

interface StageNode {
  key: string;
  label: string;
  fullName: string;
  state: NodeState;
  items: { label: string; done: boolean }[];
}

// Shared type for pipeline config items (mirrors PipelineConfigEditor)
interface PipelineStageItem {
  key: string;
  label: string;
  field: string;
  complete_value: string;
  note?: string;
}

interface PipelineStageConfig {
  id: string;
  stage_key: string;
  stage_order: number;
  label: string;
  full_name: string;
  description: string | null;
  items: PipelineStageItem[];
  is_active: boolean;
}

/**
 * Evaluate a single item against the operator row.
 * complete_value "present" means "any non-null / non-empty value".
 */
function evalItem(op: OperatorRow, field: string, completeValue: string): boolean {
  const raw = (op as unknown as Record<string, unknown>)[field];
  if (completeValue === 'present') return raw != null && raw !== '';
  if (completeValue.includes('|')) {
    return completeValue.split('|').some(v => raw === v);
  }
  return raw === completeValue;
}

function computeStageNodesFromConfig(
  op: OperatorRow,
  configs: PipelineStageConfig[],
): StageNode[] {
  return configs
    .filter(c => c.is_active)
    .sort((a, b) => a.stage_order - b.stage_order)
    .map(cfg => {
      const itemResults = cfg.items.map(item => ({
        label: item.label,
        done: evalItem(op, item.field, item.complete_value),
      }));
      const allDone = itemResults.length > 0 && itemResults.every(i => i.done);
      const anyDone = itemResults.some(i => i.done);
      // Special case: MO stage is N/A when the owner-operator has their own registration.
      const isMoOwnReg = cfg.stage_key === 'mo' && op.registration_status === 'own_registration';
      const state: NodeState = isMoOwnReg
        ? 'na'
        : allDone
        ? 'complete'
        : anyDone
        ? 'partial'
        : 'none';
      return {
        key: cfg.stage_key,
        label: cfg.label,
        fullName: cfg.full_name,
        state,
        items: itemResults,
      };
    });
}

/**
 * Compute progress % from DB-driven stage configs.
 * A stage counts as "done" only when ALL its items are complete.
 * Falls back to the stored progress_pct when configs haven't loaded yet.
 */
function computeProgressFromConfig(
  op: OperatorRow,
  configs: PipelineStageConfig[],
): number {
  if (!configs || configs.length === 0) return op.progress_pct;
  const activeConfigs = configs.filter(c => c.is_active);
  if (activeConfigs.length === 0) return op.progress_pct;
  const doneCount = activeConfigs.filter(cfg => {
    if (cfg.items.length === 0) return false;
    // MO stage is considered satisfied when operator owns their own registration.
    if (cfg.stage_key === 'mo' && op.registration_status === 'own_registration') return true;
    return cfg.items.every(item => evalItem(op, item.field, item.complete_value));
  }).length;
  return Math.round((doneCount / activeConfigs.length) * 100);
}

/**
 * Stage 5 (Equipment Setup) is "open" when any installation isn't finalized
 * OR a temporary exception is in effect (paper logbook / temp decal).
 * Used to keep fully-onboarded drivers visible at the top of the Pipeline
 * until the shop visit closes out their equipment work.
 */
function isStage5Open(op: {
  decal_applied: string;
  eld_installed: string;
  fuel_card_issued: string;
  paper_logbook_approved: boolean;
  temp_decal_approved: boolean;
}): boolean {
  const installComplete =
    op.decal_applied === 'yes' &&
    op.eld_installed === 'yes' &&
    op.fuel_card_issued === 'yes';
  const hasException = op.paper_logbook_approved || op.temp_decal_approved;
  return !installComplete || hasException;
}

// Stage key → OperatorDetailPanel stageRefs key mapping
const STAGE_KEY_TO_DETAIL: Record<string, string> = {
  bg:        'stage1',
  docs:      'stage2',
  ica:       'stage3',
  mo:        'stage4',
  equip:     'stage5',
  ins:       'stage6',
  dispatch:  'stage7',
  pay_setup: 'stage8',
};

function StageTrack({
  op,
  stageConfigs,
  onNodeClick,
}: {
  op: OperatorRow;
  stageConfigs: PipelineStageConfig[];
  onNodeClick?: (operatorId: string, stageKey: string) => void;
}) {
  const nodes = computeStageNodesFromConfig(op, stageConfigs);
  const pct = computeProgressFromConfig(op, stageConfigs);
  // Exception state: equip node is amber 'E' when paper logbook or temp decal is approved but not fully installed
  const equipFull = op.decal_applied === 'yes' && op.eld_installed === 'yes' && op.fuel_card_issued === 'yes';
  const equipException = !equipFull && (op.paper_logbook_approved || op.temp_decal_approved);
  return (
    <div className="flex items-center gap-0 min-w-[200px]">
      {nodes.map((node, i) => {
        const isEquipException = node.key === 'equip' && equipException;
        return (
        <div key={node.key} className="flex items-center">
          {/* Connector line before (skip first) */}
          {i > 0 && (
            <div
              className="h-px w-3 shrink-0 transition-colors duration-300"
              style={{
                background: nodes[i - 1].state === 'complete'
                  ? 'hsl(var(--status-complete))'
                  : 'hsl(var(--border))',
              }}
            />
          )}
          {/* Node */}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-stage-node={node.key}
                  className="flex flex-col items-center gap-0.5 cursor-pointer group/node bg-transparent border-0 p-0 outline-none focus-visible:outline-none"
                  onClick={e => {
                    e.stopPropagation();
                    const detailKey = STAGE_KEY_TO_DETAIL[node.key] ?? node.key;
                    onNodeClick?.(op.id, detailKey);
                  }}
                >
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 group-hover/node:scale-110 group-hover/node:ring-2 group-hover/node:ring-offset-1 pointer-events-none"
                    style={
                      isEquipException
                        ? { background: 'hsl(var(--warning) / 0.15)', border: '2px solid hsl(var(--warning))' }
                        : node.state === 'complete'
                        ? { background: 'hsl(var(--status-complete))', border: '1.5px solid hsl(var(--status-complete))' }
                        : node.state === 'partial'
                        ? { background: 'transparent', border: '2px solid hsl(var(--status-in-progress))' }
                        : { background: 'hsl(var(--muted))', border: '1.5px solid hsl(var(--border))' }
                    }
                  >
                    {isEquipException && (
                      <span className="text-[9px] font-black leading-none pointer-events-none" style={{ color: 'hsl(var(--warning))' }}>E</span>
                    )}
                    {!isEquipException && node.state === 'complete' && (
                      <Check className="h-2.5 w-2.5 text-white pointer-events-none" strokeWidth={3} />
                    )}
                    {!isEquipException && node.state === 'partial' && (
                      <div
                        className="h-2 w-2 rounded-full pointer-events-none"
                        style={{ background: 'hsl(var(--status-in-progress))' }}
                      />
                    )}
                  </div>
                  <span
                    className="text-[9px] font-semibold leading-none tracking-wide pointer-events-none"
                    style={{
                      color: isEquipException
                        ? 'hsl(var(--warning))'
                        : node.state === 'complete'
                        ? 'hsl(var(--status-complete))'
                        : node.state === 'partial'
                        ? 'hsl(var(--status-in-progress))'
                        : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {node.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-left min-w-[180px] max-w-[240px] p-2.5 space-y-2">
                <p className="font-semibold text-xs">{node.fullName}</p>
                {isEquipException && (
                  <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: 'hsl(var(--warning) / 0.12)', border: '1px solid hsl(var(--warning) / 0.4)' }}>
                    <span className="text-[9px] font-black" style={{ color: 'hsl(var(--warning))' }}>E</span>
                    <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--warning))' }}>Exception active — en route to shop</span>
                  </div>
                )}
                {node.items.filter(i => !i.done).length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive/80">Still needed</p>
                    <ul className="space-y-1">
                      {node.items.filter(i => !i.done).map(item => (
                        <li key={item.label} className="flex items-start gap-1.5 text-xs">
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                          <span className="text-foreground">{isEquipException ? `${item.label} (pending shop visit)` : item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'hsl(var(--status-complete))' }}>All items complete ✓</p>
                )}
                {node.items.filter(i => i.done).length > 0 && node.items.filter(i => !i.done).length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border">
                    <ul className="space-y-1">
                      {node.items.filter(i => i.done).map(item => (
                        <li key={item.label} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'hsl(var(--status-complete))' }} />
                          <span>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground italic pt-0.5">Click to open this section</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

        </div>
        );
      })}
      {/* Overall % — always in sync with node states */}
      <span
        className="ml-2 text-[11px] font-bold tabular-nums shrink-0"
        style={{
          color: pct === 100
            ? 'hsl(var(--status-complete))'
            : 'hsl(var(--muted-foreground))',
        }}
      >
        {pct}%
      </span>
      {/* Temperature badge */}
      <TemperatureBadge op={op} configs={stageConfigs} />
    </div>
  );
}

type DispatchStatus = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

const DISPATCH_BADGE: Record<DispatchStatus, { label: string; className: string; dot: string }> = {
  not_dispatched: { label: 'Not Dispatched', className: 'bg-muted text-muted-foreground border-border',          dot: 'bg-muted-foreground' },
  dispatched:     { label: 'Dispatched',     className: 'bg-status-complete/10 text-status-complete border-status-complete/30', dot: 'bg-status-complete' },
  home:           { label: 'Home',           className: 'bg-status-progress/10 text-status-progress border-status-progress/30', dot: 'bg-status-progress' },
  truck_down:     { label: 'Truck Down',     className: 'bg-destructive/10 text-destructive border-destructive/30',             dot: 'bg-destructive' },
};

interface OperatorRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  home_state: string | null;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  never_logged_in: boolean;
  invited_at: string | null;
  current_stage: string;
  fully_onboarded: boolean;
  mvr_status: string;
  ch_status: string;
  mvr_ch_approval: string;
  pe_screening_result: string;
  ica_status: string;
  ica_draft_since: string | null; // created_at of the in-progress draft ICA contract
  insurance_added_date: string | null;
  dispatch_status: DispatchStatus | null;
  doc_count: number;
  unread_count: number;
  // Progress fields
  form_2290: string;
  truck_title: string;
  truck_photos: string;
  truck_inspection: string;
  mo_docs_submitted: string;
  mo_reg_received: string;
  decal_applied: string;
  eld_installed: string;
  fuel_card_issued: string;
  paper_logbook_approved: boolean;
  temp_decal_approved: boolean;
  pay_setup_submitted: string;
  registration_status: string | null;
  progress_pct: number;
  onboarding_updated_at: string | null;
  // On Hold fields
  on_hold: boolean;
  on_hold_reason: string | null;
  on_hold_date: string | null;
}

// ─── Temperature ─────────────────────────────────────────────────────────────
type TemperatureLevel = 'cold' | 'cool' | 'warm' | 'hot';

const TEMPERATURE_META: Record<TemperatureLevel, { label: string; dot: string; text: string; bg: string; border: string; tooltip: string }> = {
  cold: {
    label: 'Cold',
    dot: 'bg-slate-400',
    text: 'text-slate-500',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    tooltip: 'Stages 1 & 2 not yet fully complete',
  },
  cool: {
    label: 'Cool',
    dot: 'bg-blue-400',
    text: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    tooltip: 'Stages 1 & 2 fully complete',
  },
  warm: {
    label: 'Warm',
    dot: 'bg-amber-400',
    text: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    tooltip: 'Stages 1, 2 & 3 fully complete',
  },
  hot: {
    label: 'Hot',
    dot: 'bg-red-400',
    text: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    tooltip: 'Stages 1–3 complete + MO docs submitted or O/O has own registration',
  },
};

function computeTemperature(op: OperatorRow, configs: PipelineStageConfig[]): TemperatureLevel {
  const activeConfigs = configs.filter(c => c.is_active).sort((a, b) => a.stage_order - b.stage_order);

  const isStageComplete = (stageKey: string) => {
    const cfg = activeConfigs.find(c => c.stage_key === stageKey);
    if (!cfg || cfg.items.length === 0) return false;
    return cfg.items.every(item => evalItem(op, item.field, item.complete_value));
  };

  const stage1Done = isStageComplete('bg');
  const stage2Done = isStageComplete('docs');
  const stage3Done = isStageComplete('ica');
  const moSubmitted = op.mo_docs_submitted === 'submitted';
  const ownReg = op.registration_status === 'own_registration';

  if (stage1Done && stage2Done && stage3Done && (moSubmitted || ownReg)) return 'hot';
  if (stage1Done && stage2Done && stage3Done) return 'warm';
  if (stage1Done && stage2Done) return 'cool';
  return 'cold';
}

function TemperatureBadge({ op, configs }: { op: OperatorRow; configs: PipelineStageConfig[] }) {
  const level = computeTemperature(op, configs);
  const meta = TEMPERATURE_META[level];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide cursor-default shrink-0 ${meta.bg} ${meta.border} ${meta.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
            {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          {meta.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface StaffOption {
  user_id: string;
  full_name: string;
}

interface ComplianceAlert {
  operator_id: string;
  operator_name: string;
  doc_type: 'CDL' | 'Medical Cert';
  expiration_date: string;
  days_until: number; // negative = already expired
}

interface PipelineDashboardProps {
  onOpenOperator: (operatorId: string) => void;
  onOpenOperatorWithFocus?: (operatorId: string, focusField: 'cdl' | 'medcert') => void;
  onOpenOperatorAtBinder?: (operatorId: string) => void;
  /** Opens the operator detail panel scrolled to a specific stage section */
  onOpenOperatorAtStage?: (operatorId: string, stageKey: string) => void;
  onOpenInspectionBinder?: () => void;
  initialDispatchFilter?: DispatchStatus | 'all';
  initialCoordinatorFilter?: string;
  initialCoordinatorName?: string;
  initialStageFilter?: string;
  initialIdleFilter?: boolean;
  complianceRefreshKey?: number;
  onBulkMessage?: (operatorIds: string[]) => void;
}


function computeStage(os: Record<string, string | boolean | null>): string {
  if (os.insurance_added_date) return 'Stage 6 — Insurance';
  if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') return 'Stage 5 — Equipment';
  if (os.ica_status === 'complete') return 'Stage 4 — MO Registration';
  if (os.ica_status === 'in_progress' || os.ica_status === 'sent_for_signature') return 'Stage 3 — ICA';
  if (os.mvr_ch_approval === 'approved') return 'Stage 2 — Documents';
  return 'Stage 1 — Background';
}

const STAGES = [
  'Stage 1 — Background',
  'Stage 2 — Documents',
  'Stage 3 — ICA',
  'Stage 4 — MO Registration',
  'Stage 5 — Equipment',
  'Stage 6 — Insurance',
  'Stage 8 — Pay Setup',
];

const STAGE_ABBR: Record<string, string> = {
  'Stage 1 — Background':     'BG',
  'Stage 2 — Documents':      'Docs',
  'Stage 3 — ICA':            'ICA',
  'Stage 4 — MO Registration':'MO',
  'Stage 5 — Equipment':      'Equip',
  'Stage 6 — Insurance':      'Ins',
  'Stage 8 — Pay Setup':      'Pay',
};

// Owner test accounts — excluded from main pipeline, shown in their own section
const OWNER_USER_IDS = new Set([
  '5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe',
  '7e356f94-ce4a-47aa-8883-0e6b01d09aab',
]);

// ─── MultiBlockedCallout ─────────────────────────────────────────────────────

function MultiBlockedCallout({
  operators,
  stageConfigs,
  stageNodeFilters,
  setStageNodeFilters,
  onOpenOperator,
}: {
  operators: OperatorRow[];
  stageConfigs: PipelineStageConfig[];
  stageNodeFilters: Set<string>;
  setStageNodeFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenOperator: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const activeStages = stageConfigs.filter(c => c.is_active && c.items.length > 0);
  if (activeStages.length < 2) return null;

  const blockedOps = operators
    .filter(op => {
      const incompleteStages = activeStages.filter(cfg =>
        !cfg.items.every(item => evalItem(op, item.field, item.complete_value))
      );
      return incompleteStages.length >= 2;
    })
    .map(op => ({
      op,
      incompleteStages: activeStages
        .filter(cfg => !cfg.items.every(item => evalItem(op, item.field, item.complete_value)))
        .sort((a, b) => a.stage_order - b.stage_order),
    }))
    // Sort by most blocked first
    .sort((a, b) => b.incompleteStages.length - a.incompleteStages.length);

  if (blockedOps.length === 0) return null;

  const isFiltering = stageNodeFilters.size > 0;

  return (
    <div className={`rounded-lg border border-warning/30 bg-warning/10 text-warning-foreground text-xs overflow-hidden transition-all`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          <span className="font-semibold">{blockedOps.length} operator{blockedOps.length !== 1 ? 's' : ''}</span>
          {' '}blocked at <span className="font-semibold">2+ stages simultaneously</span>
          {' '}— highest priority for follow-up
        </span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {!isFiltering && (
            <button
              onClick={() => {
                const stageCounts = activeStages.map(cfg => ({
                  key: cfg.stage_key,
                  count: operators.filter(op =>
                    !cfg.items.every(item => evalItem(op, item.field, item.complete_value))
                  ).length,
                })).sort((a, b) => b.count - a.count);
                const top2 = stageCounts.slice(0, 2).map(s => s.key);
                setStageNodeFilters(new Set(top2));
              }}
              className="font-medium text-warning hover:opacity-80 underline underline-offset-2 transition-opacity"
            >
              Show top 2 stages
            </button>
          )}
          <button
            onClick={() => setExpanded(p => !p)}
            className="flex items-center gap-1 font-medium text-warning hover:opacity-80 transition-opacity"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : 'View all'}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Expanded per-operator breakdown */}
      {expanded && (
        <div className="border-t border-warning/20 divide-y divide-warning/10">
          {blockedOps.map(({ op, incompleteStages }) => {
            const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() || 'Unknown';
            return (
              <div key={op.id} className="flex items-center gap-3 px-3 py-2">
                <button
                  onClick={() => onOpenOperator(op.id)}
                  className="font-semibold text-warning hover:opacity-70 transition-opacity underline underline-offset-2 shrink-0 text-left"
                >
                  {name}
                </button>
                <div className="flex flex-wrap gap-1">
                  {incompleteStages.map(cfg => {
                    const pendingItems = cfg.items.filter(item => !evalItem(op, item.field, item.complete_value));
                    return (
                      <Tooltip key={cfg.stage_key}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-warning/20 text-warning-foreground leading-none cursor-default">
                            {cfg.label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] p-2.5">
                          <p className="font-semibold text-xs mb-1.5">{cfg.full_name} — incomplete</p>
                          <ul className="space-y-1">
                            {pendingItems.map(item => (
                              <li key={item.key} className="flex items-start gap-1.5 text-xs">
                                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                                <span>{item.label}</span>
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <span className="ml-auto shrink-0 tabular-nums text-warning/70">
                  {incompleteStages.length} stage{incompleteStages.length !== 1 ? 's' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PipelineDashboard({ onOpenOperator, onOpenOperatorWithFocus, onOpenOperatorAtBinder, onOpenOperatorAtStage, onOpenInspectionBinder, initialDispatchFilter, initialCoordinatorFilter, initialCoordinatorName, initialStageFilter, initialIdleFilter, complianceRefreshKey, onBulkMessage }: PipelineDashboardProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [complianceSort, setComplianceSort] = useState<'urgency' | 'last_action_asc' | 'last_action_desc'>('urgency');
  const [complianceExpanded, setComplianceExpanded] = useState(false);
  const [complianceNoActionOnly, setComplianceNoActionOnly] = useState(false);
  const [complianceDocFilter, setComplianceDocFilter] = useState<'all' | 'CDL' | 'Medical Cert'>('all');
  // Bulk messaging selection
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<Set<string>>(new Set());
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageConfigs, setStageConfigs] = useState<PipelineStageConfig[]>([]);
  // Track which operator rows are currently saving a coordinator assignment
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);
  // Track reminder send state per alert key (operatorId|docType)
  const [reminderSending, setReminderSending] = useState<Record<string, boolean>>({});
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  // Last reminded timestamps: key = "operatorId|docType" → ISO string
  const [lastReminded, setLastReminded] = useState<Record<string, string>>({});
  // Last reminded coordinator names: key = "operatorId|docType" → staff name
  const [lastRemindedBy, setLastRemindedBy] = useState<Record<string, string>>({});
  // Last reminded email outcome: key = "operatorId|docType" → { sent: bool, error?: string }
  const [lastReminderOutcome, setLastReminderOutcome] = useState<Record<string, { sent: boolean; error?: string }>>({});
  // Last renewed timestamps: key = "operatorId|docType" → ISO string
  const [lastRenewed, setLastRenewed] = useState<Record<string, string>>({});
  // Last renewed coordinator names: key = "operatorId|docType" → staff name
  const [lastRenewedBy, setLastRenewedBy] = useState<Record<string, string>>({});
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkSentCount, setBulkSentCount] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkRenewing, setBulkRenewing] = useState(false);
  const [bulkRenewedCount, setBulkRenewedCount] = useState<number | null>(null);
  const [showBulkRenewConfirm, setShowBulkRenewConfirm] = useState(false);
  const [noActionBulkSending, setNoActionBulkSending] = useState(false);
  const [noActionBulkSentCount, setNoActionBulkSentCount] = useState<number | null>(null);
  const [showNoActionBulkConfirm, setShowNoActionBulkConfirm] = useState(false);
  const { isCoolingDown: bulkCooldown, minutesLeft: bulkCooldownMinutes, lastSentLabel: bulkLastSentLabel, startCooldown: startBulkCooldown } = useBulkReminderCooldown('bulk-reminder-pipeline-compliance');
  const { isCoolingDown: noActionCooldown, minutesLeft: noActionCooldownMinutes, lastSentLabel: noActionLastSentLabel, startCooldown: startNoActionCooldown } = useBulkReminderCooldown('bulk-reminder-pipeline-noaction');
  // Resend invite state: key = operator id
  const [resendingSending, setResendingSending] = useState<Record<string, boolean>>({});
  const [resendSent, setResendSent] = useState<Record<string, boolean>>({});
  // Per-row renew state: key = "operatorId|docType"
  const [rowRenewing, setRowRenewing] = useState<Record<string, boolean>>({});
  const [rowRenewed, setRowRenewed] = useState<Record<string, boolean>>({});


  // Filter state
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(initialStageFilter ?? 'all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState(initialCoordinatorFilter ?? 'all');
  const [dispatchFilter, setDispatchFilter] = useState<'all' | DispatchStatus>(initialDispatchFilter ?? 'all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [idleFilter, setIdleFilter] = useState(initialIdleFilter ?? false);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [unreadHighPriority, setUnreadHighPriority] = useState(false);
  const [invitePendingFilter, setInvitePendingFilter] = useState(false);
  const [exceptionFilter, setExceptionFilter] = useState(false);
  // Stage node filter: filter to operators who have specific stage(s) NOT complete (multi-select)
  const [stageNodeFilters, setStageNodeFilters] = useState<Set<string>>(new Set());
   // On Hold section collapsed state
  const [onHoldExpanded, setOnHoldExpanded] = useState(true);
  const [ownerTestExpanded, setOwnerTestExpanded] = useState(false);
  // "Active — Open Onboarding Items" section collapsed state
  const [activeOpenExpanded, setActiveOpenExpanded] = useState(true);
  // Archive from On Hold
  const [archiveTarget, setArchiveTarget] = useState<OperatorRow | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);

  const toggleStageNodeFilter = (key: string) => {
    setStageNodeFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  // Sync when the parent changes the initial filter (e.g. banner → View Pipeline)
  useEffect(() => {
    if (initialDispatchFilter) setDispatchFilter(initialDispatchFilter);
  }, [initialDispatchFilter]);

  useEffect(() => {
    if (initialCoordinatorFilter) setCoordinatorFilter(initialCoordinatorFilter);
  }, [initialCoordinatorFilter]);

  const [legendStageFilter, setLegendStageFilter] = useState<string | null>(initialStageFilter && initialStageFilter !== 'all' ? initialStageFilter : null);
  const [legendCoordinatorFilter, setLegendCoordinatorFilter] = useState<{ id: string; name: string } | null>(
    initialCoordinatorFilter && initialCoordinatorFilter !== 'all' && initialCoordinatorName
      ? { id: initialCoordinatorFilter, name: initialCoordinatorName }
      : null
  );

  useEffect(() => {
    const next = initialStageFilter ?? 'all';
    setStageFilter(next);
    setLegendStageFilter(next !== 'all' ? next : null);
  }, [initialStageFilter]);

  useEffect(() => {
    setIdleFilter(initialIdleFilter ?? false);
  }, [initialIdleFilter]);

  useEffect(() => {
    const next = initialCoordinatorFilter ?? 'all';
    setCoordinatorFilter(next);
    setLegendCoordinatorFilter(
      next !== 'all' && initialCoordinatorName
        ? { id: next, name: initialCoordinatorName }
        : null
    );
  }, [initialCoordinatorFilter, initialCoordinatorName]);

  // Sort state
  type SortKey = 'name' | 'stage' | 'coordinator' | 'progress' | 'last_activity' | 'docs' | 'compliance' | 'msgs' | 'temperature';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey | null>('temperature');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Track whether the current sort was auto-applied by the idle filter
  const idleAutoSorted = useRef(false);

  // Auto-sort by last activity (oldest first) when idle filter activates
  useEffect(() => {
    if (idleFilter) {
      setSortKey('last_activity');
      setSortDir('asc');
      idleAutoSorted.current = true;
    } else if (idleAutoSorted.current) {
      setSortKey(null);
      setSortDir('asc');
      idleAutoSorted.current = false;
    }
  }, [idleFilter]);

  const handleSort = (key: SortKey) => {
    idleAutoSorted.current = false; // manual sort overrides auto
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Progress sort defaults to descending (highest completion first)
      setSortDir(key === 'progress' ? 'desc' : 'asc');
    }
  };

  const fetchComplianceAlerts = useCallback(async () => {
    const today = new Date();

    const [{ data: ops }, { data: reminders }, { data: renewals }] = await Promise.all([
      supabase
        .from('operators')
        .select(`
          id,
          application_id,
          applications (
            first_name,
            last_name,
            cdl_expiration,
            medical_cert_expiration
          )
        `)
        .not('application_id', 'is', null),
      supabase
        .from('cert_reminders')
        .select('operator_id, doc_type, sent_at, sent_by_name, email_sent, email_error')
        .order('sent_at', { ascending: false }),
      supabase
        .from('audit_log' as any)
        .select('entity_id, actor_name, created_at, metadata')
        .eq('action', 'cert_renewed')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (!ops) return;

    // Keep only the most recent reminder per operator+doc_type pair
    const remindedMap: Record<string, string> = {};
    const remindedByMap: Record<string, string> = {};
    const reminderOutcomeMap: Record<string, { sent: boolean; error?: string }> = {};
    (reminders ?? []).forEach((r: any) => {
      const key = `${r.operator_id}|${r.doc_type}`;
      if (!remindedMap[key]) {
        remindedMap[key] = r.sent_at; // first = most recent due to DESC order
        if (r.sent_by_name) remindedByMap[key] = r.sent_by_name;
        reminderOutcomeMap[key] = { sent: r.email_sent ?? true, error: r.email_error ?? undefined };
      }
    });
    setLastReminded(remindedMap);
    setLastRemindedBy(remindedByMap);
    setLastReminderOutcome(reminderOutcomeMap);

    // Keep only the most recent renewal per operator+doc_type pair
    const renewedMap: Record<string, string> = {};
    const renewedByMap: Record<string, string> = {};
    (renewals ?? []).forEach((r: any) => {
      const docType = r.metadata?.document_type as string | undefined;
      if (!r.entity_id || !docType) return;
      // Map "CDL" → "CDL", "Medical Cert" → "Medical Cert" (matches alert.doc_type)
      const key = `${r.entity_id}|${docType}`;
      if (!renewedMap[key]) {
        renewedMap[key] = r.created_at;
        if (r.actor_name) renewedByMap[key] = r.actor_name;
      }
    });
    setLastRenewed(renewedMap);
    setLastRenewedBy(renewedByMap);

    const alerts: ComplianceAlert[] = [];

    (ops as any[]).forEach((op: any) => {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      if (!app) return;
      const name = `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Unknown Operator';

      (['cdl_expiration', 'medical_cert_expiration'] as const).forEach(field => {
        const dateStr: string | null = app[field];
        if (!dateStr) return;
        const expDate = parseISO(dateStr);
        const days = differenceInDays(expDate, today);
        if (days <= 90) {
          alerts.push({
            operator_id: op.id,
            operator_name: name,
            doc_type: field === 'cdl_expiration' ? 'CDL' : 'Medical Cert',
            expiration_date: dateStr,
            days_until: days,
          });
        }
      });
    });

    // Sort: urgency tier first (expired → critical ≤30d → warning 31-90d),
    // then never-renewed floats to top within each tier, then by days_until ascending
    const urgencyTier = (days: number) => days < 0 ? 0 : days <= 30 ? 1 : 2;
    alerts.sort((a, b) => {
      const tierDiff = urgencyTier(a.days_until) - urgencyTier(b.days_until);
      if (tierDiff !== 0) return tierDiff;
      const aRenewed = !!renewedMap[`${a.operator_id}|${a.doc_type}`];
      const bRenewed = !!renewedMap[`${b.operator_id}|${b.doc_type}`];
      if (aRenewed !== bRenewed) return aRenewed ? 1 : -1;
      return a.days_until - b.days_until;
    });
    setComplianceAlerts(alerts);
    setComplianceNoActionOnly(false);
    setComplianceSort('urgency');
    setNoActionBulkSentCount(null);
  }, []);

  const fetchStageConfigs = useCallback(async () => {
    const { data } = await supabase
      .from('pipeline_config')
      .select('*')
      .order('stage_order', { ascending: true });
    if (data) {
      setStageConfigs(
        data.map(row => ({
          ...row,
          items: (row.items as unknown as PipelineStageItem[]) ?? [],
          description: row.description ?? null,
        }))
      );
    }
  }, []);

  useEffect(() => {
    fetchOperators();
    fetchComplianceAlerts();
    fetchStageConfigs();
  }, [fetchComplianceAlerts, fetchStageConfigs]);

  // Realtime: re-fetch pipeline_config whenever a stage is saved in the editor
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-config-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_config' },
        () => { fetchStageConfigs(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStageConfigs]);

  // Re-fetch compliance alerts when parent signals an expiry date was updated
  useEffect(() => {
    if (complianceRefreshKey === undefined || complianceRefreshKey === 0) return;
    fetchComplianceAlerts();
  }, [complianceRefreshKey, fetchComplianceAlerts]);

  // Realtime: re-fetch compliance alerts whenever an application's expiry dates change
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-applications-expiry-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'applications' },
        (payload: any) => {
          const { new: n, old: o } = payload;
          if (
            n?.cdl_expiration !== o?.cdl_expiration ||
            n?.medical_cert_expiration !== o?.medical_cert_expiration
          ) {
            fetchComplianceAlerts();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchComplianceAlerts]);

  // Realtime: refresh unread counts when a new message arrives
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-messages-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        refreshUnreadCounts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        refreshUnreadCounts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime: update dispatch statuses live when a dispatcher changes a status
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-dispatch-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_dispatch' },
        (payload: any) => {
          const { new: newRow, old: oldRow, eventType } = payload;
          if (eventType === 'DELETE') {
            const operatorId = oldRow?.operator_id;
            if (operatorId) {
              setOperators(prev =>
                prev.map(op => op.id === operatorId ? { ...op, dispatch_status: null } : op)
              );
            }
          } else {
            const operatorId = newRow?.operator_id;
            const status = newRow?.dispatch_status as DispatchStatus | null;
            if (operatorId) {
              setOperators(prev =>
                prev.map(op => op.id === operatorId ? { ...op, dispatch_status: status } : op)
              );
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const refreshUnreadCounts = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', user.id)
      .is('read_at', null);
    if (!data) return;
    const map: Record<string, number> = {};
    (data as any[]).forEach((m: any) => {
      map[m.sender_id] = (map[m.sender_id] ?? 0) + 1;
    });
    setOperators(prev => prev.map(op => ({ ...op, unread_count: map[op.user_id] ?? 0 })));
  };

  // Build a lookup: operator_id → worst ComplianceAlert for that operator
  const complianceByOperator: Record<string, ComplianceAlert> = {};
  complianceAlerts.forEach(alert => {
    const existing = complianceByOperator[alert.operator_id];
    if (!existing || alert.days_until < existing.days_until) {
      complianceByOperator[alert.operator_id] = alert;
    }
  });

  const fetchOperators = async () => {
    setLoading(true);

    const [{ data: opData }, { data: staffRoles }] = await Promise.all([
      supabase.from('operators').select(`
        id,
        user_id,
        created_at,
        assigned_onboarding_staff,
        on_hold,
        on_hold_reason,
        on_hold_date,
        applications ( email, phone, address_state ),
        onboarding_status (
          mvr_status,
          ch_status,
          mvr_ch_approval,
          pe_screening_result,
          ica_status,
          decal_applied,
          eld_installed,
          fuel_card_issued,
          paper_logbook_approved,
          temp_decal_approved,
          insurance_added_date,
          fully_onboarded,
          form_2290,
          truck_title,
          truck_photos,
          truck_inspection,
          mo_docs_submitted,
          mo_reg_received,
          registration_status,
          updated_at
        ),
        contractor_pay_setup ( submitted_at, terms_accepted )
      `).eq('is_active', true),
      supabase.from('user_roles').select('user_id').in('role', ['onboarding_staff', 'management']),
    ]);

    if (!opData) { setLoading(false); return; }

    const allStaffUserIds = (staffRoles ?? []).map((r: any) => r.user_id);

    // Fetch dispatch statuses for all operators in parallel with profiles
    const operatorIds = opData.map((o: any) => o.id).filter(Boolean);
    const operatorUserIds = opData.map((o: any) => o.user_id).filter(Boolean);
    const assignedStaffIds = opData.map((o: any) => o.assigned_onboarding_staff).filter(Boolean);
    const allUserIds = [...new Set([...operatorUserIds, ...assignedStaffIds, ...allStaffUserIds])];

    const [profileResult, dispatchResult, docResult, unreadResult, icaDraftResult] = await Promise.all([
      allUserIds.length > 0
        ? supabase.from('profiles').select('user_id, first_name, last_name, phone, home_state, account_status').in('user_id', allUserIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length > 0
        ? supabase.from('active_dispatch').select('operator_id, dispatch_status').in('operator_id', operatorIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length > 0
        ? supabase.from('operator_documents').select('operator_id').in('operator_id', operatorIds)
        : Promise.resolve({ data: [] }),
      // Fetch all unread messages sent to the current staff user from operator user IDs
      user?.id && operatorUserIds.length > 0
        ? supabase
            .from('messages')
            .select('sender_id')
            .eq('recipient_id', user.id)
            .in('sender_id', operatorUserIds)
            .is('read_at', null)
        : Promise.resolve({ data: [] }),
      // Fetch ICA draft contracts (status = 'draft') to compute "days in draft"
      operatorIds.length > 0
        ? supabase
            .from('ica_contracts')
            .select('operator_id, created_at')
            .eq('status', 'draft')
            .in('operator_id', operatorIds)
            .order('created_at', { ascending: true }) // oldest draft first per operator
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, any> = {};
    ((profileResult.data as any[]) ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });

    const dispatchMap: Record<string, DispatchStatus> = {};
    ((dispatchResult.data as any[]) ?? []).forEach((d: any) => { dispatchMap[d.operator_id] = d.dispatch_status; });

    const docCountMap: Record<string, number> = {};
    ((docResult.data as any[]) ?? []).forEach((d: any) => {
      docCountMap[d.operator_id] = (docCountMap[d.operator_id] ?? 0) + 1;
    });

    // Build unread count map keyed by operator user_id
    const unreadMap: Record<string, number> = {};
    ((unreadResult.data as any[]) ?? []).forEach((m: any) => {
      unreadMap[m.sender_id] = (unreadMap[m.sender_id] ?? 0) + 1;
    });

    // Build ICA draft creation date map: operator_id → earliest draft created_at
    const icaDraftMap: Record<string, string> = {};
    ((icaDraftResult.data as any[]) ?? []).forEach((d: any) => {
      if (!icaDraftMap[d.operator_id]) {
        icaDraftMap[d.operator_id] = d.created_at;
      }
    });

    // Build staff options
    const staffMap: Record<string, StaffOption> = {};
    allStaffUserIds.forEach((uid: string) => {
      const p = profileMap[uid];
      if (p) {
        staffMap[uid] = {
          user_id: uid,
          full_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || uid,
        };
      }
    });
    setStaffOptions(Object.values(staffMap));

    const rows: OperatorRow[] = opData.map((op: any) => {
      const osRaw = op.onboarding_status;
      const os = Array.isArray(osRaw) ? (osRaw[0] ?? {}) : (osRaw ?? {});
      const profile = profileMap[op.user_id] ?? {};
      const staffProfile = op.assigned_onboarding_staff ? profileMap[op.assigned_onboarding_staff] : null;
      const staffName = staffProfile
        ? `${staffProfile.first_name ?? ''} ${staffProfile.last_name ?? ''}`.trim() || null
        : null;
      const appRaw = op.applications;
      const appRecord = Array.isArray(appRaw) ? (appRaw[0] ?? null) : (appRaw ?? null);
      const appEmail = appRecord?.email ?? null;
      const appPhone = appRecord?.phone ?? null;
      const appState = appRecord?.address_state ?? null;
      const icaStatus = os.ica_status ?? 'not_issued';
      // Derive pay_setup_submitted: "true" when submitted_at is set and terms_accepted = true
      const payRaw = op.contractor_pay_setup;
      const pay = Array.isArray(payRaw) ? (payRaw[0] ?? null) : (payRaw ?? null);
      const paySetupSubmitted = pay?.submitted_at && pay?.terms_accepted ? 'true' : '';
      return {
        id: op.id,
        user_id: op.user_id,
        first_name: appRecord?.first_name || profile.first_name || null,
        last_name: appRecord?.last_name || profile.last_name || null,
        email: appEmail,
        phone: profile.phone || appPhone || null,
        home_state: profile.home_state || appState || null,
        assigned_staff_id: op.assigned_onboarding_staff ?? null,
        assigned_staff_name: staffName,
        never_logged_in: (profile.account_status ?? 'pending') === 'pending',
        invited_at: op.created_at ?? null,
        current_stage: computeStage(os),
        fully_onboarded: os.fully_onboarded ?? false,
        mvr_status: os.mvr_status ?? 'not_started',
        ch_status: os.ch_status ?? 'not_started',
        mvr_ch_approval: os.mvr_ch_approval ?? 'pending',
        pe_screening_result: os.pe_screening_result ?? 'pending',
        ica_status: icaStatus,
        ica_draft_since: icaStatus === 'in_progress' ? (icaDraftMap[op.id] ?? null) : null,
        insurance_added_date: os.insurance_added_date ?? null,
        dispatch_status: dispatchMap[op.id] ?? null,
        doc_count: docCountMap[op.id] ?? 0,
        unread_count: unreadMap[op.user_id] ?? 0,
        form_2290: os.form_2290 ?? 'not_started',
        truck_title: os.truck_title ?? 'not_started',
        truck_photos: os.truck_photos ?? 'not_started',
        truck_inspection: os.truck_inspection ?? 'not_started',
        mo_docs_submitted: os.mo_docs_submitted ?? 'not_submitted',
        mo_reg_received: os.mo_reg_received ?? 'not_yet',
        decal_applied: os.decal_applied ?? 'no',
        eld_installed: os.eld_installed ?? 'no',
        fuel_card_issued: os.fuel_card_issued ?? 'no',
        paper_logbook_approved: os.paper_logbook_approved ?? false,
        temp_decal_approved: os.temp_decal_approved ?? false,
        pay_setup_submitted: paySetupSubmitted,
        registration_status: os.registration_status ?? null,
        progress_pct: 0, // placeholder; real % computed in StageTrack from pipeline_config
        onboarding_updated_at: os.updated_at ?? null,
        on_hold: op.on_hold ?? false,
        on_hold_reason: op.on_hold_reason ?? null,
        on_hold_date: op.on_hold_date ?? null,
      };
    });
    // Keep operators in the Pipeline view if either:
    //  • they're not yet fully onboarded, OR
    //  • they're fully onboarded BUT Stage 5 (Equipment Setup) is still open
    //    (decal/eld/fuel-card not all "yes" OR an exception flag is active)
    setOperators(rows.filter(r => !r.fully_onboarded || isStage5Open(r)));
    setLoading(false);
  };


  const getStatus = (op: OperatorRow) => {
    if (op.fully_onboarded) return 'onboarded';
    if (op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear') return 'alert';
    return 'in_progress';
  };

  const handleArchiveFromHold = async () => {
    if (!archiveTarget || !user) return;
    setArchiving(true);
    try {
      const opName = `${archiveTarget.first_name ?? ''} ${archiveTarget.last_name ?? ''}`.trim() || 'Unknown Operator';

      // 1. Clear hold & deactivate operator
      const { error: opErr } = await supabase
        .from('operators')
        .update({ on_hold: false, on_hold_reason: null, on_hold_date: null, is_active: false })
        .eq('id', archiveTarget.id);
      if (opErr) throw opErr;

      // 2. Deny linked application
      const { data: opRow } = await supabase
        .from('operators')
        .select('application_id')
        .eq('id', archiveTarget.id)
        .single();
      if (opRow?.application_id) {
        const { error: appErr } = await supabase
          .from('applications')
          .update({ review_status: 'denied' as any })
          .eq('id', opRow.application_id);
        if (appErr) throw appErr;
      }

      // 3. Audit log
      const staffName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Staff';
      await supabase.from('audit_log').insert({
        action: 'applicant_archived',
        entity_type: 'operator',
        entity_id: archiveTarget.id,
        entity_label: opName,
        actor_id: user.id,
        actor_name: staffName,
        metadata: {
          reason: archiveReason || null,
          original_hold_reason: archiveTarget.on_hold_reason,
          original_hold_date: archiveTarget.on_hold_date,
        },
      });

      // 4. Remove from local state
      setOperators(prev => prev.filter(op => op.id !== archiveTarget.id));
      toast({ title: `${opName} archived`, description: 'Moved to the Archived Drivers list.' });
      setArchiveTarget(null);
      setArchiveReason('');
    } catch (err: any) {
      toast({ title: 'Archive failed', description: err.message, variant: 'destructive' });
    } finally {
      setArchiving(false);
    }
  };

  const handleResendInvite = async (op: OperatorRow) => {
    if (!op.email) {
      toast({ title: 'No email found for this operator', variant: 'destructive' });
      return;
    }
    setResendingSending(prev => ({ ...prev, [op.id]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await supabase.functions.invoke('resend-invite', {
        body: { email: op.email, staff_override: true },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.error || (res.data as any)?.error) {
        const msg = (res.data as any)?.error ?? res.error?.message ?? 'Failed to resend invite';
        toast({ title: 'Resend failed', description: msg, variant: 'destructive' });
      } else {
        setResendSent(prev => ({ ...prev, [op.id]: true }));
        toast({
          title: 'Invite resent',
          description: `A new invitation was sent to ${op.email}`,
        });
        setTimeout(() => setResendSent(prev => ({ ...prev, [op.id]: false })), 8000);
      }
    } finally {
      setResendingSending(prev => ({ ...prev, [op.id]: false }));
    }
  };

  const handleAssignCoordinator = async (operatorId: string, staffUserId: string | null) => {
    setAssigningMap(prev => ({ ...prev, [operatorId]: true }));

    const { error } = await supabase
      .from('operators')
      .update({ assigned_onboarding_staff: staffUserId })
      .eq('id', operatorId);

    if (error) {
      toast({ title: 'Failed to assign coordinator', description: error.message, variant: 'destructive' });
    } else {
      // Optimistic local update
      const staffOption = staffOptions.find(s => s.user_id === staffUserId) ?? null;
      setOperators(prev => prev.map(op =>
        op.id === operatorId
          ? { ...op, assigned_staff_id: staffUserId, assigned_staff_name: staffOption?.full_name ?? null }
          : op
      ));
      toast({
        title: staffUserId ? 'Coordinator assigned' : 'Coordinator removed',
        description: staffUserId
          ? `Assigned to ${staffOption?.full_name ?? 'coordinator'}`
          : 'Operator is now unassigned',
      });
    }

    setAssigningMap(prev => ({ ...prev, [operatorId]: false }));
  };

  const handleSendReminder = async (alert: ComplianceAlert) => {
    const key = `${alert.operator_id}|${alert.doc_type}`;
    setReminderSending(prev => ({ ...prev, [key]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          operator_id: alert.operator_id,
          doc_type: alert.doc_type,
          days_until: alert.days_until,
          expiration_date: alert.expiration_date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminder');
      // Always update the timestamp — record was saved regardless of email outcome
      const now = new Date().toISOString();
      const senderName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
      setLastReminded(prev => ({ ...prev, [key]: now }));
      if (senderName) setLastRemindedBy(prev => ({ ...prev, [key]: senderName }));
      if (data.email_error) {
        // Email failed — record was still saved; show error state in tooltip
        setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
        setReminderSent(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
        const { title, description } = reminderErrorToast(new Error(data.email_error));
        toast({ title, description, variant: 'destructive' });
      } else {
        setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
        setReminderSent(prev => ({ ...prev, [key]: true }));
        toast({ title: 'Reminder sent', description: `Email sent to ${alert.operator_name}` });
        // Reset "sent" button badge after 8 seconds
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      }
    } catch (err: any) {
      const { title, description } = reminderErrorToast(err);
      toast({ title, description, variant: 'destructive' });
    } finally {
      setReminderSending(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSendAllCritical = async (targets?: ComplianceAlert[]) => {
    const criticalAlerts = targets ?? complianceAlerts.filter(a => a.days_until <= 30);
    if (criticalAlerts.length === 0) return;
    setBulkSending(true);
    setBulkSentCount(null);

    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    let successCount = 0;
    let failCount = 0;

    for (const alert of criticalAlerts) {
      const key = `${alert.operator_id}|${alert.doc_type}`;
      if (reminderSending[key] || reminderSent[key]) { successCount++; continue; }
      setReminderSending(prev => ({ ...prev, [key]: true }));
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            operator_id: alert.operator_id,
            doc_type: alert.doc_type,
            days_until: alert.days_until,
            expiration_date: alert.expiration_date,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        const now = new Date().toISOString();
        setLastReminded(prev => ({ ...prev, [key]: now }));
        if (data.email_error) {
          setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
          failCount++;
        } else {
          setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
          successCount++;
        }
        setReminderSent(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
      } catch {
        failCount++;
      } finally {
        setReminderSending(prev => ({ ...prev, [key]: false }));
      }
      // Rate-limit: 600ms between requests
      await new Promise(r => setTimeout(r, 600));
    }

    setBulkSending(false);
    setBulkSentCount(successCount);
    if (failCount === 0) {
      toast({
        title: `${successCount} reminder${successCount !== 1 ? 's' : ''} sent`,
        description: `All targeted operators have been notified.`,
      });
    } else {
      toast({
        title: `${successCount} sent, ${failCount} failed`,
        description: 'Some reminders could not be sent — check that the mysupertransport.com domain is verified at resend.com/domains.',
        variant: 'destructive',
      });
    }
    // Reset bulk sent indicator after 10 seconds, start 60-min cooldown
    setTimeout(() => setBulkSentCount(null), 10000);
    startBulkCooldown();
  };

  // Bulk Send All — No Action rows only (no prior reminder AND no renewal)
  const handleSendAllNoAction = async () => {
    const noActionAlerts = complianceAlerts.filter(a => {
      const key = `${a.operator_id}|${a.doc_type}`;
      return !lastReminded[key] && !lastRenewed[key];
    });
    if (noActionAlerts.length === 0) return;
    setNoActionBulkSending(true);
    setNoActionBulkSentCount(null);

    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const senderName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;

    let successCount = 0;
    let failCount = 0;

    await Promise.all(
      noActionAlerts.map(async (alert) => {
        const key = `${alert.operator_id}|${alert.doc_type}`;
        if (reminderSending[key] || reminderSent[key]) { successCount++; return; }
        setReminderSending(prev => ({ ...prev, [key]: true }));
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-cert-reminder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token ?? ''}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              operator_id: alert.operator_id,
              doc_type: alert.doc_type,
              days_until: alert.days_until,
              expiration_date: alert.expiration_date,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Failed');
          const now = new Date().toISOString();
          setLastReminded(prev => ({ ...prev, [key]: now }));
          if (senderName) setLastRemindedBy(prev => ({ ...prev, [key]: senderName }));
          if (data.email_error) {
            setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: false, error: data.email_error } }));
            failCount++;
          } else {
            setLastReminderOutcome(prev => ({ ...prev, [key]: { sent: true } }));
            successCount++;
          }
          setReminderSent(prev => ({ ...prev, [key]: true }));
          setTimeout(() => setReminderSent(prev => ({ ...prev, [key]: false })), 8000);
        } catch {
          failCount++;
        } finally {
          setReminderSending(prev => ({ ...prev, [key]: false }));
        }
      })
    );

    setNoActionBulkSending(false);
    setNoActionBulkSentCount(successCount);
    if (failCount === 0) {
      toast({
        title: `${successCount} reminder${successCount !== 1 ? 's' : ''} sent`,
        description: 'All uncontacted operators have been notified.',
      });
    } else {
      toast({
        title: `${successCount} sent, ${failCount} failed`,
        description: 'Some reminders could not be sent — check that the mysupertransport.com domain is verified at resend.com/domains.',
        variant: 'destructive',
      });
    }
    setTimeout(() => setNoActionBulkSentCount(null), 10000);
    startNoActionCooldown();
  };

  // Bulk Mark as Renewed — extends all alerted docs by +1 year and writes audit log entries
  const handleBulkMarkRenewed = async () => {
    if (complianceAlerts.length === 0) return;
    setBulkRenewing(true);
    setBulkRenewedCount(null);

    const actorId = user?.id ?? null;
    const actorName = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null
      : null;

    const newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];

    let successCount = 0;
    let failCount = 0;

    const byOperator: Record<string, { operatorId: string; appId?: string; alerts: typeof complianceAlerts }> = {};
    complianceAlerts.forEach(alert => {
      if (!byOperator[alert.operator_id]) {
        byOperator[alert.operator_id] = { operatorId: alert.operator_id, alerts: [] };
      }
      byOperator[alert.operator_id].alerts.push(alert);
    });

    const operatorIds = Object.keys(byOperator);
    const { data: opRows } = await supabase
      .from('operators')
      .select('id, application_id')
      .in('id', operatorIds);
    (opRows ?? []).forEach((o: any) => {
      if (byOperator[o.id]) byOperator[o.id].appId = o.application_id;
    });

    await Promise.all(
      Object.values(byOperator).map(async ({ operatorId, appId, alerts }) => {
        if (!appId) { failCount += alerts.length; return; }
        for (const alert of alerts) {
          const col = alert.doc_type === 'CDL' ? 'cdl_expiration' : 'medical_cert_expiration';
          try {
            const { data: appData } = await supabase
              .from('applications')
              .select(col)
              .eq('id', appId)
              .single();
            const oldDateStr = (appData as any)?.[col] ?? null;
            const { error } = await supabase
              .from('applications')
              .update({ [col]: newDateStr })
              .eq('id', appId);
            if (error) throw error;
            await supabase.from('audit_log' as any).insert({
              actor_id: actorId,
              actor_name: actorName,
              action: 'cert_renewed',
              entity_type: 'operator',
              entity_id: operatorId,
              entity_label: alert.operator_name,
              metadata: {
                document_type: alert.doc_type,
                old_expiry: oldDateStr,
                new_expiry: newDateStr,
                operator_name: alert.operator_name,
                bulk: true,
              },
            });
            successCount++;
          } catch {
            failCount++;
          }
        }
      })
    );

    setBulkRenewing(false);
    setBulkRenewedCount(successCount);
    if (failCount === 0) {
      toast({
        title: `${successCount} document${successCount !== 1 ? 's' : ''} marked as renewed`,
        description: `Expiry dates extended to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.`,
      });
    } else {
      toast({
        title: `${successCount} renewed, ${failCount} failed`,
        description: 'Some documents could not be updated.',
        variant: 'destructive',
      });
    }
    setTimeout(() => setBulkRenewedCount(null), 10000);
  };

  // Per-row Mark as Renewed — extends a single document's expiry by +1 year
  const handleMarkRenewed = async (alert: ComplianceAlert) => {
    const key = `${alert.operator_id}|${alert.doc_type}`;
    setRowRenewing(prev => ({ ...prev, [key]: true }));

    const actorId = user?.id ?? null;
    const actorName = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null
      : null;

    const newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];
    const col = alert.doc_type === 'CDL' ? 'cdl_expiration' : 'medical_cert_expiration';

    try {
      const { data: opRow } = await supabase
        .from('operators')
        .select('application_id')
        .eq('id', alert.operator_id)
        .single();
      const appId = (opRow as any)?.application_id;
      if (!appId) throw new Error('No application found');

      const { data: appData } = await supabase
        .from('applications')
        .select(col)
        .eq('id', appId)
        .single();
      const oldDateStr = (appData as any)?.[col] ?? null;

      const { error } = await supabase
        .from('applications')
        .update({ [col]: newDateStr })
        .eq('id', appId);
      if (error) throw error;

      await supabase.from('audit_log' as any).insert({
        actor_id: actorId,
        actor_name: actorName,
        action: 'cert_renewed',
        entity_type: 'operator',
        entity_id: alert.operator_id,
        entity_label: alert.operator_name,
        metadata: {
          document_type: alert.doc_type,
          old_expiry: oldDateStr,
          new_expiry: newDateStr,
          operator_name: alert.operator_name,
        },
      });

      const renewedNow = new Date().toISOString();
      setRowRenewing(prev => ({ ...prev, [key]: false }));
      setRowRenewed(prev => ({ ...prev, [key]: true }));
      setLastRenewed(prev => ({ ...prev, [key]: renewedNow }));
      if (actorName) setLastRenewedBy(prev => ({ ...prev, [key]: actorName }));
      toast({
        title: `${alert.doc_type} marked as renewed`,
        description: `${alert.operator_name}'s expiry extended to ${new Date(newDateStr + 'T00:00:00').toLocaleDateString()}.`,
      });
      setTimeout(() => setRowRenewed(prev => { const n = { ...prev }; delete n[key]; return n; }), 8000);
    } catch {
      setRowRenewing(prev => ({ ...prev, [key]: false }));
      toast({ title: 'Failed to renew document', variant: 'destructive' });
    }
  };


  const filtered = operators
    .filter(op => {
      const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.toLowerCase();
      const matchSearch = name.includes(search.toLowerCase()) || (op.phone ?? '').includes(search);
      const matchStage = stageFilter === 'all' || op.current_stage === stageFilter;
      const matchStatus = statusFilter === 'all' || getStatus(op) === statusFilter;
      const matchCoordinator = coordinatorFilter === 'all' ||
        (coordinatorFilter === 'unassigned' ? !op.assigned_staff_id : op.assigned_staff_id === coordinatorFilter);
      const matchDispatch = dispatchFilter === 'all' || op.dispatch_status === dispatchFilter ||
        (dispatchFilter === 'not_dispatched' && op.dispatch_status === null);
      const matchProgress = progressFilter === 'all' ||
        (progressFilter === 'low' && op.progress_pct <= 33) ||
        (progressFilter === 'mid' && op.progress_pct >= 34 && op.progress_pct <= 66) ||
        (progressFilter === 'high' && op.progress_pct >= 67);
      const worstAlert = complianceByOperator[op.id];
      const matchCompliance = complianceFilter === 'all' ||
        (complianceFilter === 'critical' && worstAlert != null && worstAlert.days_until <= 30) ||
        (complianceFilter === 'warning' && worstAlert != null && worstAlert.days_until > 30 && worstAlert.days_until <= 90);
      const matchIdle = !idleFilter || (
        op.onboarding_updated_at != null &&
        differenceInDays(new Date(), parseISO(op.onboarding_updated_at)) >= 14
      );
      const matchUnread = !unreadFilter || (unreadHighPriority ? op.unread_count >= 3 : op.unread_count > 0);
      const matchInvitePending = !invitePendingFilter || op.never_logged_in;
      const matchException = !exceptionFilter || (op.paper_logbook_approved || op.temp_decal_approved);
      // Stage node filter (multi-select): show operators who are incomplete in ANY of the selected stages
      const matchStageNode = stageNodeFilters.size === 0 || (() => {
        // Operator must be incomplete in ALL selected stages (AND logic: show operators missing both BG AND ICA)
        return Array.from(stageNodeFilters).every(key => {
          const cfg = stageConfigs.find(c => c.stage_key === key);
          if (!cfg || cfg.items.length === 0) return true;
          return !cfg.items.every(item => evalItem(op, item.field, item.complete_value));
        });
      })();
      // Exclude operators surfaced in the "Active — Open Onboarding Items" top section
      // (they're fully onboarded but Stage 5 is still open — already shown above).
      const inActiveOpenSection = op.fully_onboarded && isStage5Open(op);
      return matchSearch && matchStage && matchStatus && matchCoordinator && matchDispatch && matchProgress && matchCompliance && matchIdle && matchUnread && matchInvitePending && matchException && matchStageNode && !op.on_hold && !inActiveOpenSection && !OWNER_USER_IDS.has(op.user_id);
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      if (sortKey === 'compliance') {
        // Sort by nearest expiry (days_until). No alert = Infinity (compliant, sorts last asc)
        const aAlert = complianceByOperator[a.id];
        const bAlert = complianceByOperator[b.id];
        const aDays = aAlert != null ? aAlert.days_until : Infinity;
        const bDays = bAlert != null ? bAlert.days_until : Infinity;
        const cmp = aDays - bDays;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortKey === 'msgs') {
        const cmp = a.unread_count - b.unread_count;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortKey === 'docs') {
        const cmp = a.doc_count - b.doc_count;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortKey === 'temperature') {
        const TEMP_ORDER: Record<TemperatureLevel, number> = { cold: 0, cool: 1, warm: 2, hot: 3 };
        const aTemp = computeTemperature(a, stageConfigs);
        const bTemp = computeTemperature(b, stageConfigs);
        const cmp = TEMP_ORDER[aTemp] - TEMP_ORDER[bTemp];
        if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
        // Tiebreak: higher progress first
        const pCmp = computeProgressFromConfig(b, stageConfigs) - computeProgressFromConfig(a, stageConfigs);
        return sortDir === 'asc' ? -pCmp : pCmp;
      }
      if (sortKey === 'progress') {
        const cmp = computeProgressFromConfig(a, stageConfigs) - computeProgressFromConfig(b, stageConfigs);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortKey === 'last_activity') {
        const at = a.onboarding_updated_at ?? '';
        const bt = b.onboarding_updated_at ?? '';
        const cmp = at < bt ? -1 : at > bt ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      let av = '';
      let bv = '';
      if (sortKey === 'name') {
        av = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
        bv = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
      } else if (sortKey === 'stage') {
        av = a.current_stage;
        bv = b.current_stage;
      } else if (sortKey === 'coordinator') {
        av = (a.assigned_staff_name ?? '').toLowerCase();
        bv = (b.assigned_staff_name ?? '').toLowerCase();
      }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const idleCount = operators.filter(op =>
    op.onboarding_updated_at != null &&
    differenceInDays(new Date(), parseISO(op.onboarding_updated_at)) >= 14
  ).length;

  const activeFilterCount = [
    stageFilter !== 'all',
    statusFilter !== 'all',
    coordinatorFilter !== 'all',
    dispatchFilter !== 'all',
    progressFilter !== 'all',
    complianceFilter !== 'all',
    stageNodeFilters.size > 0,
    idleFilter,
    unreadFilter,
    invitePendingFilter,
    exceptionFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStageFilter('all');
    setStatusFilter('all');
    setCoordinatorFilter('all');
    setDispatchFilter('all');
    setProgressFilter('all');
    setComplianceFilter('all');
    setStageNodeFilters(new Set());
    setIdleFilter(false);
    setUnreadFilter(false);
    setUnreadHighPriority(false);
    setInvitePendingFilter(false);
    setExceptionFilter(false);
    setSearch('');
  };

  const alertCount = operators.filter(op =>
    op.mvr_ch_approval === 'denied' || op.pe_screening_result === 'non_clear'
  ).length;

  const stageCounts: Record<string, number> = {};
  operators.forEach(op => {
    stageCounts[op.current_stage] = (stageCounts[op.current_stage] ?? 0) + 1;
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Onboarding Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all operators through the onboarding process</p>
      </div>

      {/* ─── Active — Open Onboarding Items (top section) ────────────────────
          Operators who graduated to the Driver Hub (insurance added) but still
          have Stage 5 work open (decal/ELD/fuel card not finalized OR running
          under a paper-logbook / temp-decal exception). Pinned to the top so
          coordinators can't forget the outstanding shop visit. */}
      {(() => {
        const activeOpenOps = operators.filter(
          op => op.fully_onboarded && isStage5Open(op) && !op.on_hold && !OWNER_USER_IDS.has(op.user_id),
        );
        if (activeOpenOps.length === 0) return null;
        return (
          <div className="rounded-xl border-2 shadow-sm overflow-hidden" style={{ borderColor: 'hsl(var(--warning) / 0.5)' }}>
            {/* Header */}
            <button
              onClick={() => setActiveOpenExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:opacity-90"
              style={{ background: 'hsl(var(--warning) / 0.10)' }}
            >
              <span
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-black shrink-0"
                style={{ background: 'hsl(var(--warning))', color: 'hsl(var(--warning-foreground))' }}
              >
                E
              </span>
              <span className="text-sm font-semibold text-foreground">Active — Open Onboarding Items</span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ml-0.5"
                style={{ background: 'hsl(var(--warning) / 0.15)', color: 'hsl(var(--warning))', borderColor: 'hsl(var(--warning) / 0.4)' }}
              >
                {activeOpenOps.length}
              </span>
              <span className="ml-2 text-xs text-muted-foreground font-normal hidden sm:inline">
                Dispatching now, but Stage 5 (Equipment Setup) is still open — finalize before clearing
              </span>
              <div className="ml-auto shrink-0">
                {activeOpenExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {activeOpenExpanded && (
              <div className="divide-y divide-border bg-background">
                {activeOpenOps.map(op => {
                  const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() || 'Unknown Operator';
                  const dispatchInfo = op.dispatch_status ? DISPATCH_BADGE[op.dispatch_status] : null;
                  const openItems: string[] = [];
                  if (op.decal_applied !== 'yes') openItems.push('Decal');
                  if (op.eld_installed !== 'yes') openItems.push('ELD');
                  if (op.fuel_card_issued !== 'yes') openItems.push('Fuel Card');
                  const exceptionParts: string[] = [];
                  if (op.paper_logbook_approved) exceptionParts.push('Paper Logbook');
                  if (op.temp_decal_approved) exceptionParts.push('Temp Decal');
                  return (
                    <div key={op.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <button
                        onClick={() => onOpenOperator(op.id)}
                        className="font-medium text-sm text-foreground hover:text-gold hover:underline underline-offset-2 transition-colors text-left shrink-0"
                      >
                        {name}
                      </button>

                      {dispatchInfo && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${dispatchInfo.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dispatchInfo.dot}`} />
                          {dispatchInfo.label}
                        </span>
                      )}

                      {openItems.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0"
                          style={{
                            background: 'hsl(var(--warning) / 0.12)',
                            color: 'hsl(var(--warning))',
                            borderColor: 'hsl(var(--warning) / 0.4)',
                          }}
                        >
                          Open: {openItems.join(', ')}
                        </span>
                      )}

                      {exceptionParts.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0"
                          style={{
                            background: 'hsl(var(--warning))',
                            color: 'hsl(var(--warning-foreground))',
                            borderColor: 'hsl(var(--warning))',
                          }}
                        >
                          <span className="text-[9px] font-black">E</span>
                          Exception: {exceptionParts.join(' + ')}
                        </span>
                      )}

                      <div className="ml-auto shrink-0 hidden lg:block">
                        <StageTrack op={op} stageConfigs={stageConfigs} onNodeClick={onOpenOperatorAtStage} />
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenOperatorAtStage ? onOpenOperatorAtStage(op.id, 'stage5') : onOpenOperator(op.id)}
                        className="text-gold hover:text-gold-light hover:bg-gold/10 text-xs shrink-0"
                      >
                        Finalize Stage 5 →
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}



      {/* Search + filter toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Invite Pending quick-filter chip */}
            {(() => {
              const pendingCount = operators.filter(o => o.never_logged_in).length;
              if (pendingCount === 0) return null;
              return (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setInvitePendingFilter(v => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                          invitePendingFilter
                            ? 'bg-warning text-warning-foreground border-warning'
                            : 'bg-background text-muted-foreground border-border hover:border-warning/60 hover:text-warning-foreground'
                        }`}
                        style={invitePendingFilter ? {} : { color: 'hsl(var(--warning))' }}
                      >
                        <Clock className="h-3.5 w-3.5" style={{ color: invitePendingFilter ? undefined : 'hsl(var(--warning))' }} />
                        <span className="hidden sm:inline">Invite Pending</span>
                        <span className={`text-[10px] font-bold ${invitePendingFilter ? 'text-warning-foreground' : ''}`} style={!invitePendingFilter ? { color: 'hsl(var(--warning))' } : {}}>
                          {pendingCount}
                        </span>
                        {invitePendingFilter && <X className="h-3 w-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
                      Show only operators who haven't logged in yet
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
            {/* Exception Active quick-filter chip */}
            {(() => {
              const exceptionCount = operators.filter(o => o.paper_logbook_approved || o.temp_decal_approved).length;
              if (exceptionCount === 0) return null;
              return (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setExceptionFilter(v => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                          exceptionFilter
                            ? 'border-warning text-warning-foreground'
                            : 'bg-background border-border hover:border-warning/60'
                        }`}
                        style={
                          exceptionFilter
                            ? { background: 'hsl(var(--warning))', color: 'hsl(var(--warning-foreground))' }
                            : { color: 'hsl(var(--warning))' }
                        }
                      >
                        <span className="text-[10px] font-black leading-none">E</span>
                        <span className="hidden sm:inline">Exception Active</span>
                        <span className="font-bold">{exceptionCount}</span>
                        {exceptionFilter && <X className="h-3 w-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[220px] text-center">
                      Show only operators running under an exception (paper logbook or temporary decals approved)
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
            <div className="inline-flex items-center rounded-full border transition-colors overflow-hidden">
              <button
                onClick={() => {
                  if (unreadFilter) {
                    setUnreadFilter(false);
                    setUnreadHighPriority(false);
                  } else {
                    setUnreadFilter(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  unreadFilter
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground hover:border-primary/50 hover:text-primary'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Has Unread</span>
                {unreadFilter && !unreadHighPriority && <X className="h-3 w-3" />}
              </button>
              {unreadFilter && (
                <button
                  onClick={() => setUnreadHighPriority(v => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border-l transition-colors ${
                    unreadHighPriority
                      ? 'bg-destructive text-destructive-foreground border-destructive/40'
                      : 'bg-primary/80 text-primary-foreground border-primary-foreground/20 hover:bg-destructive/80 hover:text-destructive-foreground'
                  }`}
                  title="Show only operators with 3+ unread messages"
                >
                  {unreadHighPriority ? '3+ ✕' : '3+'}
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSort('temperature')}
              className={`gap-1.5 shrink-0 ${sortKey === 'temperature' ? 'border-red-400 text-red-600 bg-red-50' : ''}`}
              title="Sort Cold → Hot (ascending) or Hot → Cold (descending)"
            >
              {sortKey === 'temperature' && sortDir === 'desc' ? (
                <>
                  <span className="text-xs">🔥</span>
                  <span className="hidden sm:inline text-xs font-semibold">Hot → Cold</span>
                  <ArrowDown className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  <span className="text-xs">🌡️</span>
                  <span className="hidden sm:inline text-xs font-semibold">
                    {sortKey === 'temperature' ? 'Cold → Hot' : 'Temp'}
                  </span>
                  {sortKey === 'temperature' && <ArrowUp className="h-3.5 w-3.5" />}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(v => !v)}
              className={`gap-2 ${showFilters || activeFilterCount > 0 ? 'border-gold text-gold bg-gold/5' : ''}`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="h-4 w-4 rounded-full bg-gold text-[10px] font-bold text-white flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {(activeFilterCount > 0 || search) && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground gap-1">
                <X className="h-3 w-3" />
                <span className="hidden sm:inline">Clear all</span>
              </Button>
            )}
            {/* Bulk Message button */}
            {onBulkMessage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedOperatorIds.size > 0) {
                    onBulkMessage(Array.from(selectedOperatorIds));
                  } else {
                    onBulkMessage([]);
                  }
                }}
                className={`gap-2 ${selectedOperatorIds.size > 0 ? 'border-primary text-primary bg-primary/5' : ''}`}
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Bulk Message</span>
                {selectedOperatorIds.size > 0 && (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                    {selectedOperatorIds.size}
                  </span>
                )}
              </Button>
            )}
          </div>

          <p className="text-xs sm:text-sm text-muted-foreground w-full sm:w-auto sm:ml-auto">
            {filtered.length} of {operators.length} operators
          </p>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
            {/* Stage filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {STAGES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

      {/* Exception Active filter banner — shown when the quick-filter chip is active */}
      {exceptionFilter && (() => {
        const exCount = filtered.filter(o => o.paper_logbook_approved || o.temp_decal_approved).length;
        return (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-warning/8 border-warning/25">
            <span className="text-sm font-black leading-none shrink-0" style={{ color: 'hsl(var(--warning))' }}>E</span>
            <p className="text-sm font-medium flex-1" style={{ color: 'hsl(var(--warning))' }}>
              <span className="font-semibold">{exCount} operator{exCount !== 1 ? 's' : ''}</span>
              {' '}running under an approved exception — en route to the SUPERTRANSPORT shop for installation
            </p>
            <button
              onClick={() => setExceptionFilter(false)}
              className="flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: 'hsl(var(--warning))' }}
              title="Clear exception filter"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        );
      })()}


            {/* Stage Incomplete filter — the chips above the table are the primary multi-select UI; this is a single-select fallback in the panel */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage Incomplete</label>
              <div className="flex flex-wrap gap-1.5">
                {stageConfigs
                  .filter(c => c.is_active)
                  .sort((a, b) => a.stage_order - b.stage_order)
                  .map(cfg => {
                    const incompleteCount = operators.filter(op =>
                      cfg.items.length > 0 &&
                      !cfg.items.every(item => evalItem(op, item.field, item.complete_value))
                    ).length;
                    if (incompleteCount === 0) return null;
                    const isActive = stageNodeFilters.has(cfg.stage_key);
                    return (
                      <button
                        key={cfg.stage_key}
                        type="button"
                        onClick={() => toggleStageNodeFilter(cfg.stage_key)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium transition-all active:scale-95 ${
                          isActive
                            ? 'bg-gold text-white border-gold'
                            : 'bg-background text-muted-foreground border-border hover:border-gold/50 hover:text-gold'
                        }`}
                      >
                        {cfg.label}
                        <span className={`text-[10px] font-bold leading-none ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}>
                          {incompleteCount}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="onboarded">Fully Onboarded</SelectItem>
                  <SelectItem value="alert">Alert / Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dispatch filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Status</label>
              <Select value={dispatchFilter} onValueChange={v => setDispatchFilter(v as 'all' | DispatchStatus)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All dispatch statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dispatch statuses</SelectItem>
                  <SelectItem value="dispatched">🟢 Dispatched</SelectItem>
                  <SelectItem value="home">🟠 Home</SelectItem>
                  <SelectItem value="truck_down">🔴 Truck Down</SelectItem>
                  <SelectItem value="not_dispatched">⚫ Not Dispatched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Coordinator filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned Coordinator</label>
              <Select value={coordinatorFilter} onValueChange={setCoordinatorFilter}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All coordinators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coordinators</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffOptions.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Progress filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</label>
              <Select value={progressFilter} onValueChange={v => setProgressFilter(v as typeof progressFilter)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="All progress" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All progress</SelectItem>
                  <SelectItem value="low">0–33% — Early stage</SelectItem>
                  <SelectItem value="mid">34–66% — Midway</SelectItem>
                  <SelectItem value="high">67–100% — Near complete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Compliance filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compliance</label>
              <Select value={complianceFilter} onValueChange={v => setComplianceFilter(v as typeof complianceFilter)}>
                <SelectTrigger className={`h-9 bg-white ${complianceFilter !== 'all' ? 'border-destructive text-destructive' : ''}`}>
                  <SelectValue placeholder="All compliance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All compliance</SelectItem>
                  <SelectItem value="critical">🔴 Critical — ≤30 days</SelectItem>
                  <SelectItem value="warning">🟡 Warning — 31–90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Idle Activity toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</label>
              <button
                onClick={() => setIdleFilter(v => !v)}
                className={`h-9 w-full rounded-md border px-3 flex items-center gap-2 text-sm font-medium transition-all ${
                  idleFilter
                    ? 'border-warning bg-warning/10 text-foreground'
                    : 'border-input bg-white text-muted-foreground hover:border-warning/50 hover:text-foreground'
                }`}
                style={idleFilter ? { borderColor: 'hsl(var(--warning))', color: 'hsl(var(--warning))' } : {}}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" style={idleFilter ? { color: 'hsl(var(--warning))' } : {}} />
                <span className="truncate">Idle 14d+</span>
                {idleCount > 0 && (
                  <span
                    className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      idleFilter ? 'bg-warning/20' : 'bg-muted'
                    }`}
                    style={idleFilter ? { color: 'hsl(var(--warning))' } : {}}
                  >
                    {idleCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {stageFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {stageFilter}
              <button onClick={() => setStageFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {statusFilter === 'in_progress' ? 'In Progress' : statusFilter === 'onboarded' ? 'Fully Onboarded' : 'Alert / Denied'}
              <button onClick={() => setStatusFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {coordinatorFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {coordinatorFilter === 'unassigned'
                ? 'Unassigned'
                : staffOptions.find(s => s.user_id === coordinatorFilter)?.full_name ?? coordinatorFilter}
              <button onClick={() => setCoordinatorFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {dispatchFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {DISPATCH_BADGE[dispatchFilter as DispatchStatus]?.label ?? dispatchFilter}
              <button onClick={() => setDispatchFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {progressFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
              {progressFilter === 'low' ? '0–33%' : progressFilter === 'mid' ? '34–66%' : '67–100%'}
              <button onClick={() => setProgressFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {complianceFilter !== 'all' && (
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${
              complianceFilter === 'critical'
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-yellow-50 text-yellow-700 border-yellow-300'
            }`}>
              <ShieldAlert className="h-3 w-3" />
              {complianceFilter === 'critical' ? 'Critical Expiry' : 'Expiry Warning'}
              <button onClick={() => setComplianceFilter('all')} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
          {stageNodeFilters.size > 0 && Array.from(stageNodeFilters).map(key => {
            const cfg = stageConfigs.find(c => c.stage_key === key);
            return (
              <span key={key} className="inline-flex items-center gap-1 bg-gold/10 text-gold border border-gold/30 text-xs px-2.5 py-1 rounded-full font-medium">
                Incomplete: {cfg?.full_name ?? key}
                <button onClick={() => toggleStageNodeFilter(key)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
              </span>
            );
          })}
          {idleFilter && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-warning/10 border-warning/30" style={{ color: 'hsl(var(--warning))' }}>
              <Clock className="h-3 w-3" />
              Idle 14d+
              <button onClick={() => setIdleFilter(false)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}
      {/* Stage breakdown — compact single-line ribbon */}
      <div className="bg-white border border-border rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground shrink-0 mr-1">Stages:</span>
        {STAGES.map((stage, i) => (
          <button
            key={stage}
            onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors shrink-0 ${
              stageFilter === stage
                ? 'border-gold bg-gold/10 text-gold'
                : 'border-border hover:border-gold/40 text-foreground bg-muted/40'
            }`}
          >
            <span className="font-bold">{stageCounts[stage] ?? 0}</span>
            <span className="text-muted-foreground">{STAGE_ABBR[stage] ?? `S${stage.match(/Stage (\d+)/)?.[1] ?? i + 1}`}</span>
          </button>
        ))}
        <span className="w-px h-4 bg-border shrink-0 mx-1" />
        {/* Dispatch + Compliance quick-filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
            {((['dispatched', 'home'] as DispatchStatus[]).map(status => {
              const badge = DISPATCH_BADGE[status];
              const count = operators.filter(op => op.dispatch_status === status).length;
              if (count === 0) return null;
              const isActive = dispatchFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setDispatchFilter(isActive ? 'all' : status)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    isActive
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-background' : badge.dot}`} />
                  {badge.label}
                  <span className={`font-bold ${isActive ? 'text-background' : ''}`}>{count}</span>
                </button>
              );
            }))}
            {/* Compliance filter chips */}
            {(() => {
              const criticalCount = operators.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until <= 30;
              }).length;
              const warningCount = operators.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until > 30 && a.days_until <= 90;
              }).length;
              return (
                <>
                  {(criticalCount > 0 || complianceFilter === 'critical') && (
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'critical' ? 'all' : 'critical')}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        complianceFilter === 'critical'
                          ? 'bg-destructive text-destructive-foreground border-destructive'
                          : 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
                      }`}
                    >
                      <ShieldAlert className={`h-3 w-3 ${complianceFilter === 'critical' ? 'text-destructive-foreground' : 'text-destructive'}`} />
                      Critical Expiry
                      <span className="font-bold">{criticalCount}</span>
                    </button>
                  )}
                  {(warningCount > 0 || complianceFilter === 'warning') && (
                    <button
                      onClick={() => setComplianceFilter(complianceFilter === 'warning' ? 'all' : 'warning')}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        complianceFilter === 'warning'
                          ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100'
                      }`}
                    >
                      <ShieldAlert className={`h-3 w-3 ${complianceFilter === 'warning' ? 'text-white' : 'text-yellow-600'}`} />
                      Expiry Warning
                      <span className="font-bold">{warningCount}</span>
                    </button>
                  )}
                </>
              );
            })()}
            {/* Idle 14d+ chip */}
            {idleCount > 0 && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIdleFilter(v => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        idleFilter
                          ? 'bg-warning text-warning-foreground border-warning'
                          : 'bg-warning/10 text-warning-foreground border-warning/30 hover:bg-warning/20'
                      }`}
                      style={idleFilter ? {} : { color: 'hsl(var(--warning))' }}
                    >
                      <Clock className={`h-3 w-3 ${idleFilter ? 'text-warning-foreground' : ''}`} style={idleFilter ? {} : { color: 'hsl(var(--warning))' }} />
                      Idle 14d+
                      <span className="font-bold">{idleCount}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px] text-center">
                    Show only operators whose onboarding status hasn't changed in 14+ days
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
      </div>


      {/* Legend-stage banner — shown when arriving from Management workload card */}
      {legendStageFilter && stageFilter === legendStageFilter && (() => {
        const STAGE_BANNER: Record<string, { bg: string; border: string; text: string; dot: string; icon: string }> = {
          'Stage 1 — Background':      { bg: 'bg-muted/40',             border: 'border-border',              text: 'text-foreground',       dot: 'bg-muted-foreground', icon: '🔍' },
          'Stage 2 — Documents':       { bg: 'bg-status-progress/8',    border: 'border-status-progress/25',  text: 'text-status-progress',  dot: 'bg-status-progress',  icon: '📄' },
          'Stage 3 — ICA':             { bg: 'bg-gold/8',               border: 'border-gold/25',             text: 'text-gold',             dot: 'bg-gold',             icon: '📝' },
          'Stage 4 — MO Registration': { bg: 'bg-info/8',               border: 'border-info/25',             text: 'text-info',             dot: 'bg-info',             icon: '🗺️' },
          'Stage 5 — Equipment':       { bg: 'bg-purple-400/8',         border: 'border-purple-400/25',       text: 'text-purple-500',       dot: 'bg-purple-400',       icon: '🚛' },
          'Stage 6 — Insurance':       { bg: 'bg-orange-400/8',         border: 'border-orange-400/25',       text: 'text-orange-500',       dot: 'bg-orange-400',       icon: '🛡️' },
        };
        const s = STAGE_BANNER[legendStageFilter] ?? STAGE_BANNER['Stage 1 — Background'];
        return (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${s.bg} ${s.border}`}>
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`} />
            <p className={`text-sm font-medium flex-1 ${s.text}`}>
              Showing operators at <span className="font-semibold">{legendStageFilter}</span>
            </p>
            <button
              onClick={() => { setStageFilter('all'); setLegendStageFilter(null); }}
              className={`flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity ${s.text}`}
              title="Clear stage filter"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        );
      })()}

      {/* Coordinator deep-link banner — shown when arriving from Management workload card coordinator row */}
      {legendCoordinatorFilter && coordinatorFilter === legendCoordinatorFilter.id && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-gold/8 border-gold/25">
          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-gold" />
          <p className="text-sm font-medium flex-1 text-gold">
            Showing operators assigned to <span className="font-semibold">{legendCoordinatorFilter.name}</span>
          </p>
          <button
            onClick={() => { setCoordinatorFilter('all'); setLegendCoordinatorFilter(null); }}
            className="flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity text-gold"
            title="Clear coordinator filter"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      {/* Has Unread filter banner — shown when the quick-filter chip is active */}
      {unreadFilter && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${unreadHighPriority ? 'bg-destructive/8 border-destructive/25' : 'bg-primary/8 border-primary/25'}`}>
          <MessageSquare className={`h-4 w-4 shrink-0 ${unreadHighPriority ? 'text-destructive' : 'text-primary'}`} />
          <p className={`text-sm font-medium flex-1 ${unreadHighPriority ? 'text-destructive' : 'text-primary'}`}>
            Showing operators with <span className="font-semibold">{unreadHighPriority ? '3+ unread messages (high priority)' : 'unread messages'}</span>
          </p>
          <button
            onClick={() => { setUnreadFilter(false); setUnreadHighPriority(false); }}
            className={`flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity ${unreadHighPriority ? 'text-destructive' : 'text-primary'}`}
            title="Clear unread filter"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      {/* Exception Active filter banner — shown when the quick-filter chip is active */}
      {exceptionFilter && (() => {
        const exCount = filtered.filter(o => o.paper_logbook_approved || o.temp_decal_approved).length;
        return (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-warning/8 border-warning/25">
            <span className="text-sm font-black leading-none shrink-0" style={{ color: 'hsl(var(--warning))' }}>E</span>
            <p className="text-sm font-medium flex-1" style={{ color: 'hsl(var(--warning))' }}>
              <span className="font-semibold">{exCount} operator{exCount !== 1 ? 's' : ''}</span>
              {' '}running under an approved exception — en route to the SUPERTRANSPORT shop for installation
            </p>
            <button
              onClick={() => setExceptionFilter(false)}
              className="flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: 'hsl(var(--warning))' }}
              title="Clear exception filter"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        );
      })()}

      {/* Stage incomplete quick-filter chip row — one chip per active stage from pipeline_config */}
      {stageConfigs.filter(c => c.is_active).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Incomplete:</span>
          {stageConfigs
            .filter(c => c.is_active)
            .sort((a, b) => a.stage_order - b.stage_order)
            .map(cfg => {
              const incompleteCount = operators.filter(op =>
                cfg.items.length > 0 &&
                !cfg.items.every(item => evalItem(op, item.field, item.complete_value))
              ).length;
              if (incompleteCount === 0) return null;
              // Partial = at least one item done but not all (in-progress)
              const partialCount = operators.filter(op =>
                cfg.items.length > 0 &&
                cfg.items.some(item => evalItem(op, item.field, item.complete_value)) &&
                !cfg.items.every(item => evalItem(op, item.field, item.complete_value))
              ).length;
              // Not-started = none done
              const notStartedCount = incompleteCount - partialCount;
              const isActive = stageNodeFilters.has(cfg.stage_key);
              return (
                <TooltipProvider key={cfg.stage_key} delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => toggleStageNodeFilter(cfg.stage_key)}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-all active:scale-95 ${
                          isActive
                            ? 'bg-gold text-white border-gold shadow-sm'
                            : 'bg-background text-muted-foreground border-border hover:border-gold/50 hover:text-gold'
                        }`}
                      >
                        {cfg.label}
                        {/* Total incomplete count */}
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full leading-none ${
                          isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                        }`}>
                          {incompleteCount}
                        </span>
                        {/* In-progress sub-count — amber dot + number */}
                        {partialCount > 0 && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold leading-none ${
                            isActive ? 'text-white/80' : 'text-gold'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/70' : 'bg-gold'}`} />
                            {partialCount}
                          </span>
                        )}
                        {isActive && <X className="h-3 w-3 shrink-0" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs space-y-1 p-2.5">
                      <p className="font-semibold">{cfg.full_name ?? cfg.label}</p>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 border border-border shrink-0" />
                          <span><span className="font-semibold">{notStartedCount}</span> not started</span>
                        </div>
                        {partialCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-gold shrink-0" />
                            <span><span className="font-semibold">{partialCount}</span> in progress</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 pt-0.5 border-t border-border mt-1">
                          <span className="h-2 w-2 rounded-full bg-destructive/60 shrink-0" />
                          <span><span className="font-semibold">{incompleteCount}</span> total incomplete</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic pt-0.5">Click to filter the list</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          {stageNodeFilters.size > 0 && (
            <button
              onClick={() => setStageNodeFilters(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Multi-stage blocked callout — shows operators incomplete in 2+ stages */}
      <MultiBlockedCallout
        operators={operators}
        stageConfigs={stageConfigs}
        stageNodeFilters={stageNodeFilters}
        setStageNodeFilters={setStageNodeFilters}
        onOpenOperator={onOpenOperator}
      />

      {/* Operator table */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {/* Bulk select checkbox column */}
                {onBulkMessage && (
                  <th className="px-3 py-3 w-10 shrink-0">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every(op => selectedOperatorIds.has(op.id))}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedOperatorIds(prev => {
                            const next = new Set(prev);
                            filtered.forEach(op => next.add(op.id));
                            return next;
                          });
                        } else {
                          setSelectedOperatorIds(prev => {
                            const next = new Set(prev);
                            filtered.forEach(op => next.delete(op.id));
                            return next;
                          });
                        }
                      }}
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                    >
                      Name
                      {sortKey === 'name'
                        ? sortDir === 'asc'
                          ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                          : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                        : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                    </button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleSort('progress')}
                            className={[
                              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors border',
                              sortKey === 'progress'
                                ? 'bg-gold/15 border-gold/40 text-gold'
                                : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-gold hover:border-gold/40 hover:bg-gold/10',
                            ].join(' ')}
                          >
                            %
                            {sortKey === 'progress'
                              ? sortDir === 'desc'
                                ? <ArrowDown className="h-2.5 w-2.5" />
                                : <ArrowUp className="h-2.5 w-2.5" />
                              : <ArrowUpDown className="h-2.5 w-2.5 opacity-60" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Sort by completion % (highest first)</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">State</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  <div className="flex flex-col gap-1.5">
                    {/* Row 1 — label + sort controls */}
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => handleSort('stage')}
                        className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                      >
                        Progress Track
                        {sortKey === 'stage'
                          ? sortDir === 'asc'
                            ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                            : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                          : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                      </button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleSort('progress')}
                              className={[
                                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors border',
                                sortKey === 'progress'
                                  ? 'bg-gold/15 border-gold/40 text-gold'
                                  : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-gold hover:border-gold/40 hover:bg-gold/10',
                              ].join(' ')}
                            >
                              %
                              {sortKey === 'progress'
                                ? sortDir === 'desc'
                                  ? <ArrowDown className="h-2.5 w-2.5" />
                                  : <ArrowUp className="h-2.5 w-2.5" />
                                : <ArrowUpDown className="h-2.5 w-2.5 opacity-60" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Sort by completion % (highest first)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default text-muted-foreground/60 hover:text-muted-foreground border-b border-dashed border-muted-foreground/40 leading-none text-[10px]">?</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px] text-left space-y-1.5">
                            <p className="font-semibold text-xs">6-stage parallel progress track — hover any node for sub-item detail:</p>
                            <ol className="text-xs space-y-0.5 list-decimal list-inside text-muted-foreground">
                              <li><span className="text-foreground font-medium">BG</span> — MVR &amp; CH approved</li>
                              <li><span className="text-foreground font-medium">Docs</span> — Form 2290, title, photos &amp; inspection</li>
                              <li><span className="text-foreground font-medium">ICA</span> — Contract fully signed</li>
                              <li><span className="text-foreground font-medium">MO</span> — Missouri registration received</li>
                              <li><span className="text-foreground font-medium">Equip</span> — Decal, ELD &amp; fuel card</li>
                              <li><span className="text-foreground font-medium">Ins</span> — Added to insurance policy</li>
                            </ol>
                            <p className="text-xs text-muted-foreground pt-0.5">🟢 Complete &nbsp;🟠 In progress &nbsp;⬜ Not started</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {/* Row 2 — per-stage incomplete count badges, aligned to node positions */}
                    {stageConfigs.filter(c => c.is_active).length > 0 && (
                      <div className="flex items-center gap-0 min-w-[200px]">
                        {stageConfigs
                          .filter(c => c.is_active)
                          .sort((a, b) => a.stage_order - b.stage_order)
                          .map((cfg, i, arr) => {
                            const incompleteCount = operators.filter(op =>
                              cfg.items.length > 0 &&
                              !cfg.items.every(item => evalItem(op, item.field, item.complete_value))
                            ).length;
                            const isFiltered = stageNodeFilters.has(cfg.stage_key);
                            return (
                              <div key={cfg.stage_key} className="flex items-center">
                                {/* Spacer connector matching the track connector width */}
                                {i > 0 && <div className="w-3 shrink-0" />}
                                <TooltipProvider delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => toggleStageNodeFilter(cfg.stage_key)}
                                        className={[
                                          'flex flex-col items-center gap-0.5 w-5 rounded transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-gold/60',
                                          incompleteCount > 0 ? 'cursor-pointer' : 'cursor-default pointer-events-none',
                                        ].join(' ')}
                                      >
                                        {incompleteCount > 0 ? (
                                          <span
                                            className={[
                                              'inline-flex items-center justify-center min-w-[18px] h-[14px] rounded-full text-[9px] font-bold leading-none px-1 transition-colors',
                                              isFiltered
                                                ? 'bg-gold text-white'
                                                : 'bg-destructive/15 text-destructive border border-destructive/25 hover:bg-destructive/25',
                                            ].join(' ')}
                                          >
                                            {incompleteCount}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center justify-center w-[18px] h-[14px] rounded-full text-[9px] leading-none text-muted-foreground/30">
                                            —
                                          </span>
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      {incompleteCount > 0
                                        ? `${incompleteCount} operator${incompleteCount !== 1 ? 's' : ''} with ${cfg.full_name} incomplete — click to filter`
                                        : `${cfg.full_name}: all complete`}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => handleSort('docs')}
                      className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                    >
                      Docs
                      {sortKey === 'docs'
                        ? sortDir === 'asc'
                          ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                          : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                        : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                    </button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-default text-muted-foreground/60 hover:text-muted-foreground border-b border-dashed border-muted-foreground/40 leading-none text-[10px] ml-0.5">?</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px] text-left space-y-1.5">
                          <p className="font-semibold text-xs">Count of uploaded documents, including:</p>
                          <ul className="text-xs space-y-0.5 text-muted-foreground">
                            <li><span className="text-foreground font-medium">Registration</span></li>
                            <li><span className="text-foreground font-medium">Insurance certificate</span></li>
                            <li><span className="text-foreground font-medium">Inspection report</span></li>
                            <li><span className="text-foreground font-medium">Form 2290</span></li>
                            <li><span className="text-foreground font-medium">Truck title</span></li>
                            <li><span className="text-foreground font-medium">Truck photos</span></li>
                            <li><span className="text-foreground font-medium">Other uploads</span></li>
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden lg:table-cell">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-default border-b border-dashed border-muted-foreground/50">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          Dispatch
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-left space-y-1.5">
                        <p className="font-semibold text-xs">Current dispatch status for fully onboarded operators:</p>
                        <ul className="text-xs space-y-1 text-muted-foreground">
                          <li><span className="text-muted-foreground font-medium">⚫ Not Dispatched</span> — Operator is available but not yet on a load</li>
                          <li><span className="text-status-complete font-medium">🟢 Dispatched</span> — Currently running a load</li>
                          <li><span className="text-status-progress font-medium">🟠 Home</span> — Back home, between loads</li>
                          <li><span className="text-destructive font-medium">🔴 Truck Down</span> — Vehicle issue requiring immediate attention</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden xl:table-cell">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => handleSort('coordinator')}
                      className="inline-flex items-center gap-1 hover:text-gold transition-colors group"
                    >
                      Coordinator
                      {sortKey === 'coordinator'
                        ? sortDir === 'asc'
                          ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                          : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                        : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                    </button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-default text-muted-foreground/60 hover:text-muted-foreground border-b border-dashed border-muted-foreground/40 leading-none text-[10px] ml-0.5">?</span>
                        </TooltipTrigger>
                         <TooltipContent side="top" className="max-w-[240px] text-left space-y-1.5">
                           <p className="font-semibold text-xs">Assigned onboarding coordinator:</p>
                           <ul className="text-xs space-y-1 text-muted-foreground">
                             <li><span className="text-foreground font-medium">Role</span> — Guides the operator through all 6 onboarding stages</li>
                             <li><span className="text-foreground font-medium">Reassignable</span> — Can be changed at any time from this column</li>
                           </ul>
                         </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">
                   <div className="inline-flex items-center gap-1">
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <button
                             onClick={() => handleSort('msgs')}
                             className="inline-flex items-center gap-0.5 hover:text-gold transition-colors group border-b border-dashed border-muted-foreground/40 pb-0.5"
                           >
                             <MessageSquare className={`h-3.5 w-3.5 ${sortKey === 'msgs' ? 'text-gold' : 'text-muted-foreground group-hover:text-gold/60'}`} />
                             <span className={`text-xs font-semibold ${sortKey === 'msgs' ? 'text-gold' : 'text-muted-foreground group-hover:text-gold/60'}`}>Msgs</span>
                             {sortKey === 'msgs'
                               ? sortDir === 'asc'
                                 ? <ArrowUp className="h-3 w-3 text-gold" />
                                 : <ArrowDown className="h-3 w-3 text-gold" />
                               : <ArrowUpDown className="h-3 w-3 text-muted-foreground group-hover:text-gold/60" />}
                           </button>
                         </TooltipTrigger>
                         <TooltipContent side="top" className="max-w-[240px] text-left space-y-1.5">
                           <p className="font-semibold text-xs">Unread messages from the operator:</p>
                           <ul className="text-xs space-y-1 text-muted-foreground">
                             <li><span className="text-foreground font-medium">Count</span> — Messages sent by the operator that staff haven't read yet</li>
                             <li><span className="text-foreground font-medium">Sort</span> — Descending puts operators with the most unread messages first</li>
                             <li><span className="text-foreground font-medium">Open</span> — Click the row to open the full conversation</li>
                           </ul>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                   </div>
                 </th>
                 <th className="px-4 py-3 text-center">
                   <div className="inline-flex items-center justify-center gap-1">
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <button
                             onClick={() => handleSort('compliance')}
                             className="inline-flex items-center gap-0.5 hover:text-gold transition-colors group border-b border-dashed border-muted-foreground/40 pb-0.5"
                           >
                             <ShieldAlert className={`h-3.5 w-3.5 ${sortKey === 'compliance' ? 'text-gold' : 'text-muted-foreground group-hover:text-gold/60'}`} />
                             {sortKey === 'compliance'
                               ? sortDir === 'asc'
                                 ? <ArrowUp className="h-3 w-3 text-gold" />
                                 : <ArrowDown className="h-3 w-3 text-gold" />
                               : <ArrowUpDown className="h-3 w-3 text-muted-foreground group-hover:text-gold/60" />}
                           </button>
                         </TooltipTrigger>
                         <TooltipContent side="top" className="max-w-[260px] text-left space-y-1.5">
                           <p className="font-semibold text-xs">CDL or Medical Certificate expiry within 90 days:</p>
                           <ul className="text-xs space-y-1 text-muted-foreground">
                             <li><span className="text-destructive font-medium">🔴 Critical (≤ 30 days)</span> — Expired or expiring imminently; immediate action required</li>
                             <li><span className="text-warning font-medium">🟡 Warning (31–90 days)</span> — Expiring soon; send a reminder to the operator</li>
                             <li><span className="text-foreground font-medium">Documents tracked</span> — CDL &amp; Medical Certificate</li>
                             <li><span className="text-foreground font-medium">Sort</span> — Ascending puts most urgent first; compliant operators last</li>
                           </ul>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                   </div>
                 </th>
                 <th className="text-left px-4 py-3 font-semibold text-foreground hidden xl:table-cell">
                   <div className="inline-flex items-center gap-1">
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <button
                             onClick={() => handleSort('last_activity')}
                             className="inline-flex items-center gap-1 hover:text-gold transition-colors group whitespace-nowrap"
                           >
                             Last Activity
                             {sortKey === 'last_activity'
                               ? sortDir === 'asc'
                                 ? <ArrowUp className="h-3.5 w-3.5 text-gold" />
                                 : <ArrowDown className="h-3.5 w-3.5 text-gold" />
                               : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold/60" />}
                           </button>
                         </TooltipTrigger>
                         <TooltipContent side="top" className="max-w-[260px] text-left space-y-1.5">
                           <p className="font-semibold text-xs">Time since the last onboarding status change:</p>
                           <ul className="text-xs space-y-1 text-muted-foreground">
                             <li><span className="text-foreground font-medium">Source</span> — Any update to the operator's onboarding checklist</li>
                              <li><span className="text-warning font-medium">🟡 Amber highlight</span> — No activity in 14 or more days</li>
                              <li><span className="text-foreground font-medium">Idle filter</span> — Use "Idle 14d+" to isolate stalled operators, sorted oldest first</li>
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                   </div>
                 </th>
                 <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={12} className="text-center py-12 text-muted-foreground">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-muted-foreground">
                    {operators.length === 0 ? 'No operators in the pipeline yet.' : 'No operators match your filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map(op => (
                   <tr key={op.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${selectedOperatorIds.has(op.id) ? 'bg-primary/5' : ''}`}>
                     {/* Bulk select checkbox */}
                     {onBulkMessage && (
                       <td className="px-3 py-3 w-10" onClick={e => { e.stopPropagation(); }}>
                         <Checkbox
                           checked={selectedOperatorIds.has(op.id)}
                           onCheckedChange={() => {
                             setSelectedOperatorIds(prev => {
                               const next = new Set(prev);
                               next.has(op.id) ? next.delete(op.id) : next.add(op.id);
                               return next;
                             });
                           }}
                         />
                       </td>
                     )}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
                            <button
                               onClick={() => onOpenOperator(op.id)}
                               className="font-medium text-foreground truncate hover:text-primary hover:underline underline-offset-2 transition-colors text-left"
                             >
                               {op.first_name || op.last_name ? `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() : '—'}
                             </button>
                            {(() => {
                              const pct = computeProgressFromConfig(op, stageConfigs);
                              const isComplete = pct === 100;
                              return (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none shrink-0 tabular-nums"
                                  style={
                                    isComplete
                                      ? { background: 'hsl(var(--status-complete) / 0.15)', color: 'hsl(var(--status-complete))' }
                                      : pct > 0
                                      ? { background: 'hsl(var(--status-in-progress) / 0.12)', color: 'hsl(var(--status-in-progress))' }
                                      : { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }
                                  }
                                >
                                  {pct}%
                                </span>
                              );
                            })()}
                            {op.unread_count > 0 && (
                               <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0 md:hidden ${op.unread_count >= 3 ? 'bg-destructive text-destructive-foreground' : 'bg-primary/15 text-primary'}`}>
                                 <MessageSquare className="h-2.5 w-2.5" />
                                 {op.unread_count}
                               </span>
                             )}
                          </div>
                         {op.never_logged_in && (
                           <div className="flex items-center gap-1.5 flex-wrap">
                             <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-warning/15 text-warning border border-warning/30 shrink-0 cursor-default">
                                     <Clock className="h-2.5 w-2.5 shrink-0" />
                                     Invite Pending
                                   </span>
                                 </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs text-left space-y-0.5">
                                    <p className="font-semibold">Invite Pending</p>
                                    <p className="text-muted-foreground">
                                      {op.invited_at
                                        ? `Invited ${format(parseISO(op.invited_at), 'MMM d, yyyy')} · ${formatDistanceToNowStrict(parseISO(op.invited_at), { addSuffix: false })} ago`
                                        : 'This operator has never logged in'}
                                    </p>
                                  </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                             <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <button
                                     onClick={e => { e.stopPropagation(); handleResendInvite(op); }}
                                     disabled={resendingSending[op.id] || resendSent[op.id]}
                                     className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none border shrink-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-muted/50 text-muted-foreground border-border hover:bg-warning/10 hover:text-warning hover:border-warning/40"
                                   >
                                     {resendingSending[op.id] ? (
                                       <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                                     ) : resendSent[op.id] ? (
                                       <CheckCheck className="h-2.5 w-2.5 shrink-0 text-status-complete" />
                                     ) : (
                                       <Send className="h-2.5 w-2.5 shrink-0" />
                                     )}
                                     {resendSent[op.id] ? 'Sent' : 'Resend Invite'}
                                   </button>
                                 </TooltipTrigger>
                                 <TooltipContent side="top" className="text-xs">
                                   {resendSent[op.id] ? 'Invitation email sent!' : `Resend invitation to ${op.email ?? 'this operator'}`}
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           </div>
                         )}
                       </div>
                     </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{formatPhoneDisplay(op.phone) || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{op.home_state ?? '—'}</td>
                     <td className="px-4 py-3">
                       <div className="flex flex-col gap-1.5">
                         <StageTrack
                           op={op}
                           stageConfigs={stageConfigs}
                           onNodeClick={onOpenOperatorAtStage}
                         />
                         {/* Days in Draft chip — shown when ICA is in-progress */}
                         {op.ica_status === 'in_progress' && op.ica_draft_since && (() => {
                           const daysInDraft = differenceInDays(new Date(), parseISO(op.ica_draft_since));
                           const isStale = daysInDraft >= 7;
                           return (
                             <TooltipProvider delayDuration={100}>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none border cursor-default w-fit ${
                                     isStale
                                       ? 'bg-warning/15 text-warning border-warning/30'
                                       : 'bg-status-progress/10 text-status-progress border-status-progress/25'
                                   }`} style={isStale ? { color: 'hsl(var(--warning))' } : {}}>
                                     <FileClock className="h-2.5 w-2.5 shrink-0" />
                                     {daysInDraft === 0 ? 'Draft today' : `${daysInDraft}d in draft`}
                                   </span>
                                 </TooltipTrigger>
                                 <TooltipContent side="bottom" className="text-xs text-left space-y-0.5">
                                   <p className="font-semibold">ICA draft in progress</p>
                                   <p className="text-muted-foreground">
                                     Started {format(parseISO(op.ica_draft_since), 'MMM d, yyyy')}
                                     {isStale && ' — consider following up'}
                                   </p>
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           );
                         })()}
                       </div>
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
                    {/* Dispatch status badge — only shown for fully onboarded operators */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {op.dispatch_status ? (() => {
                        const cfg = DISPATCH_BADGE[op.dispatch_status];
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })() : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex items-center gap-1.5 min-w-[160px]">
                        {assigningMap[op.id] && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                        )}
                        <Select
                          value={op.assigned_staff_id ?? 'unassigned'}
                          onValueChange={val => handleAssignCoordinator(op.id, val === 'unassigned' ? null : val)}
                          disabled={assigningMap[op.id]}
                        >
                          <SelectTrigger className="h-7 text-xs border-dashed hover:border-solid hover:border-gold/60 focus:ring-0 focus:border-gold/60 transition-colors bg-transparent">
                            <SelectValue>
                              {op.assigned_staff_name
                                ? <span className="text-foreground">{op.assigned_staff_name}</span>
                                : <span className="italic text-muted-foreground/60">Unassigned</span>
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              <span className="italic text-muted-foreground">Unassigned</span>
                            </SelectItem>
                            {staffOptions.map(s => (
                              <SelectItem key={s.user_id} value={s.user_id}>
                                {s.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                     <td className="px-4 py-3 hidden md:table-cell">
                       {op.unread_count > 0 ? (
                         op.unread_count >= 3 ? (
                           <TooltipProvider>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-destructive text-destructive-foreground border-destructive/60 animate-pulse cursor-default">
                                   <MessageSquare className="h-3 w-3" />
                                   {op.unread_count}
                                 </span>
                               </TooltipTrigger>
                               <TooltipContent side="top" className="max-w-[220px] text-left space-y-1">
                                 <p className="font-semibold text-xs text-destructive">High-priority — {op.unread_count} unread</p>
                                 <p className="text-xs text-muted-foreground">This operator has 3 or more unread messages waiting for a staff reply. Open the conversation to respond.</p>
                               </TooltipContent>
                             </Tooltip>
                           </TooltipProvider>
                         ) : (
                           <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-primary/10 text-primary border-primary/30">
                             <MessageSquare className="h-3 w-3" />
                             {op.unread_count}
                           </span>
                         )
                       ) : (
                         <span className="text-muted-foreground/40 text-xs">—</span>
                       )}
                     </td>
                    {/* Compliance icon cell */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const alert = complianceByOperator[op.id];
                        if (!alert) {
                          return <ShieldCheck className="h-4 w-4 text-muted-foreground/25 mx-auto" />;
                        }
                        const expired = alert.days_until < 0;
                        const critical = !expired && alert.days_until <= 30;
                        const tooltipText = expired
                          ? `${alert.doc_type} expired ${Math.abs(alert.days_until)}d ago`
                          : alert.days_until === 0
                          ? `${alert.doc_type} expires today`
                          : `${alert.doc_type} expires in ${alert.days_until}d`;
                        return (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => onOpenOperator(op.id)}
                                  className="mx-auto block focus:outline-none"
                                  aria-label={tooltipText}
                                >
                                  <ShieldAlert
                                    className={`h-4 w-4 ${
                                      expired || critical
                                        ? 'text-destructive animate-pulse'
                                        : 'text-warning'
                                    }`}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs font-medium">
                                {tooltipText}
                                {alert.days_until >= 0 && (
                                  <span className="ml-1 text-muted-foreground">
                                    — exp. {format(parseISO(alert.expiration_date), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                     </td>
                     {/* Last Activity cell */}
                     <td className="px-4 py-3 hidden xl:table-cell whitespace-nowrap">
                       {op.onboarding_updated_at ? (
                         <TooltipProvider delayDuration={100}>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <span className={`inline-flex items-center gap-1 text-xs ${
                                 (() => {
                                   const diff = Math.floor((Date.now() - new Date(op.onboarding_updated_at).getTime()) / 86400000);
                                   return diff >= 14 ? 'text-warning font-medium' : 'text-muted-foreground';
                                 })()
                               }`}>
                                 <Clock className="h-3 w-3 shrink-0" />
                                 {formatDistanceToNowStrict(parseISO(op.onboarding_updated_at), { addSuffix: true })}
                               </span>
                             </TooltipTrigger>
                             <TooltipContent side="left" className="text-xs">
                               {format(parseISO(op.onboarding_updated_at), 'MMM d, yyyy h:mm a')}
                             </TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       ) : (
                         <span className="text-muted-foreground/40 text-xs">—</span>
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
            {!loading && filtered.length > 0 && (() => {
              const filteredCritical = filtered.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until <= 30;
              }).length;
              const filteredWarning = filtered.filter(op => {
                const a = complianceByOperator[op.id];
                return a != null && a.days_until > 30 && a.days_until <= 90;
              }).length;
              const filteredClean = filtered.length - filteredCritical - filteredWarning;
              return (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={12} className="px-4 py-2.5">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Compliance summary — {filtered.length} visible
                        </span>
                        <div className="flex items-center gap-3 flex-wrap">
                          {filteredCritical > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              {filteredCritical} critical
                            </span>
                          )}
                          {filteredWarning > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              {filteredWarning} warning
                            </span>
                          )}
                          {filteredClean > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {filteredClean} compliant
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

      {/* ─── On Hold Section ──────────────────────────────────────────────── */}
      {(() => {
        const onHoldOps = operators.filter(op => op.on_hold);
        if (onHoldOps.length === 0) return null;
        return (
          <div className="rounded-xl border border-border shadow-sm overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setOnHoldExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            >
              <PauseCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold text-foreground">On Hold</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border ml-0.5">
                {onHoldOps.length}
              </span>
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                Operators paused — not currently progressing through onboarding
              </span>
              <div className="ml-auto shrink-0">
                {onHoldExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {onHoldExpanded && (
              <div className="divide-y divide-border bg-background">
                {onHoldOps.map(op => {
                  const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() || 'Unknown Operator';
                  return (
                    <div key={op.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                      {/* Pause icon */}
                      <PauseCircle className="h-4 w-4 text-muted-foreground shrink-0" />

                      {/* Name */}
                      <button
                        onClick={() => onOpenOperator(op.id)}
                        className="font-medium text-sm text-foreground hover:text-gold hover:underline underline-offset-2 transition-colors text-left shrink-0"
                      >
                        {name}
                      </button>

                      {/* Hold date */}
                      {op.on_hold_date && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          Since {format(parseISO(op.on_hold_date), 'MMM d, yyyy')}
                        </span>
                      )}

                      {/* Reason */}
                      {op.on_hold_reason && (
                        <span className="text-xs text-muted-foreground italic truncate max-w-xs">
                          "{op.on_hold_reason}"
                        </span>
                      )}

                      {/* Progress track */}
                      <div className="ml-auto shrink-0 hidden lg:block">
                        <StageTrack op={op} stageConfigs={stageConfigs} onNodeClick={onOpenOperatorAtStage} />
                      </div>

                      {/* Archive button */}
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={e => { e.stopPropagation(); setArchiveTarget(op); setArchiveReason(''); }}
                            >
                              <ArchiveX className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Archive &amp; remove from pipeline</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Open button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenOperator(op.id)}
                        className="text-gold hover:text-gold-light hover:bg-gold/10 text-xs shrink-0"
                      >
                        Open →
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Owner Test Accounts Section ──────────────────────────────────── */}
      {(() => {
        const ownerOps = operators.filter(op => OWNER_USER_IDS.has(op.user_id));
        if (ownerOps.length === 0) return null;
        return (
          <div className="rounded-xl border border-border shadow-sm overflow-hidden">
            <button
              onClick={() => setOwnerTestExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            >
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold text-foreground">Owner Test Accounts</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border ml-0.5">
                {ownerOps.length}
              </span>
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                Your accounts for testing — not included in pipeline counts or filters
              </span>
              <div className="ml-auto shrink-0">
                {ownerTestExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {ownerTestExpanded && (
              <div className="divide-y divide-border bg-background">
                {ownerOps.map(op => {
                  const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() || 'Unknown Operator';
                  const dispatchInfo = op.dispatch_status ? DISPATCH_BADGE[op.dispatch_status] : null;
                  return (
                    <div key={op.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />

                      <button
                        onClick={() => onOpenOperator(op.id)}
                        className="font-medium text-sm text-foreground hover:text-gold hover:underline underline-offset-2 transition-colors text-left shrink-0"
                      >
                        {name}
                      </button>

                      {/* Dispatch badge */}
                      {dispatchInfo && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${dispatchInfo.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dispatchInfo.dot}`} />
                          {dispatchInfo.label}
                        </span>
                      )}

                      {/* Progress track */}
                      <div className="ml-auto shrink-0 hidden lg:block">
                        <StageTrack op={op} stageConfigs={stageConfigs} onNodeClick={onOpenOperatorAtStage} />
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenOperator(op.id)}
                        className="text-gold hover:text-gold-light hover:bg-gold/10 text-xs shrink-0"
                      >
                        Open →
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Archive Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={!!archiveTarget} onOpenChange={open => { if (!open) { setArchiveTarget(null); setArchiveReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this applicant?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                <strong>{archiveTarget ? `${archiveTarget.first_name ?? ''} ${archiveTarget.last_name ?? ''}`.trim() || 'This operator' : ''}</strong> will be removed from the pipeline and moved to the Archived Drivers list.
              </span>
              <span className="block text-muted-foreground">This does not delete any records.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-foreground">Reason (optional)</label>
            <Textarea
              placeholder="e.g. Did not respond after 30 days"
              value={archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
              className="mt-1.5"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); handleArchiveFromHold(); }}
              disabled={archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArchiveX className="h-4 w-4 mr-1" />}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScrollJumpButton />
    </div>
  );
}
