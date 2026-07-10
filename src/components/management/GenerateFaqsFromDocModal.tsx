import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Audience = 'owner_operator' | 'staff';

interface ResourceOption {
  id: string;
  title: string;
  file_name: string | null;
  file_url: string | null;
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  { value: 'application_process', label: 'Application Process' },
  { value: 'background_screening', label: 'Background Screening' },
  { value: 'documents_requirements', label: 'Documents & Requirements' },
  { value: 'ica_contracts', label: 'ICA Contracts' },
  { value: 'missouri_registration', label: 'Missouri Registration' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'dispatch_operations', label: 'Dispatch & Operations' },
  { value: 'general_owner_operator', label: 'General Owner-Operator' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAudience: Audience;
  onCompleted: () => void;
}

export default function GenerateFaqsFromDocModal({
  open,
  onOpenChange,
  defaultAudience,
  onCompleted,
}: Props) {
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceId, setResourceId] = useState('');
  const [audience, setAudience] = useState<Audience>(defaultAudience);
  const [categoryHint, setCategoryHint] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAudience(defaultAudience);
    setResourceId('');
    setCategoryHint('');
    (async () => {
      setLoadingResources(true);
      const { data } = await supabase
        .from('resource_documents')
        .select('id, title, file_name, file_url')
        .order('sort_order', { ascending: true });
      const pdfs = (data ?? []).filter((r: any) => {
        const name = (r.file_name || r.file_url || '').toLowerCase();
        return name.endsWith('.pdf');
      }) as ResourceOption[];
      setResources(pdfs);
      setLoadingResources(false);
    })();
  }, [open, defaultAudience]);

  const handleRun = async () => {
    if (!resourceId) { toast.error('Pick a document.'); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('faq-generate-from-doc', {
        body: {
          resource_document_id: resourceId,
          audience,
          category_hint: categoryHint || undefined,
        },
      });
      if (error) throw error;
      const inserted = data?.inserted ?? 0;
      const skipped = data?.skipped_duplicate ?? 0;
      toast.success(
        `Created ${inserted} draft${inserted === 1 ? '' : 's'}` +
        (skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''),
      );
      onCompleted();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed.';
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            Generate FAQs from Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            AI reads the selected PDF and drafts FAQ entries. Nothing is
            published — every result lands in the FAQ list as a draft for you to
            review, edit, and publish.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Source PDF</label>
            {loadingResources ? (
              <div className="text-sm text-muted-foreground">Loading documents…</div>
            ) : resources.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No PDFs found in the Resource Library. Upload one first.
              </div>
            ) : (
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a document…" />
                </SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Audience</label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner_operator">Owner-Operator</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Category hint (optional)</label>
            <Select value={categoryHint || '__auto'} onValueChange={(v) => setCategoryHint(v === '__auto' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value || '__auto'} value={o.value || '__auto'}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 border border-border">
            Generation may take 30-90 seconds depending on document length.
            Near-duplicates of existing FAQs are skipped automatically.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button
            onClick={handleRun}
            disabled={running || !resourceId}
            className="bg-gold hover:bg-gold-light text-surface-dark font-semibold"
          >
            {running ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1.5" /> Generate drafts</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}