import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  RETAKE_DOCUMENT_LABELS,
  RETAKE_REASONS,
  type RetakeDocumentKey,
} from '@/lib/applicationDocumentRetake';

interface Props {
  applicationId: string;
  applicantEmail: string;
  /** Slot pre-selected when the modal opens (from the row's Request retake button). */
  initialKey?: RetakeDocumentKey | null;
  onClose: () => void;
  onRequested: (keys: RetakeDocumentKey[]) => void;
}

const KEYS = Object.keys(RETAKE_DOCUMENT_LABELS) as RetakeDocumentKey[];

export function RequestRetakeModal({ applicationId, applicantEmail, initialKey, onClose, onRequested }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    initialKey ? { [initialKey]: true } : {},
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const chosen = KEYS.filter(k => selected[k]);

  const submit = async () => {
    if (chosen.length === 0) {
      toast.error('Pick at least one document.');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-document-retake', {
        body: {
          applicationId,
          note: note.trim() || undefined,
          documents: chosen.map(k => ({ key: k, reason: reasons[k] || 'blurry' })),
        },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      toast.success(`Retake request emailed to ${applicantEmail}`);
      onRequested(chosen);
      onClose();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not send the retake request.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl border border-border shadow-xl max-h-[90dvh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-gold" /> Request a document retake
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              We'll clear the selected files and email {applicantEmail} a secure link that opens their application on the upload step.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {KEYS.map(key => (
            <div key={key} className="rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!selected[key]}
                  onChange={e => setSelected(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="h-4 w-4 accent-[hsl(var(--gold))]"
                />
                <span className="text-sm font-medium text-foreground">{RETAKE_DOCUMENT_LABELS[key]}</span>
              </label>
              {selected[key] && (
                <div className="mt-2 pl-6">
                  <Select value={reasons[key] ?? 'blurry'} onValueChange={v => setReasons(prev => ({ ...prev, [key]: v }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Reason" />
                    </SelectTrigger>
                    <SelectContent className="z-[140]">
                      {RETAKE_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}

          <div>
            <label className="text-xs font-semibold text-foreground">Note to the applicant (optional)</label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. The bottom of the card is cut off — please lay it flat and capture all four corners."
              className="mt-1 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={sending} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={sending || chosen.length === 0} className="flex-1 bg-gold text-surface-dark hover:bg-gold-light">
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Send request
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}