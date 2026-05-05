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
  History,
  X,
  Clock,
  User,
  ScanEye,
  Mail,
  Send,
  Loader2,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { useDemoMode } from '@/hooks/useDemoMode';
import DemoLockIcon from '@/components/DemoLockIcon';
import { FilePreviewModal } from '@/components/inspection/DocRow';

type ResourceCategory = Database['public']['Enums']['resource_category'];

const CATEGORY_OPTIONS: { value: ResourceCategory; label: string; emoji: string }[] = [
  { value: 'user_manuals', label: 'User Manuals', emoji: '📖' },
  { value: 'decal_files', label: 'Decal Files', emoji: '🏷️' },
  { value: 'forms_compliance', label: 'Forms & Compliance', emoji: '📋' },
  { value: 'dot_general', label: 'DOT General', emoji: '🚛' },
  { value: 'payroll', label: 'Payroll', emoji: '💰' },
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

interface HistoryEntry {
  id: string;
  resource_id: string;
  title: string;
  description: string | null;
  category: string;
  file_name: string | null;
  is_visible: boolean;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  change_type: string;
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  create: 'Uploaded',
  update: 'Edited',
  visibility: 'Visibility changed',
};

const CHANGE_TYPE_COLOR: Record<string, string> = {
  create: 'bg-status-complete/10 text-status-complete border-status-complete/30',
  update: 'bg-primary/10 text-primary border-primary/30',
  visibility: 'bg-amber-100 text-amber-700 border-amber-300',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'forms_compliance' as ResourceCategory,
};

export default function ResourceLibraryManager() {
  const { guardDemo } = useDemoMode();
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
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

  // History panel
  const [historyResource, setHistoryResource] = useState<ResourceRow | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Email dialog
  const [emailResource, setEmailResource] = useState<ResourceRow | null>(null);
  const [emailMode, setEmailMode] = useState<'operator' | 'custom'>('operator');
  const [emailOperatorId, setEmailOperatorId] = useState('');
  const [emailCustomAddress, setEmailCustomAddress] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [operators, setOperators] = useState<{ id: string; name: string; email: string }[]>([]);
  const [operatorsLoaded, setOperatorsLoaded] = useState(false);

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

  // ── Load operators for email dialog ───────────────────────────────────────
  const loadOperators = async () => {
    if (operatorsLoaded) return;
    const { data } = await supabase
      .from('operators')
      .select('id, user_id, application_id, applications!operators_application_id_fkey(first_name, last_name, email)')
      .eq('is_active', true);
    if (data) {
      const ops = data
        .map((o: any) => {
          const app = o.applications;
          if (!app?.email) return null;
          const name = `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || app.email;
          return { id: o.id, name, email: app.email as string };
        })
        .filter(Boolean) as { id: string; name: string; email: string }[];
      ops.sort((a, b) => a.name.localeCompare(b.name));
      setOperators(ops);
    }
    setOperatorsLoaded(true);
  };

  const openEmailDialog = (r: ResourceRow) => {
    setEmailResource(r);
    setEmailMode('operator');
    setEmailOperatorId('');
    setEmailCustomAddress('');
    setEmailNote('');
    loadOperators();
  };

  const handleSendEmail = async () => {
    if (guardDemo()) return;
    const recipientEmail = emailMode === 'operator'
      ? operators.find(o => o.id === emailOperatorId)?.email
      : emailCustomAddress.trim();
    const recipientName = emailMode === 'operator'
      ? operators.find(o => o.id === emailOperatorId)?.name
      : undefined;

    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!emailResource?.file_url) {
      toast.error('This resource has no file attached.');
      return;
    }

    setEmailSending(true);
    const { error } = await supabase.functions.invoke('send-resource-email', {
      body: {
        resourceTitle: emailResource.title,
        resourceUrl: emailResource.file_url,
        recipientEmail,
        recipientName,
        senderNote: emailNote.trim() || undefined,
      },
    });
    setEmailSending(false);

    if (error) {
      toast.error('Failed to send email: ' + error.message);
      return;
    }
    toast.success(`Email sent to ${recipientEmail}`);
    setEmailResource(null);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = resources.filter(r => {
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || r.category === filterCategory;
    return matchSearch && matchCat;
  });

  const sorted = [...filtered].sort((a, b) => a.sort_order - b.sort_order);

  // ── History helpers ───────────────────────────────────────────────────────
  const loadHistory = async (resource: ResourceRow) => {
    setHistoryResource(resource);
    setHistoryLoading(true);
    const { data } = await (supabase as any)
      .from('resource_history')
      .select('*')
      .eq('resource_id', resource.id)
      .order('changed_at', { ascending: false })
      .limit(20);
    setHistory((data as HistoryEntry[]) ?? []);
    setHistoryLoading(false);
  };

  const writeHistory = async (resource: ResourceRow, changeType: string, overrides?: Partial<ResourceRow>) => {
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
    await (supabase as any).from('resource_history').insert({
      resource_id: resource.id,
      title: overrides?.title ?? resource.title,
      description: overrides?.description ?? resource.description,
      category: overrides?.category ?? resource.category,
      file_name: overrides?.file_name ?? resource.file_name,
      is_visible: overrides?.is_visible ?? resource.is_visible,
      changed_by: user?.id ?? null,
      changed_by_name: name,
      change_type: changeType,
    });
  };

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
    if (guardDemo()) return;
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
      await writeHistory(editing, 'update', {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        file_name: fileName,
      });
      toast.success('Resource updated.');
    } else {
      const maxOrder = resources.length ? Math.max(...resources.map(r => r.sort_order)) : -1;
      const { data: inserted, error } = await supabase
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
        })
        .select('id, title, description, category, file_url, file_name, is_visible, sort_order, uploaded_at')
        .single();
      if (error || !inserted) { toast.error('Failed to create resource.'); setSaving(false); return; }
      await writeHistory(inserted as ResourceRow, 'create', {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        file_name: fileName,
        is_visible: false,
      });
      toast.success('Resource created (hidden). Toggle visibility to show operators.');
    }

    setSaving(false);
    setDialogOpen(false);
    load();
  };

  // ── Toggle visibility ─────────────────────────────────────────────────────
  const toggleVisibility = async (r: ResourceRow) => {
    if (guardDemo()) return;
    const newVal = !r.is_visible;
    const { error } = await supabase
      .from('resource_documents')
      .update({ is_visible: newVal })
      .eq('id', r.id);
    if (error) { toast.error('Failed to update visibility.'); return; }
    await writeHistory(r, 'visibility', { is_visible: newVal });
    toast.success(r.is_visible ? 'Resource hidden from operators.' : 'Resource now visible to operators.');
    setResources(prev => prev.map(x => x.id === r.id ? { ...x, is_visible: newVal } : x));
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (guardDemo()) return;
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
    if (guardDemo()) return;
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
                  <>
                    <button
                      onClick={() => { setPreviewUrl(r.file_url); setPreviewTitle(r.title); }}
                      title="Preview file"
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <ScanEye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEmailDialog(r)}
                      title="Send by email"
                      className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => loadHistory(r)}
                  title="View edit history"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <History className="h-4 w-4" />
                </button>
                <div className="relative inline-flex">
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
                  <DemoLockIcon badge />
                </div>
                <button
                  onClick={() => openEdit(r)}
                  title="Edit"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <div className="relative inline-flex">
                  <button
                    onClick={() => setDeleteTarget(r)}
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

      {previewUrl && (
        <FilePreviewModal
          url={previewUrl}
          name={previewTitle}
          onClose={() => { setPreviewUrl(null); setPreviewTitle(''); }}
        />
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
                placeholder="e.g. ELD Quick-Start Guide"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of what this document contains…"
                className="min-h-[72px] resize-none"
              />
            </div>

            {/* File upload */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                File {editing && <span className="text-muted-foreground font-normal">(leave empty to keep current)</span>}
              </label>
              <div
                className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-gold/40 hover:bg-gold/[0.02] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-gold" />
                    <span className="font-medium text-foreground truncate max-w-[220px]">{selectedFile.name}</span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                      className="text-muted-foreground hover:text-destructive ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Click to select file</p>
                    <p className="text-xs text-muted-foreground">PDF, DOC, images accepted</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                />
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
              className="bg-gold hover:bg-gold-light text-surface-dark font-semibold gap-1.5"
            >
              <DemoLockIcon />
              {(saving || uploading) ? 'Saving…' : editing ? 'Save Changes' : 'Upload Resource'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Panel */}
      {historyResource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end"
          onClick={() => setHistoryResource(null)}
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
                <p className="text-xs text-muted-foreground line-clamp-1 font-medium">{historyResource.title}</p>
              </div>
              <button
                onClick={() => setHistoryResource(null)}
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
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-5">
                    {history.map((entry) => (
                      <div key={entry.id} className="flex gap-4 relative">
                        <div className={`h-3.5 w-3.5 rounded-full shrink-0 mt-0.5 border-2 border-background ring-2 ${
                          entry.change_type === 'create' ? 'bg-status-complete ring-status-complete/40' :
                          entry.change_type === 'visibility' ? 'bg-amber-500 ring-amber-200' :
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
                            {entry.change_type === 'visibility' && (
                              <span className={`text-[10px] font-semibold ${entry.is_visible ? 'text-green-600' : 'text-amber-600'}`}>
                                → {entry.is_visible ? 'Visible' : 'Hidden'}
                              </span>
                            )}
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
                          <div className="bg-muted/40 rounded-lg p-2.5 border border-border/60 space-y-1">
                            <p className="text-xs font-medium text-foreground">{entry.title}</p>
                            {entry.file_name && (
                              <p className="text-[11px] text-muted-foreground/70 font-mono">{entry.file_name}</p>
                            )}
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
            <AlertDialogTitle>Delete Resource?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently removed from the library.
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

      {/* Email Resource Dialog */}
      <Dialog open={!!emailResource} onOpenChange={open => { if (!emailSending && !open) setEmailResource(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Send by Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg p-3 border border-border/60">
              <p className="text-xs text-muted-foreground mb-0.5">Document</p>
              <p className="text-sm font-semibold text-foreground">{emailResource?.title}</p>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Send to</Label>
              <RadioGroup value={emailMode} onValueChange={v => setEmailMode(v as 'operator' | 'custom')} className="flex gap-4 mb-3">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="operator" id="email-operator" />
                  <Label htmlFor="email-operator" className="cursor-pointer text-sm">Operator</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="custom" id="email-custom" />
                  <Label htmlFor="email-custom" className="cursor-pointer text-sm">Someone else</Label>
                </div>
              </RadioGroup>

              {emailMode === 'operator' ? (
                <Select value={emailOperatorId} onValueChange={setEmailOperatorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an operator…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {operators.map(op => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.name} — {op.email}
                      </SelectItem>
                    ))}
                    {operators.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No active operators found</div>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={emailCustomAddress}
                  onChange={e => setEmailCustomAddress(e.target.value)}
                />
              )}
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">
                Note <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                value={emailNote}
                onChange={e => setEmailNote(e.target.value)}
                placeholder="Add a message for the recipient…"
                className="min-h-[60px] resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEmailResource(null)} disabled={emailSending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={emailSending || (emailMode === 'operator' ? !emailOperatorId : !emailCustomAddress.trim())}
              className="bg-gold hover:bg-gold-light text-surface-dark font-semibold gap-1.5"
            >
              {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {emailSending ? 'Sending…' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
