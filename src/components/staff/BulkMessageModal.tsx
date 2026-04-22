import { useState, useEffect, useMemo, useCallback } from 'react';
import { isEquipmentInstallComplete } from '@/lib/equipmentCompletion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { sanitizeText } from '@/lib/sanitize';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Users, MessageSquare, Send, CheckSquare, Square, Loader2,
  CheckCircle2, X, Filter, ChevronDown, ChevronUp, BookOpen, Plus,
  Trash2, CornerDownLeft, Save,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DispatchStatus = 'not_dispatched' | 'dispatched' | 'home' | 'truck_down';

interface OperatorOption {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  current_stage: string;
  dispatch_status: DispatchStatus | null;
  fully_onboarded: boolean;
}

interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  created_by: string | null;
}

interface BulkMessageModalProps {
  open: boolean;
  onClose: () => void;
  preselectedIds?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  'Stage 1 — Background',
  'Stage 2 — Documents',
  'Stage 3 — ICA',
  'Stage 4 — MO Registration',
  'Stage 5 — Equipment',
  'Stage 6 — Insurance',
];

const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  not_dispatched: 'Not Dispatched',
  dispatched: 'Dispatched',
  home: 'Home',
  truck_down: 'Truck Down',
};

const DISPATCH_DOT: Record<DispatchStatus, string> = {
  not_dispatched: 'bg-muted-foreground',
  dispatched:     'bg-status-complete',
  home:           'bg-status-progress',
  truck_down:     'bg-destructive',
};

