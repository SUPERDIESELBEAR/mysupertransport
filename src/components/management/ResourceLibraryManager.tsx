import { useState, useEffect, useRef } from 'react';
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
  BookOpen,
  Search,
  Upload,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type ResourceCategory = Database['public']['Enums']['resource_category'];

const CATEGORY_OPTIONS: { value: ResourceCategory; label: string; emoji: string }[] = [
  { value: 'user_manuals', label: 'User Manuals', emoji: '📖' },
  { value: 'decal_files', label: 'Decal Files', emoji: '🏷️' },
  { value: 'forms_compliance', label: 'Forms & Compliance', emoji: '📋' },
  { value: 'dot_general', label: 'DOT General', emoji: '🚛' },
];

const CATEGORY_LABEL: Record<ResourceCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, `${o.emoji} ${o.label}`])
) as Record<ResourceCategory, string>;

interface ResourceRow {
  id: string;
  title: string;
  description: string | null;
  category: ResourceCategory;
  file_url: string | null;
  file_name: string | null;
  is_visible: boolean;
  sort_order: number;
  uploaded_at: string;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'forms_compliance' as ResourceCategory,
};

export default function ResourceLibraryManager() {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<ResourceCategory | 'all'>('all');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ResourceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('resource_documents')
      .select('id, title, description, category, file_url, file_name, is_visible, sort_order, uploaded_at')
      .order('sort_order', { ascending: true });
    if (!error) setResources((data as ResourceRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = resources.filter(r => {
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || r.category === filterCategory;
    return matchSearch && matchCat;
  });

  const sorted = [...filtered].sort((a, b) => a.sort_order - b.sort_order);

  // ── Open dialog ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setDialogOpen(true);
  };

  const openEdit = (r: ResourceRow) => {
    setEditing(r);
    setForm({ title: r.title, description: r.description ?? '', category: r.category });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  // ── File upload helper ────────────────────────────────────────────────────
  const uploadFile = async (file: File): Promise<{ url: string; name: string } | null> => {
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    setUploading(true);
    const { error } = await supabase.storage.from('resource-library').upload(path, file, { upsert: false });
    setUploading(false);
    if (error) {
      toast.error('File upload failed: ' + error.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from('resource-library').getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name };
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (!editing && !selectedFile) {
      toast.error('Please select a file to upload.');
      return;
    }
    setSaving(true);

    let fileUrl: string | null = editing?.file_url ?? null;
    let fileName: string | null = editing?.file_name ?? null;

    if (selectedFile) {
      const result = await uploadFile(selectedFile);
      if (!result) { setSaving(false); return; }
      fileUrl = result.url;
      fileName = result.name;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (editing) {
      const { error } = await supabase
        .from('resource_documents')
        .update({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          ...(selectedFile ? { file_url: fileUrl, file_name: fileName } : {}),
        })
        .eq('id', editing.id);
      if (error) { toast.error('Failed to update resource.'); setSaving(false); return; }
      toast.success('Resource updated.');
    } else {
      const maxOrder = resources.length ? Math.max(...resources.map(r => r.sort_order)) : -1;
      const { error } = await supabase
        .from('resource_documents')
        .insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          file_url: fileUrl,
          file_name: fileName,
          is_visible: false,
          sort_order: maxOrder + 1,
          uploaded_by: user?.id ?? null,
        });
      if (error) { toast.error('Failed to create resource.'); setSaving(false); return; }
      toast.success('Resource created (hidden). Toggle visibility to show operators.');
    }

    setSaving(false);
    setDialogOpen(false);
    load();
  };

  // ── Toggle visibility ─────────────────────────────────────────────────────
  const toggleVisibility = async (r: ResourceRow) => {
    const { error } = await supabase
      .from('resource_documents')
      .update({ is_visible: !r.is_visible })
      .eq('id', r.id);
    if (error) { toast.error('Failed to update visibility.'); return; }
    toast.success(r.is_visible ? 'Resource hidden from operators.' : 'Resource now visible to operators.');
    setResources(prev => prev.map(x => x.id === r.id ? { ...x, is_visible: !x.is_visible } : x));
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('resource_documents').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete resource.'); setDeleting(false); return; }
    toast.success('Resource deleted.');
    setDeleting(false);
    setDeleteTarget(null);
    load();
  };

  // ── Reorder ───────────────────────────────────────────────────────────────
  const moveItem = async (r: ResourceRow, direction: 'up' | 'down') => {
    const sortedAll = [...resources].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sortedAll.findIndex(x => x.id === r.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedAll.length) return;

    const swapTarget = sortedAll[swapIdx];
    const newOrderA = swapTarget.sort_order;
    const newOrderB = r.sort_order;

    const [r1, r2] = await Promise.all([
      supabase.from('resource_documents').update({ sort_order: newOrderA }).eq('id', r.id),
      supabase.from('resource_documents').update({ sort_order: newOrderB }).eq('id', swapTarget.id),
    ]);
    if (r1.error || r2.error) { toast.error('Failed to reorder.'); return; }
    setResources(prev => prev.map(x => {
      if (x.id === r.id) return { ...x, sort_order: newOrderA };
      if (x.id === swapTarget.id) return { ...x, sort_order: newOrderB };
      return x;
    }));
  };

  const visibleCount = resources.filter(r => r.is_visible).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resource Library Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {visibleCount} of {resources.length} documents visible to operators
          </p>
        </div>
        <Button onClick={openCreate} className="bg-gold hover:bg-gold-light text-surface-dark font-semibold shrink-0">
          <Plus className="h-4 w-4 mr-1.5" /> Upload Resource
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resources…"
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={v => setFilterCategory(v as ResourceCategory | 'all')}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.emoji} {o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {search || filterCategory !== 'all' ? 'No resources match your filters.' : 'No resources yet — upload the first one!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((r, idx) => (
            <div
              key={r.id}
              className="bg-white border border-border rounded-xl p-4 flex gap-3 items-start shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Reorder arrows */}
              <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                <button
                  onClick={() => moveItem(r, 'up')}
                  disabled={idx === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveItem(r, 'down')}
                  disabled={idx === sorted.length - 1}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* File icon */}
              <div className="h-9 w-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-gold" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {CATEGORY_LABEL[r.category] ?? r.category}
                  </Badge>
                  <Badge
                    className={`text-xs ${r.is_visible ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
                    variant="outline"
                  >
                    {r.is_visible ? 'Visible' : 'Hidden'}
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-foreground">{r.title}</p>
                {r.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</p>
                )}
                {r.file_name && (
                  <p className="text-xs text-muted-foreground/60 mt-1 font-mono truncate">{r.file_name}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {r.file_url && (
                  <a
                    href={r.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Preview file"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => toggleVisibility(r)}
                  title={r.is_visible ? 'Hide from operators' : 'Show to operators'}
                  className={`p-2 rounded-lg transition-colors ${
                    r.is_visible
                      ? 'text-green-600 hover:bg-green-50'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {r.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => openEdit(r)}
                  title="Edit"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(r)}
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
      <Dialog open={dialogOpen} onOpenChange={open => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Resource' : 'Upload New Resource'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Category */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Category</label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v as ResourceCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.emoji} {o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Title</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. ELD Quick Start Guide"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description shown under the title…"
                className="min-h-[80px]"
              />
            </div>

            {/* File upload */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {editing ? 'Replace File' : 'File'}{editing && <span className="font-normal text-muted-foreground"> (leave blank to keep existing)</span>}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-gold/40 hover:bg-gold/5 transition-colors"
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                    <FileText className="h-4 w-4 text-gold" />
                    <span className="font-medium truncate max-w-[280px]">{selectedFile.name}</span>
                    <span className="text-muted-foreground text-xs">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : editing?.file_name ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Current: <span className="font-mono">{editing.file_name}</span></p>
                    <p className="text-xs text-gold font-medium flex items-center justify-center gap-1">
                      <Upload className="h-3.5 w-3.5" /> Click to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Click to choose a file</p>
                    <p className="text-xs text-muted-foreground/60">PDF, DOCX, XLSX, images, etc.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving || uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || uploading}
              className="bg-gold hover:bg-gold-light text-surface-dark font-semibold"
            >
              {uploading ? 'Uploading…' : saving ? 'Saving…' : editing ? 'Save Changes' : 'Upload Resource'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resource?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently removed from the operator resource library.
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
