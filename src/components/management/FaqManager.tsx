import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  Search,
  History,
  X,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { useDemoMode } from '@/hooks/useDemoMode';
import DemoLockIcon from '@/components/DemoLockIcon';
import GenerateFaqsFromDocModal from './GenerateFaqsFromDocModal';
import { Sparkles } from 'lucide-react';

type FaqCategory = Database['public']['Enums']['faq_category'];
type FaqAudience = Database['public']['Enums']['faq_audience'];

const AUDIENCE_OPTIONS: { value: FaqAudience; label: string }[] = [
  { value: 'owner_operator', label: 'Owner-Operator' },
  { value: 'staff', label: 'Staff' },
];
const AUDIENCE_LABEL: Record<FaqAudience, string> = {
  owner_operator: 'Owner-Operator',
  staff: 'Staff',
};

const CATEGORY_OPTIONS: { value: FaqCategory; label: string }[] = [
  { value: 'application_process', label: 'Application Process' },
  { value: 'background_screening', label: 'Background Screening' },
  { value: 'documents_requirements', label: 'Documents & Requirements' },
  { value: 'ica_contracts', label: 'ICA Contracts' },
  { value: 'missouri_registration', label: 'Missouri Registration' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'dispatch_operations', label: 'Dispatch & Operations' },
  { value: 'general_owner_operator', label: 'General Owner-Operator' },
];

const CATEGORY_LABEL: Record<FaqCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
) as Record<FaqCategory, string>;

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
  audience: FaqAudience;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  tags: string[];
  last_verified_at: string;
}

interface HistoryEntry {
  id: string;
  faq_id: string;
  question: string;
  answer: string;
  category: string;
  is_published: boolean;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  change_type: string;
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Edited',
  publish: 'Published',
  unpublish: 'Unpublished',
};

const CHANGE_TYPE_COLOR: Record<string, string> = {
  create: 'bg-status-complete/10 text-status-complete border-status-complete/30',
  update: 'bg-primary/10 text-primary border-primary/30',
  publish: 'bg-green-100 text-green-700 border-green-300',
  unpublish: 'bg-amber-100 text-amber-700 border-amber-300',
};

const EMPTY_FORM = {
  question: '',
  answer: '',
  category: 'general_owner_operator' as FaqCategory,
  audience: 'owner_operator' as FaqAudience,
  tags: '' as string,
  sort_order: '' as string,
};

const STALE_DAYS = 90;
const isStale = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  return ms > STALE_DAYS * 24 * 60 * 60 * 1000;
};

