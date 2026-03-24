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
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { useDemoMode } from '@/hooks/useDemoMode';
import DemoLockIcon from '@/components/DemoLockIcon';

type FaqCategory = Database['public']['Enums']['faq_category'];

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
  is_published: boolean;
  sort_order: number;
  created_at: string;
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

const EMPTY_FORM = { question: '', answer: '', category: 'general_owner_operator' as FaqCategory };

export default function FaqManager() {
  const { guardDemo } = useDemoMode();
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<FaqCategory | 'all'>('all');

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

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('faq')
      .select('id, question, answer, category, is_published, sort_order, created_at')
      .order('sort_order', { ascending: true });
    if (!error) setFaqs((data as FaqRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = faqs.filter(f => {
    const matchSearch = !search ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || f.category === filterCategory;
    return matchSearch && matchCat;
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
    await (supabase.from('faq_history' as any)).insert({
      faq_id: faq.id,
      question: overrideQuestion ?? faq.question,
      answer: overrideAnswer ?? faq.answer,
      category: overrideCategory ?? faq.category,
      is_published: overridePublished ?? faq.is_published,
      changed_by: user?.id ?? null,
      changed_by_name: name,
      change_type: changeType,
    });
  };

  // ── Open dialog ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (faq: FaqRow) => {
    setEditing(faq);
    setForm({ question: faq.question, answer: faq.answer, category: faq.category });
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
    if (editing) {
      const { error } = await supabase
        .from('faq')
        .update({ question: form.question.trim(), answer: form.answer.trim(), category: form.category })
        .eq('id', editing.id);
      if (error) { toast.error('Failed to update FAQ.'); setSaving(false); return; }
      await writeHistory(editing, 'update', form.question.trim(), form.answer.trim(), form.category, editing.is_published);
      toast.success('FAQ updated.');
    } else {
      const maxOrder = faqs.length ? Math.max(...faqs.map(f => f.sort_order)) : -1;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from('faq')
        .insert({
          question: form.question.trim(),
          answer: form.answer.trim(),
          category: form.category,
          is_published: false,
          sort_order: maxOrder + 1,
          created_by: user?.id ?? null,
        })
        .select('id, question, answer, category, is_published, sort_order, created_at')
        .single();
      if (error || !inserted) { toast.error('Failed to create FAQ.'); setSaving(false); return; }
      await writeHistory(inserted as FaqRow, 'create', form.question.trim(), form.answer.trim(), form.category, false);
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

  // ── Reorder ───────────────────────────────────────────────────────────────
  const moveItem = async (faq: FaqRow, direction: 'up' | 'down') => {
    if (guardDemo()) return;
    const sortedAll = [...faqs].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sortedAll.findIndex(f => f.id === faq.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedAll.length) return;

    const swapTarget = sortedAll[swapIdx];
    const newOrderA = swapTarget.sort_order;
    const newOrderB = faq.sort_order;

    const [r1, r2] = await Promise.all([
      supabase.from('faq').update({ sort_order: newOrderA }).eq('id', faq.id),
      supabase.from('faq').update({ sort_order: newOrderB }).eq('id', swapTarget.id),
    ]);
    if (r1.error || r2.error) { toast.error('Failed to reorder.'); return; }
    setFaqs(prev => prev.map(f => {
      if (f.id === faq.id) return { ...f, sort_order: newOrderA };
      if (f.id === swapTarget.id) return { ...f, sort_order: newOrderB };
      return f;
    }));
  };

  const sortedFiltered = [...filtered].sort((a, b) => a.sort_order - b.sort_order);
  const publishedCount = faqs.filter(f => f.is_published).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">FAQ Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {publishedCount} of {faqs.length} entries published · operators see these in their portal
          </p>
        </div>
        <Button onClick={openCreate} className="bg-gold hover:bg-gold-light text-surface-dark font-semibold shrink-0">
          <Plus className="h-4 w-4 mr-1.5" /> New FAQ
        </Button>
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
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveItem(faq, 'down')}
                  disabled={idx === sortedFiltered.length - 1}
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
                </div>
                <p className="text-sm font-semibold text-foreground">{faq.question}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{faq.answer}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => loadHistory(faq)}
                  title="View edit history"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <History className="h-4 w-4" />
                </button>
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
                <button
                  onClick={() => openEdit(faq)}
                  title="Edit"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(faq)}
                  title="Delete"
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
    </div>
  );
}
