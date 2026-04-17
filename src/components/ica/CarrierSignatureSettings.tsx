import { useEffect, useRef, useState, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DemoLockIcon from '@/components/DemoLockIcon';
import { Pen, Save, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type SettingsRow = {
  id: string;
  typed_name: string;
  title: string;
  signature_url: string | null;
  updated_at: string;
};

export default function CarrierSignatureSettings() {
  const { session, profile, roles } = useAuth();
  const { toast } = useToast();
  const { guardDemo } = useDemoMode();

  const sigRef = useRef<SignatureCanvas>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [confirmBackfillOpen, setConfirmBackfillOpen] = useState(false);
  const [missingCount, setMissingCount] = useState<number | null>(null);

  const [existing, setExisting] = useState<SettingsRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [typedName, setTypedName] = useState('');
  const [title, setTitle] = useState('');
  const [drewNew, setDrewNew] = useState(false);

  const canManage = roles.includes('owner') || roles.includes('management');

  const refreshPreview = useCallback(async (url: string | null) => {
    if (!url) { setPreviewUrl(null); return; }
    const path = url.includes('/ica-signatures/')
      ? url.split('/ica-signatures/').pop()!
      : url;
    const { data: signed } = await supabase.storage.from('ica-signatures').createSignedUrl(path, 3600);
    if (signed?.signedUrl) setPreviewUrl(signed.signedUrl);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase.from('carrier_signature_settings' as any).select('*').maybeSingle(),
      supabase.from('ica_contracts' as any)
        .select('id', { count: 'exact', head: true })
        .is('carrier_signature_url', null),
    ]);
    if (data) {
      const row = data as any as SettingsRow;
      setExisting(row);
      setTypedName(prev => prev || row.typed_name || '');
      setTitle(prev => prev || row.title || '');
      await refreshPreview(row.signature_url);
    } else {
      // Pre-fill from profile/roles
      setTypedName(prev => prev || [profile?.first_name, profile?.last_name].filter(Boolean).join(' '));
      setTitle(prev => prev || (roles.includes('owner') ? 'Owner' : roles.includes('management') ? 'Operations Manager' : ''));
    }
    setMissingCount(count ?? 0);
    setLoading(false);
  }, [profile?.first_name, profile?.last_name, roles, refreshPreview]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Size canvas to wrapper (DPR-aware) — once on mount per ICA signing reliability pattern
  useEffect(() => {
    if (loading) return;
    const wrapper = wrapperRef.current;
    const canvas = sigRef.current?.getCanvas();
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `200px`;
    const ctx = canvas.getContext('2d');
    ctx?.scale(dpr, dpr);
  }, [loading]);

  const handleClear = () => {
    sigRef.current?.clear();
    setDrewNew(false);
  };

  const uploadSignature = async (): Promise<string> => {
    const dataUrl = sigRef.current!.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const path = `carrier-default/owner-${Date.now()}.png`;
    const { error } = await supabase.storage.from('ica-signatures').upload(path, blob, {
      contentType: 'image/png', upsert: true,
    });
    if (error) throw error;
    return path;
  };

  const handleSaveDefault = async () => {
    if (guardDemo()) return;
    if (!typedName.trim() || !title.trim()) {
      toast({ title: 'Name and title required', description: 'Enter your typed name and title before saving.', variant: 'destructive' });
      return;
    }
    const isEmpty = sigRef.current?.isEmpty() ?? true;
    if (isEmpty && !existing?.signature_url) {
      toast({ title: 'Draw your signature first', description: 'The signature canvas is empty — draw your signature before saving as default.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let signature_url = existing?.signature_url ?? null;
      if (!isEmpty) {
        signature_url = await uploadSignature();
      }
      const payload: any = {
        typed_name: typedName.trim(),
        title: title.trim(),
        signature_url,
        updated_by: session?.user?.id ?? null,
      };

      let result;
      if (existing) {
        result = await supabase.from('carrier_signature_settings' as any)
          .update(payload).eq('id', existing.id).select().single();
      } else {
        result = await supabase.from('carrier_signature_settings' as any)
          .insert(payload).select().single();
      }
      if (result.error) throw result.error;

      toast({ title: 'Carrier signature saved', description: 'This will be applied to all new ICAs.' });
      sigRef.current?.clear();
      setDrewNew(false);
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Error saving', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleBackfill = async () => {
    if (guardDemo()) return;
    if (!existing?.signature_url) {
      toast({ title: 'Save a signature first', description: 'You must save a default signature before backfilling.', variant: 'destructive' });
      return;
    }
    setBackfilling(true);
    setConfirmBackfillOpen(false);
    try {
      const { error, count } = await supabase
        .from('ica_contracts' as any)
        .update({
          carrier_signature_url: existing.signature_url,
          carrier_typed_name: existing.typed_name,
          carrier_title: existing.title,
        } as any, { count: 'exact' })
        .is('carrier_signature_url', null);
      if (error) throw error;

      toast({
        title: `Updated ${count ?? 0} ICA${count === 1 ? '' : 's'}`,
        description: 'All previously unsigned ICAs now show your carrier signature.',
      });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Backfill failed', description: err.message, variant: 'destructive' });
    } finally {
      setBackfilling(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Only management or owner users can manage the carrier signature.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Carrier Signature</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The default signature, name, and title applied to every Independent Contractor Agreement on behalf of SUPERTRANSPORT, LLC.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Current saved preview */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${existing?.signature_url ? 'text-status-complete' : 'text-muted-foreground/50'}`} />
                Current default
              </h2>
              {existing?.updated_at && (
                <span className="text-xs text-muted-foreground">
                  Updated {new Date(existing.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Name</span>
                <p className="font-medium text-foreground mt-0.5">{existing?.typed_name || '—'}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Title</span>
                <p className="font-medium text-foreground mt-0.5">{existing?.title || '—'}</p>
              </div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Signature image</span>
              {previewUrl ? (
                <div className="mt-1.5 border border-border rounded-lg bg-white p-3 max-w-sm">
                  <img src={previewUrl} alt="Saved carrier signature" className="h-20 object-contain mx-auto" />
                </div>
              ) : (
                <div className="mt-1.5 border border-dashed border-destructive/40 rounded-lg bg-destructive/5 p-4 max-w-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">No signature image saved</p>
                    <p className="text-xs text-destructive/80 mt-0.5">Draw and save a signature below — without one, ICAs will render with a blank signature line.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Update form */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Update default</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Typed Full Name</Label>
                <Input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Marc Mueller" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Owner" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Pen className="h-3.5 w-3.5" /> Draw signature
                </Label>
                <button
                  onClick={handleClear}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
              <div ref={wrapperRef} className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
                <SignatureCanvas
                  ref={sigRef}
                  canvasProps={{ className: 'w-full touch-none', style: { width: '100%', height: 200 } }}
                  penColor="#1a1a1a"
                  onEnd={() => setDrewNew(true)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {existing?.signature_url
                  ? 'Drawing here will replace the saved signature when you click Save default. Leave blank to keep the existing image.'
                  : 'Sign with your mouse, trackpad, or finger.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button onClick={handleSaveDefault} disabled={saving} className="gap-1.5">
                <DemoLockIcon />
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save default'}
              </Button>
            </div>
          </div>

          {/* Backfill */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-gold" /> Apply to existing ICAs
            </h2>
            <p className="text-sm text-muted-foreground">
              {missingCount === 0
                ? 'All existing ICAs already have a carrier signature image — nothing to backfill.'
                : `${missingCount} existing ICA${missingCount === 1 ? '' : 's'} ${missingCount === 1 ? 'is' : 'are'} missing your carrier signature image. Apply the saved default to fill them in.`}
            </p>
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                disabled={backfilling || !existing?.signature_url || (missingCount ?? 0) === 0}
                onClick={() => setConfirmBackfillOpen(true)}
                className="gap-1.5"
              >
                <DemoLockIcon />
                <RefreshCw className={`h-4 w-4 ${backfilling ? 'animate-spin' : ''}`} />
                {backfilling ? 'Applying…' : 'Apply to existing ICAs'}
              </Button>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={confirmBackfillOpen} onOpenChange={setConfirmBackfillOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply carrier signature to {missingCount ?? 0} ICA{missingCount === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set your saved carrier signature, name, and title on every Independent Contractor Agreement that is currently missing a carrier signature image. ICAs that already have a signature will not be touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBackfill}>Apply now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