export default function FaqManager() {
  const { guardDemo } = useDemoMode();
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<FaqCategory | 'all'>('all');
  const [audienceView, setAudienceView] = useState<FaqAudience>('owner_operator');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FaqRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // History panel
  const [historyFaq, setHistoryFaq] = useState<FaqRow | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // AI generation modal
  const [generateOpen, setGenerateOpen] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);

  // Per-row inline expand for the answer preview
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('faq')
      .select('id, question, answer, category, audience, is_published, sort_order, created_at, tags, last_verified_at')
      .order('sort_order', { ascending: true });
    if (!error) setFaqs((data as FaqRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = faqs.filter(f => {
    if (f.audience !== audienceView) return false;
    const matchSearch = !search ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || f.category === filterCategory;
    const matchAi = !aiOnly || (f.tags ?? []).includes('ai-draft');
    return matchSearch && matchCat && matchAi;
  });

  // ── History helpers ───────────────────────────────────────────────────────
  const loadHistory = async (faq: FaqRow) => {
    setHistoryFaq(faq);
    setHistoryLoading(true);
    const { data } = await (supabase as any)
      .from('faq_history')
      .select('*')
      .eq('faq_id', faq.id)
      .order('changed_at', { ascending: false })
      .limit(20);
    setHistory((data as HistoryEntry[]) ?? []);
    setHistoryLoading(false);
  };

  const writeHistory = async (
    faq: FaqRow,
    changeType: string,
    overrideQuestion?: string,
    overrideAnswer?: string,
    overrideCategory?: string,
    overridePublished?: boolean,
    overrideAudience?: FaqAudience,
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    let name: string | null = null;
    if (user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .single();
      if (prof) name = `${prof.first_name ?? ''} ${prof.last_name ?? ''}`.trim() || null;
    }
    await (supabase.from('faq_history')).insert({
      faq_id: faq.id,
      question: overrideQuestion ?? faq.question,
      answer: overrideAnswer ?? faq.answer,
      category: overrideCategory ?? faq.category,
      audience: overrideAudience ?? faq.audience,
      is_published: overridePublished ?? faq.is_published,
      changed_by: user?.id ?? null,
      changed_by_name: name,
      change_type: changeType,
    });
  };

  // ── Open dialog ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, audience: audienceView });
    setDialogOpen(true);
  };

  const openEdit = (faq: FaqRow) => {
    setEditing(faq);
    setForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      audience: faq.audience,
      tags: (faq.tags ?? []).join(', '),
      sort_order: String(faq.sort_order),
    });
    setDialogOpen(true);
  };

  // ── Save (create or update) ───────────────────────────────────────────────
  const handleSave = async () => {
    if (guardDemo()) return;
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error('Question and answer are required.');
      return;
    }
    setSaving(true);
    const tagsArr = form.tags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    if (editing) {
      const parsedOrder = form.sort_order.trim() === '' ? editing.sort_order : Number(form.sort_order);
      const nextOrder = Number.isFinite(parsedOrder) ? parsedOrder : editing.sort_order;
      const { error } = await supabase
        .from('faq')
        .update({ question: form.question.trim(), answer: form.answer.trim(), category: form.category, audience: form.audience, tags: tagsArr, sort_order: nextOrder })
        .eq('id', editing.id);
      if (error) { toast.error('Failed to update FAQ.'); setSaving(false); return; }
      await writeHistory(editing, 'update', form.question.trim(), form.answer.trim(), form.category, editing.is_published, form.audience);
      toast.success('FAQ updated.');
    } else {
      const maxOrder = faqs.length ? Math.max(...faqs.map(f => f.sort_order)) : -1;
      const parsedOrder = form.sort_order.trim() === '' ? maxOrder + 1 : Number(form.sort_order);
      const nextOrder = Number.isFinite(parsedOrder) ? parsedOrder : maxOrder + 1;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from('faq')
        .insert({
          question: form.question.trim(),
          answer: form.answer.trim(),
          category: form.category,
          audience: form.audience,
          tags: tagsArr,
          is_published: false,
          sort_order: nextOrder,
          created_by: user?.id ?? null,
        })
        .select('id, question, answer, category, audience, is_published, sort_order, created_at, tags, last_verified_at')
        .single();
      if (error || !inserted) { toast.error('Failed to create FAQ.'); setSaving(false); return; }
      await writeHistory(inserted as FaqRow, 'create', form.question.trim(), form.answer.trim(), form.category, false, form.audience);
      toast.success('FAQ created (unpublished).');
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  // ── Toggle publish ────────────────────────────────────────────────────────
  const togglePublish = async (faq: FaqRow) => {
    if (guardDemo()) return;
    const newVal = !faq.is_published;
    const { error } = await supabase
      .from('faq')
      .update({ is_published: newVal })
      .eq('id', faq.id);
    if (error) { toast.error('Failed to update publish status.'); return; }
    await writeHistory(faq, newVal ? 'publish' : 'unpublish', undefined, undefined, undefined, newVal);
    toast.success(faq.is_published ? 'FAQ unpublished.' : 'FAQ published.');
    setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_published: newVal } : f));
  };

  // ── Mark verified (reset staleness) ───────────────────────────────────────
  const markVerified = async (faq: FaqRow) => {
    if (guardDemo()) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('faq')
      .update({ last_verified_at: now })
      .eq('id', faq.id);
    if (error) { toast.error('Failed to mark as verified.'); return; }
    setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, last_verified_at: now } : f));
    toast.success('Marked as verified.');
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (guardDemo()) return;
    setDeleting(true);
    const { error } = await supabase.from('faq').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete FAQ.'); setDeleting(false); return; }
    toast.success('FAQ deleted.');
    setDeleting(false);
    setDeleteTarget(null);
    load();
  };

  const sortedFiltered = [...filtered].sort((a, b) => a.sort_order - b.sort_order);
  const audienceFaqs = faqs.filter(f => f.audience === audienceView);
  const publishedCount = audienceFaqs.filter(f => f.is_published).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-gold shrink-0" />
            FAQ Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {publishedCount} of {audienceFaqs.length} {AUDIENCE_LABEL[audienceView]} entries published
            {audienceView === 'owner_operator'
              ? ' · operators see these in their portal'
              : ' · internal only — never shown to drivers'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setGenerateOpen(true)}
            className="font-semibold border-gold/40 text-foreground hover:bg-gold/10"
          >
            <Sparkles className="h-4 w-4 mr-1.5 text-gold" /> Generate from document
          </Button>
          <Button onClick={openCreate} className="bg-gold hover:bg-gold-light text-surface-dark font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> New FAQ
          </Button>
        </div>
      </div>

      {/* Audience toggle */}
      <div className="inline-flex rounded-lg border border-border bg-white p-1 shadow-sm">
        {AUDIENCE_OPTIONS.map(opt => {
          const active = audienceView === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setAudienceView(opt.value)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                active
                  ? 'bg-gold text-surface-dark shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label} FAQs
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={v => setFilterCategory(v as FaqCategory | 'all')}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setAiOnly(v => !v)}
          className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
            aiOnly
              ? 'bg-gold/10 text-foreground border-gold/40'
              : 'bg-white text-muted-foreground border-border hover:text-foreground'
          }`}
          title="Show only AI-generated drafts"
        >
          <Sparkles className="h-3.5 w-3.5 text-gold" /> AI drafts
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
      ) : sortedFiltered.length === 0 ? (
        <div className="py-16 text-center">
          <HelpCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {search || filterCategory !== 'all' ? 'No FAQs match your filters.' : 'No FAQs yet — create the first one!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFiltered.map((faq, idx) => (
            <div
              key={faq.id}
              className="bg-white border border-border rounded-xl p-4 flex gap-3 items-start shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Reorder arrows */}
              <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                <button
                  onClick={() => moveItem(faq, 'up')}
                  disabled={idx === 0}
                  title="Move up in sort order"
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveItem(faq, 'down')}
                  disabled={idx === sortedFiltered.length - 1}
                  title="Move down in sort order"
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {CATEGORY_LABEL[faq.category] ?? faq.category}
                  </Badge>
                  <Badge
                    className={`text-xs ${faq.is_published ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
                    variant="outline"
                  >
                    {faq.is_published ? 'Published' : 'Draft'}
                  </Badge>
                  {isStale(faq.last_verified_at) && (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Needs review
                    </Badge>
                  )}
                  {(faq.tags ?? []).slice(0, 3).map(t => (
                    <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                      #{t}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm font-semibold text-foreground">{faq.question}</p>
                <p
                  className={`text-xs text-muted-foreground mt-1 whitespace-pre-wrap ${
                    expandedIds.has(faq.id) ? '' : 'line-clamp-2'
                  }`}
                >
                  {faq.answer}
                </p>
                <button
                  type="button"
                  onClick={() => toggleExpanded(faq.id)}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gold hover:text-gold-light transition-colors"
                >
                  {expandedIds.has(faq.id) ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Hide full answer
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show full answer
                    </>
                  )}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => markVerified(faq)}
                  title={`Mark as verified (last: ${format(new Date(faq.last_verified_at), 'MMM d, yyyy')})`}
                  className={`p-2 rounded-lg transition-colors ${
                    isStale(faq.last_verified_at)
                      ? 'text-orange-600 hover:bg-orange-50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => loadHistory(faq)}
                  title="View edit history"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <History className="h-4 w-4" />
                </button>
                <div className="relative inline-flex">
                  <button
                    onClick={() => togglePublish(faq)}
                    title={faq.is_published ? 'Unpublish' : 'Publish'}
                    className={`p-2 rounded-lg transition-colors ${
                      faq.is_published
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {faq.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <DemoLockIcon badge />
                </div>
                <button
                  onClick={() => openEdit(faq)}
                  title="Edit"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <div className="relative inline-flex">
                  <button
                    onClick={() => setDeleteTarget(faq)}
                    title="Delete"
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <DemoLockIcon badge />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit FAQ' : 'New FAQ Entry'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Audience</label>
              <Select
                value={form.audience}
                onValueChange={v => setForm(f => ({ ...f, audience: v as FaqAudience }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.audience === 'staff'
                  ? 'Internal only — never shown to drivers.'
                  : 'Visible to drivers in their portal when published.'}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Category</label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v as FaqCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Question</label>
              <Input
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="e.g. How long does background screening take?"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Answer</label>
              <Textarea
                value={form.answer}
                onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
                placeholder="Write a clear, helpful answer…"
                className="min-h-[120px]"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Tags <span className="text-muted-foreground font-normal">(comma-separated)</span>
              </label>
              <Input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. onboarding, pipeline, dispatch"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Improves search matches in the Staff Help portal.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gold hover:bg-gold-light text-surface-dark font-semibold gap-1.5"
            >
              <DemoLockIcon />
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create FAQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Panel */}
      {historyFaq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end"
          onClick={() => setHistoryFaq(null)}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          <div
            className="relative h-full w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 bg-muted/20">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <History className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="font-semibold text-foreground text-sm">Edit History</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{historyFaq.question}</p>
              </div>
              <button
                onClick={() => setHistoryFaq(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* History list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {historyLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-10">
                  <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No history recorded yet.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">History is tracked from this point forward.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-5">
                    {history.map((entry) => (
                      <div key={entry.id} className="flex gap-4 relative">
                        {/* Dot */}
                        <div className={`h-3.5 w-3.5 rounded-full shrink-0 mt-0.5 border-2 border-background ring-2 ${
                          entry.change_type === 'create' ? 'bg-status-complete ring-status-complete/40' :
                          entry.change_type === 'publish' ? 'bg-green-500 ring-green-200' :
                          entry.change_type === 'unpublish' ? 'bg-amber-500 ring-amber-200' :
                          'bg-primary ring-primary/40'
                        }`} />
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-4 font-semibold ${CHANGE_TYPE_COLOR[entry.change_type] ?? 'bg-muted text-muted-foreground border-border'}`}
                            >
                              {CHANGE_TYPE_LABEL[entry.change_type] ?? entry.change_type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(entry.changed_at), { addSuffix: true })}
                            </span>
                          </div>
                          {entry.changed_by_name && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                              <User className="h-3 w-3 shrink-0" />
                              {entry.changed_by_name}
                            </p>
                          )}
                          {/* Snapshot of content at that point */}
                          <div className="bg-muted/40 rounded-lg p-2.5 border border-border/60 space-y-1.5">
                            <p className="text-xs font-medium text-foreground line-clamp-2">{entry.question}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap">{entry.answer}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                            {format(new Date(entry.changed_at), 'MMM d, yyyy · h:mm a')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.question}" will be permanently removed and hidden from operators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GenerateFaqsFromDocModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        defaultAudience={audienceView}
        onCompleted={load}
      />
    </div>
  );
}
