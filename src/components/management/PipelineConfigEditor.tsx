import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Settings2, ChevronDown, ChevronUp, Save, RotateCcw,
  PlusCircle, Trash2, GripVertical, Info, Loader2, Check,
  AlertCircle, Eye, EyeOff, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StageItem {
  key: string;
  label: string;
  field: string;
  complete_value: string;
  note?: string;
}

interface StageConfig {
  id: string;
  stage_key: string;
  stage_order: number;
  label: string;
  full_name: string;
  description: string | null;
  items: StageItem[];
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  bg:    'bg-blue-500/15 text-blue-700 border-blue-200',
  docs:  'bg-amber-500/15 text-amber-700 border-amber-200',
  ica:   'bg-purple-500/15 text-purple-700 border-purple-200',
  mo:    'bg-green-500/15 text-green-700 border-green-200',
  equip: 'bg-orange-500/15 text-orange-700 border-orange-200',
  ins:   'bg-teal-500/15 text-teal-700 border-teal-200',
};

const NODE_DOT_COLORS: Record<string, string> = {
  bg:    'bg-blue-500',
  docs:  'bg-amber-500',
  ica:   'bg-purple-500',
  mo:    'bg-green-500',
  equip: 'bg-orange-500',
  ins:   'bg-teal-500',
};

// ─── Item row editor ─────────────────────────────────────────────────────────

interface ItemRowProps {
  item: StageItem;
  index: number;
  total: number;
  onChange: (index: number, updated: StageItem) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: 'up' | 'down') => void;
}