function computeStage(os: Record<string, string | boolean | null>): string {
  if (os.insurance_added_date)                                                      return 'Stage 6 — Insurance';
  if (isEquipmentInstallComplete(os as any)) return 'Stage 5 — Equipment';
  if (os.ica_status === 'complete')                                                  return 'Stage 4 — MO Registration';
  if (os.ica_status === 'in_progress' || os.ica_status === 'sent_for_signature')       return 'Stage 3 — ICA';
  if (os.mvr_ch_approval === 'approved')                                             return 'Stage 2 — Documents';
  return 'Stage 1 — Background';
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Template Save Form ───────────────────────────────────────────────────────

function SaveTemplateInline({
  defaultTitle,
  onSave,
  onCancel,
}: {
  defaultTitle: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  return (
    <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-border animate-fade-in">
      <Input
        autoFocus
        placeholder="Template name…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="h-7 text-xs flex-1"
        maxLength={60}
        onKeyDown={e => {
          if (e.key === 'Enter' && title.trim()) onSave(title.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Button
        size="sm"
        className="h-7 px-2.5 text-xs gap-1.5"
        disabled={!title.trim()}
        onClick={() => onSave(title.trim())}
      >
        <Save className="h-3 w-3" />
        Save
      </Button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Templates Panel ──────────────────────────────────────────────────────────

function TemplatesPanel({
  templates,
  onInsert,
  onDelete,
  currentUserId,
  isManagement,
  loading,
}: {
  templates: MessageTemplate[];
  onInsert: (body: string) => void;
  onDelete: (id: string) => void;
  currentUserId: string | undefined;
  isManagement: boolean;
  loading: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic text-center py-3">
        No templates yet. Save a message to reuse it later.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
      {templates.map(t => {
        // System templates (created_by=null) can only be deleted by management
        // Own templates can always be deleted by their creator
        const canDelete = t.created_by === currentUserId || (t.created_by === null && isManagement);
        const isConfirming = confirmDelete === t.id;
        return (
          <div
            key={t.id}
            className="group flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border transition-all"
          >
            {/* Insert button — main clickable area */}
            <button
              className="flex-1 min-w-0 text-left px-3 py-2.5 gap-1"
              onClick={() => onInsert(t.body)}
              title="Click to insert"
            >
              <div className="flex items-center gap-1.5">
                <CornerDownLeft className="h-3 w-3 text-muted-foreground/60 shrink-0 group-hover:text-primary transition-colors" />
                <p className="text-xs font-semibold text-foreground truncate">{t.title}</p>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 ml-4.5">
                {t.body}
              </p>
            </button>

            {/* Delete control — only shown for own or system (null) templates */}
            {canDelete && (
              <div className="shrink-0 flex items-center self-center pr-2">
                {isConfirming ? (
                  <div className="flex items-center gap-1 animate-fade-in">
                    <button
                      className="text-[10px] text-destructive font-semibold hover:underline"
                      onClick={() => { onDelete(t.id); setConfirmDelete(null); }}
                    >
                      Delete
                    </button>
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(t.id)}
                    title="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulkMessageModal({ open, onClose, preselectedIds = [] }: BulkMessageModalProps) {
  const { user, profile, isManagement } = useAuth();
  const { toast } = useToast();

  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [dispatchFilter, setDispatchFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Compose
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'select' | 'compose'>('select');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(true);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── Load operators ─────────────────────────────────────────────────────────
  const loadOperators = useCallback(async () => {
    setLoading(true);
    const { data: ops } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        onboarding_status (
          mvr_ch_approval,
          pe_screening_result,
          ica_status,
          decal_applied,
          eld_installed,
          fuel_card_issued,
          insurance_added_date,
          fully_onboarded
        )
      `);

    if (!ops || ops.length === 0) { setLoading(false); return; }

    const userIds = (ops as any[]).map((o: any) => o.user_id).filter(Boolean);
    const operatorIds = (ops as any[]).map((o: any) => o.id).filter(Boolean);

    const [{ data: profiles }, { data: dispatch }] = await Promise.all([
      supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', userIds),
      supabase.from('active_dispatch').select('operator_id, dispatch_status').in('operator_id', operatorIds),
    ]);

    const profileMap: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });

    const dispatchMap: Record<string, DispatchStatus> = {};
    (dispatch ?? []).forEach((d: any) => { dispatchMap[d.operator_id] = d.dispatch_status; });

    const rows: OperatorOption[] = (ops as any[]).map((op: any) => {
      const osRaw = op.onboarding_status;
      const os = Array.isArray(osRaw) ? (osRaw[0] ?? {}) : (osRaw ?? {});
      const p = profileMap[op.user_id] ?? {};
      return {
        id: op.id,
        user_id: op.user_id,
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
        current_stage: computeStage(os),
        dispatch_status: dispatchMap[op.id] ?? null,
        fully_onboarded: os.fully_onboarded ?? false,
      };
    });

    rows.sort((a, b) => {
      const na = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
      const nb = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
      return na.localeCompare(nb);
    });

    setOperators(rows);
    setLoading(false);
  }, []);

  // ── Load templates ─────────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    const { data, error } = await supabase
      .from('message_templates')
      .select('id, title, body, created_by')
      .order('created_at', { ascending: true });
    if (!error && data) setTemplates(data as MessageTemplate[]);
    setTemplatesLoading(false);
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      loadOperators();
      loadTemplates();
      setStep('select');
      setMessage('');
      setSentCount(null);
      setSearch('');
      setStageFilter('all');
      setDispatchFilter('all');
      setShowSaveForm(false);
    }
  }, [open, loadOperators, loadTemplates]);

  useEffect(() => {
    if (operators.length > 0 && preselectedIds.length > 0) {
      setSelectedIds(new Set(preselectedIds));
    }
  }, [operators, preselectedIds]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return operators.filter(op => {
      const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim();
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
      if (stageFilter !== 'all' && op.current_stage !== stageFilter) return false;
      if (dispatchFilter !== 'all') {
        if (dispatchFilter === 'none' && op.dispatch_status !== null) return false;
        if (dispatchFilter !== 'none' && op.dispatch_status !== dispatchFilter) return false;
      }
      return true;
    });
  }, [operators, search, stageFilter, dispatchFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(op => selectedIds.has(op.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(op => n.delete(op.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(op => n.add(op.id)); return n; });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectedOperators = useMemo(
    () => operators.filter(op => selectedIds.has(op.id)),
    [operators, selectedIds]
  );

  // ── Template actions ──────────────────────────────────────────────────────
  const handleInsertTemplate = (body: string) => {
    setMessage(body);
    // briefly flash the textarea by scrolling to top (UX cue)
  };

  const handleSaveTemplate = async (title: string) => {
    if (!user?.id || !message.trim()) return;
    setSavingTemplate(true);
    const body = sanitizeText(message.trim());
    const { error } = await supabase.from('message_templates').insert({
      title: sanitizeText(title),
      body,
      created_by: user.id,
    });
    setSavingTemplate(false);
    setShowSaveForm(false);
    if (error) {
      toast({ title: 'Could not save template', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Template saved', description: `"${title}" added to your template library.` });
      loadTemplates();
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('message_templates').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete template', variant: 'destructive' });
    } else {
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!user?.id || !message.trim() || selectedOperators.length === 0) return;
    setSending(true);

    const body = sanitizeText(message.trim());
    if (!body) { setSending(false); return; }

    const senderName = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Your coordinator'
      : 'Your coordinator';

    const sends = selectedOperators.map(async (op) => {
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        recipient_id: op.user_id,
        body,
      });
      if (error) return false;

      supabase.functions.invoke('send-notification', {
        body: {
          type: 'new_message',
          recipient_user_id: op.user_id,
          sender_name: senderName,
          message_preview: body,
        },
      }).catch(() => {});

      return true;
    });

    const results = await Promise.all(sends);
    const successCount = results.filter(Boolean).length;
    const failCount = results.length - successCount;

    setSending(false);
    setSentCount(successCount);

    if (failCount > 0) {
      toast({
        title: `${successCount} messages sent`,
        description: `${failCount} failed to send.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: `Message sent to ${successCount} operator${successCount !== 1 ? 's' : ''}`,
        description: 'All recipients will receive an in-app notification.',
      });
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setMessage('');
    setStep('select');
    setSentCount(null);
    setShowSaveForm(false);
    onClose();
  };

  const activeFilterCount = [stageFilter !== 'all', dispatchFilter !== 'all'].filter(Boolean).length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="max-w-2xl w-full p-0 overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(92vh, 760px)' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MessageSquare className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">Bulk Message</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Select operators, then compose and send a message to all at once
              </DialogDescription>
            </div>
            {/* Step pills */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-status-complete/15 text-status-complete'
              }`}>
                {step !== 'select' && <CheckCircle2 className="h-3 w-3" />}
                1 · Select
              </span>
              <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                step === 'compose' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                2 · Compose
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* ── Step 1: Operator Selection ───────────────────────────────────── */}
        {step === 'select' && (
          <>
            <div className="px-5 py-3 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1.5 text-xs shrink-0 ${activeFilterCount > 0 ? 'border-primary/40 text-primary bg-primary/5' : ''}`}
                  onClick={() => setFiltersOpen(v => !v)}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                  {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>

              {filtersOpen && (
                <div className="flex flex-wrap gap-2 pt-1 animate-fade-in">
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[160px]">
                      <SelectValue placeholder="Onboarding Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={dispatchFilter} onValueChange={setDispatchFilter}>
                    <SelectTrigger className="h-8 text-xs w-auto min-w-[160px]">
                      <SelectValue placeholder="Dispatch Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dispatch Statuses</SelectItem>
                      <SelectItem value="none">Not Active (No Status)</SelectItem>
                      {(Object.keys(DISPATCH_LABELS) as DispatchStatus[]).map(s => (
                        <SelectItem key={s} value={s}>{DISPATCH_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                      onClick={() => { setStageFilter('all'); setDispatchFilter('all'); }}>
                      <X className="h-3 w-3 mr-1" />Clear filters
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {allFilteredSelected
                    ? <CheckSquare className="h-4 w-4 text-primary" />
                    : <Square className="h-4 w-4" />}
                  {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
                </button>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} operator{filtered.length !== 1 ? 's' : ''}
                  {search || activeFilterCount > 0 ? ' matched' : ' total'}
                  {selectedIds.size > 0 && (
                    <span className="ml-2 font-semibold text-primary">· {selectedIds.size} selected</span>
                  )}
                </span>
              </div>
            </div>

            {/* Operator list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No operators match your filters</p>
                </div>
              ) : (
                filtered.map(op => {
                  const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() || 'Unknown';
                  const checked = selectedIds.has(op.id);
                  return (
                    <label key={op.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${checked ? 'bg-primary/5' : ''}`}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleOne(op.id)} className="shrink-0" />
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border ${
                        checked ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground'
                      }`}>
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate leading-tight ${checked ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>{name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{op.current_stage}</p>
                      </div>
                      {op.dispatch_status && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`h-1.5 w-1.5 rounded-full ${DISPATCH_DOT[op.dispatch_status]}`} />
                          <span className="text-[11px] text-muted-foreground">{DISPATCH_LABELS[op.dispatch_status]}</span>
                        </div>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" onClick={handleClose} className="text-xs">Cancel</Button>
              <Button size="sm" disabled={selectedIds.size === 0} onClick={() => setStep('compose')} className="text-xs gap-2">
                Next: Compose
                <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary-foreground/20 text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {selectedIds.size}
                </span>
              </Button>
            </div>
          </>
        )}

        {/* ── Step 2: Compose ──────────────────────────────────────────────── */}
        {step === 'compose' && (
          <>
            {/* Recipient summary */}
            <div className="px-5 py-3 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium shrink-0">To:</span>
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {selectedOperators.slice(0, 8).map(op => {
                    const name = `${op.first_name ?? ''} ${op.last_name ?? ''}`.trim() || 'Unknown';
                    return (
                      <Badge key={op.id} variant="secondary" className="text-[11px] px-2 py-0.5 h-auto gap-1 font-normal">
                        {name}
                        <button onClick={() => toggleOne(op.id)} className="ml-0.5 hover:text-destructive transition-colors">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                  {selectedOperators.length > 8 && (
                    <Badge variant="secondary" className="text-[11px] px-2 py-0.5 h-auto font-semibold text-primary">
                      +{selectedOperators.length - 8} more
                    </Badge>
                  )}
                </div>
                <button onClick={() => setStep('select')} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline shrink-0">
                  Edit
                </button>
              </div>
            </div>

            {sentCount === null ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                {/* ── Templates panel ────────────────────────────────────── */}
                <div className="px-5 pt-4 pb-0 shrink-0">
                  <button
                    className="flex items-center gap-2 w-full text-left group mb-2"
                    onClick={() => setTemplatesOpen(v => !v)}
                  >
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                      Templates
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 ml-1">
                      ({templates.length})
                    </span>
                    <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
                      {templatesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  </button>

                  {templatesOpen && (
                    <div className="mb-3 animate-fade-in">
                      <TemplatesPanel
                        templates={templates}
                        onInsert={handleInsertTemplate}
                        onDelete={handleDeleteTemplate}
                        currentUserId={user?.id}
                        isManagement={isManagement}
                        loading={templatesLoading}
                      />
                    </div>
                  )}

                  <div className="border-t border-border/60 mb-0" />
                </div>

                {/* ── Compose area ───────────────────────────────────────── */}
                <div className="flex-1 flex flex-col px-5 pt-3 pb-5 gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground/70">Message</label>
                    {/* Save as template */}
                    {!showSaveForm && message.trim().length > 10 && (
                      <button
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => setShowSaveForm(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Save as template
                      </button>
                    )}
                  </div>

                  {showSaveForm && (
                    <SaveTemplateInline
                      defaultTitle=""
                      onSave={handleSaveTemplate}
                      onCancel={() => setShowSaveForm(false)}
                    />
                  )}

                  <Textarea
                    placeholder="Type your message to all selected operators…"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="flex-1 resize-none min-h-[140px] text-sm leading-relaxed"
                    maxLength={2000}
                    autoFocus={!templatesOpen}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Each operator receives this as an individual message in their inbox.
                    </p>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {message.length}/2000
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Success state */
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="h-14 w-14 rounded-full bg-status-complete/15 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-status-complete" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Messages sent!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your message was delivered to <strong>{sentCount}</strong> operator{sentCount !== 1 ? 's' : ''}.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleClose} className="text-xs mt-2">Close</Button>
              </div>
            )}

            {/* Footer */}
            {sentCount === null && (
              <div className="px-5 py-4 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={() => setStep('select')} className="text-xs" disabled={sending}>
                  ← Back
                </Button>
                <Button
                  size="sm"
                  disabled={!message.trim() || sending}
                  onClick={handleSend}
                  className="text-xs gap-2"
                >
                  {sending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" />Send to {selectedIds.size} operator{selectedIds.size !== 1 ? 's' : ''}</>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
