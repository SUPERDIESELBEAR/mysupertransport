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
} from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

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

const EMPTY_FORM = { question: '', answer: '', category: 'general_owner_operator' as FaqCategory };

export default function FaqManager() {
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
      toast.success('FAQ updated.');
    } else {
      const maxOrder = faqs.length ? Math.max(...faqs.map(f => f.sort_order)) : -1;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('faq')
        .insert({
          question: form.question.trim(),
          answer: form.answer.trim(),
          category: form.category,
          is_published: false,
          sort_order: maxOrder + 1,
          created_by: user?.id ?? null,
        });
      if (error) { toast.error('Failed to create FAQ.'); setSaving(false); return; }
      toast.success('FAQ created (unpublished).');
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  // ── Toggle publish ────────────────────────────────────────────────────────
  const togglePublish = async (faq: FaqRow) => {
    const { error } = await supabase
      .from('faq')
      .update({ is_published: !faq.is_published })
      .eq('id', faq.id);
    if (error) { toast.error('Failed to update publish status.'); return; }
    toast.success(faq.is_published ? 'FAQ unpublished.' : 'FAQ published.');
    setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_published: !f.is_published } : f));
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
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
                  <Badge
                    variant="secondary"
                    className="text-xs"
                  >
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
              className="bg-gold hover:bg-gold-light text-surface-dark font-semibold"
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create FAQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