function ItemRow({ item, index, total, onChange, onRemove, onMove }: ItemRowProps) {
  return (
    <div className="group flex items-start gap-2 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors">
      {/* Reorder */}
      <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
        <button
          onClick={() => onMove(index, 'up')}
          disabled={index === 0}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => onMove(index, 'down')}
          disabled={index === total - 1}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Label</label>
          <Input
            value={item.label}
            onChange={e => onChange(index, { ...item, label: e.target.value })}
            placeholder="e.g. Form 2290"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">DB Field</label>
          <Input
            value={item.field}
            onChange={e => onChange(index, { ...item, field: e.target.value })}
            placeholder="e.g. form_2290"
            className="h-7 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            Complete When
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  The field value that marks this item as done. Use "present" for date fields (any non-null value).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
          <Input
            value={item.complete_value}
            onChange={e => onChange(index, { ...item, complete_value: e.target.value })}
            placeholder="e.g. received / yes / present / requested|received"
            title="Use pipe (|) to match multiple values, e.g. requested|received"
            className="h-7 text-xs font-mono"
          />
        </div>
      </div>

      {/* Note (optional) */}
      {item.note && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-1 cursor-default" />
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs max-w-[220px]">{item.note}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
        className="p-1 mt-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Stage card ───────────────────────────────────────────────────────────────

interface StageCardProps {
  stage: StageConfig;
  dirty: boolean;
  saving: boolean;
  onSave: (stage: StageConfig) => void;
  onChange: (updated: StageConfig) => void;
}

function StageCard({ stage, dirty, saving, onSave, onChange }: StageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = NODE_COLORS[stage.stage_key] ?? 'bg-secondary text-foreground border-border';
  const dotColor = NODE_DOT_COLORS[stage.stage_key] ?? 'bg-muted-foreground';

  const handleItemChange = (index: number, updated: StageItem) => {
    const items = [...stage.items];
    items[index] = updated;
    onChange({ ...stage, items });
  };

  const handleItemRemove = (index: number) => {
    const items = stage.items.filter((_, i) => i !== index);
    onChange({ ...stage, items });
  };

  const handleItemMove = (index: number, dir: 'up' | 'down') => {
    const items = [...stage.items];
    const swap = dir === 'up' ? index - 1 : index + 1;
    [items[index], items[swap]] = [items[swap], items[index]];
    onChange({ ...stage, items });
  };

  const handleAddItem = () => {
    const newItem: StageItem = {
      key: `item_${Date.now()}`,
      label: '',
      field: '',
      complete_value: '',
    };
    onChange({ ...stage, items: [...stage.items, newItem] });
  };

  return (
    <div className={`rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${!stage.is_active ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Stage badge */}
        <div className={`shrink-0 h-7 w-7 rounded-full border flex items-center justify-center text-[11px] font-bold ${colorClass}`}>
          {stage.label}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={stage.full_name}
              onChange={e => onChange({ ...stage, full_name: e.target.value })}
              className="h-6 text-sm font-semibold border-transparent hover:border-border focus:border-border px-1 py-0 w-auto min-w-[120px] max-w-[220px]"
              placeholder="Stage name"
            />
            <span className="text-xs text-muted-foreground">·</span>
            <Input
              value={stage.label}
              onChange={e => onChange({ ...stage, label: e.target.value })}
              className="h-6 text-xs border-transparent hover:border-border focus:border-border px-1 py-0 w-14 font-mono"
              placeholder="Label"
              maxLength={6}
            />
            <span className={`shrink-0 h-2 w-2 rounded-full ${dotColor}`} />
            <span className="text-[10px] text-muted-foreground font-mono">{stage.items.length} item{stage.items.length !== 1 ? 's' : ''}</span>
            {dirty && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-status-progress/15 text-status-progress border border-status-progress/25">
                Unsaved
              </span>
            )}
          </div>
          <Input
            value={stage.description ?? ''}
            onChange={e => onChange({ ...stage, description: e.target.value })}
            className="h-5 text-[11px] text-muted-foreground border-transparent hover:border-border focus:border-border px-1 py-0 mt-0.5 w-full max-w-md"
            placeholder="Stage description (optional)…"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active toggle */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onChange({ ...stage, is_active: !stage.is_active })}
                  className={`p-1.5 rounded transition-colors ${stage.is_active ? 'text-status-complete hover:bg-status-complete/10' : 'text-muted-foreground hover:bg-secondary'}`}
                >
                  {stage.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {stage.is_active ? 'Stage is active — click to hide' : 'Stage is hidden — click to show'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Save */}
          <Button
            size="sm"
            onClick={() => onSave(stage)}
            disabled={!dirty || saving}
            className="h-7 px-2.5 text-xs gap-1"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>

          {/* Expand/collapse */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded items editor */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completion Criteria</p>
            <p className="text-[10px] text-muted-foreground">
              Each item maps a database field → completion value. The stage is "complete" when all items are done.
            </p>
          </div>

          {stage.items.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg">
              No criteria defined — add one below.
            </div>
          ) : (
            <div className="space-y-1.5">
              {stage.items.map((item, i) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  index={i}
                  total={stage.items.length}
                  onChange={handleItemChange}
                  onRemove={handleItemRemove}
                  onMove={handleItemMove}
                />
              ))}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleAddItem}
            className="h-7 text-xs gap-1.5 mt-1"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Criteria Item
          </Button>

          {stage.updated_at && (
            <p className="text-[10px] text-muted-foreground pt-1">
              Last saved {format(new Date(stage.updated_at), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function PipelineConfigEditor() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();
  const [stages, setStages] = useState<StageConfig[]>([]);
  const [originalStages, setOriginalStages] = useState<StageConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchStages = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pipeline_config')
      .select('*')
      .order('stage_order', { ascending: true });

    if (error) {
      toast({ title: 'Failed to load pipeline config', description: error.message, variant: 'destructive' });
    } else {
      const parsed = (data ?? []).map(row => ({
        ...row,
        items: (row.items as unknown as StageItem[]) ?? [],
        description: row.description ?? null,
      }));
      setStages(parsed);
      setOriginalStages(JSON.parse(JSON.stringify(parsed)));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  const handleChange = (updated: StageConfig) => {
    setStages(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const isDirty = (stage: StageConfig) => {
    const original = originalStages.find(s => s.id === stage.id);
    if (!original) return true;
    return JSON.stringify(stage) !== JSON.stringify(original);
  };

  const handleSave = async (stage: StageConfig) => {
    if (guardDemo()) return;
    if (!session?.user?.id) return;
    setSavingId(stage.id);
    const { error } = await supabase
      .from('pipeline_config')
      .update({
        label: stage.label.trim(),
        full_name: stage.full_name.trim(),
        description: stage.description?.trim() || null,
        items: stage.items as unknown as any,
        is_active: stage.is_active,
        updated_by: session.user.id,
      })
      .eq('id', stage.id);

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      // Refresh to get updated_at from DB
      const { data: fresh } = await supabase
        .from('pipeline_config')
        .select('*')
        .eq('id', stage.id)
        .single();
      if (fresh) {
        const parsed: StageConfig = {
          ...fresh,
          items: (fresh.items as unknown as StageItem[]) ?? [],
          description: fresh.description ?? null,
        };
        setStages(prev => prev.map(s => s.id === stage.id ? parsed : s));
        setOriginalStages(prev => prev.map(s => s.id === stage.id ? JSON.parse(JSON.stringify(parsed)) : s));
      }
      toast({ title: 'Stage saved', description: `"${stage.full_name}" updated successfully.` });
    }
    setSavingId(null);
  };

  const handleResetStage = (stageId: string) => {
    const original = originalStages.find(s => s.id === stageId);
    if (original) {
      setStages(prev => prev.map(s => s.id === stageId ? JSON.parse(JSON.stringify(original)) : s));
    }
  };

  const anyDirty = stages.some(isDirty);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Pipeline Config
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define the completion criteria for each of the 6 onboarding stages. Changes take effect immediately across the Pipeline Dashboard.
          </p>
        </div>
        {anyDirty && (
          <div className="flex items-center gap-1.5 text-xs text-status-progress font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            You have unsaved changes
          </div>
        )}
      </div>

      {/* Stage legend */}
      <div className="flex flex-wrap gap-2 p-3 bg-secondary/50 rounded-xl border border-border">
        <span className="text-xs text-muted-foreground font-medium self-center">Stages:</span>
        {stages.map(s => (
          <span
            key={s.stage_key}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${NODE_COLORS[s.stage_key] ?? 'bg-secondary text-foreground border-border'} ${!s.is_active ? 'opacity-40' : ''}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${NODE_DOT_COLORS[s.stage_key] ?? 'bg-muted-foreground'}`} />
            {s.label} — {s.full_name}
          </span>
        ))}
      </div>

      {/* How-to callout */}
      <div className="flex gap-3 p-3 rounded-xl border border-info/30 bg-info/5">
        <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">How it works:</strong> Each stage has one or more criteria items. A stage turns <span className="text-status-complete font-medium">green (complete)</span> when all items are done, <span className="text-status-progress font-medium">amber (partial)</span> when some are done, and <span className="text-muted-foreground font-medium">gray (not started)</span> otherwise.</p>
          <p>Each item maps a <span className="font-mono bg-secondary px-1 rounded">DB field</span> to a <span className="font-mono bg-secondary px-1 rounded">completion value</span>. Use <span className="font-mono bg-secondary px-1 rounded">present</span> for date fields (any non-null date = done).</p>
          <p>Click any stage card to expand and edit its criteria. Click <strong>Save</strong> per stage to persist changes.</p>
        </div>
      </div>

      {/* Stage cards */}
      <div className="space-y-3">
        {stages.map(stage => (
          <StageCard
            key={stage.id}
            stage={stage}
            dirty={isDirty(stage)}
            saving={savingId === stage.id}
            onSave={handleSave}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Reset all dirty */}
      {anyDirty && (
        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStages(JSON.parse(JSON.stringify(originalStages)))}
            className="text-xs text-muted-foreground gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset all unsaved changes
          </Button>
        </div>
      )}
    </div>
  );
}
