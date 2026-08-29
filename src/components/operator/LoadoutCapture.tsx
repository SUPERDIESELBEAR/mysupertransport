import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, FileUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';
import {
  recordLoadoutDamageFlag, recordLoadoutStickerNotFound, uploadLoadDocument,
  validateLoadoutPhotoFile, type LoadoutStickerState,
} from '@/lib/loadDocuments';
import {
  LOADOUT_SLOTS, LOADOUT_STAGES, LOADOUT_STAGE_DOCUMENT_TYPE, LOADOUT_STAGE_LABEL,
  type LoadoutSlot, type LoadoutStage,
} from '@/lib/loadoutSlots';

/**
 * Guided loadout capture — fixed slots, no typing.
 *
 * The slot list is NOT defined here. src/lib/loadoutSlots.ts owns it and the
 * paperwork predicate reads the same module, so what the driver is asked for and
 * what the load owes cannot drift apart.
 *
 * NOTHING here gates the driver. Missing required slots are shown, never
 * enforced: if the trailer is wrong he tells dispatch, records it, hooks up and
 * goes. A driver stranded at a yard is worse than a documented dent.
 */

interface Props {
  loadId: string;
  onUploaded?: () => void;
}

interface PhotoRow {
  document_type: string;
  photo_label: string | null;
  inspection_sticker_state: LoadoutStickerState | null;
  inspection_sticker_expiry: string | null;
}

const fold = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

function countFor(rows: PhotoRow[], stage: LoadoutStage, slot: LoadoutSlot): number {
  const type = LOADOUT_STAGE_DOCUMENT_TYPE[stage];
  return rows.filter(r => r.document_type === type && fold(r.photo_label) === fold(slot.photoLabel)).length;
}

function SlotRow({
  slot, count, busy, onCapture,
}: {
  slot: LoadoutSlot;
  count: number;
  busy: boolean;
  onCapture: (file: File) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug flex items-center gap-1.5">
            {count > 0 && <Check className="h-3.5 w-3.5 text-status-complete shrink-0" />}
            {slot.title}
            {count > 1 && <span className="text-xs text-muted-foreground">({count})</span>}
          </p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{slot.instruction}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button" size="sm" disabled={busy}
            onClick={() => cameraRef.current?.click()}
            aria-label={`Take the ${slot.title} photo`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button" size="sm" variant="outline" disabled={busy}
            onClick={() => fileRef.current?.click()}
            aria-label={`Choose a file for ${slot.title}`}
          >
            <FileUp className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <input
        ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        data-testid={`loadout-camera-${slot.key}`}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(f); }}
      />
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        data-testid={`loadout-file-${slot.key}`}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(f); }}
      />
    </div>
  );
}

export function LoadoutCapture({ loadId, onUploaded }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [damageSlot, setDamageSlot] = useState<{ stage: LoadoutStage; slot: LoadoutSlot } | null>(null);
  const [damageNote, setDamageNote] = useState('');
  const [damageFile, setDamageFile] = useState<File | null>(null);
  const damageInput = useRef<HTMLInputElement>(null);

  const [stickerOpen, setStickerOpen] = useState(false);
  const [stickerExpiry, setStickerExpiry] = useState('');
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const stickerInput = useRef<HTMLInputElement>(null);
  const [stickerMode, setStickerMode] = useState<Exclude<LoadoutStickerState, 'not_found'>>('recorded');

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('load_documents')
      .select('document_type, photo_label, inspection_sticker_state, inspection_sticker_expiry')
      .eq('load_id', loadId);
    setRows((data ?? []) as PhotoRow[]);
  }, [loadId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const stickerAnswer = rows.find(r => r.inspection_sticker_state)?.inspection_sticker_state ?? null;
  const stickerExpiryOnFile = rows.find(r => r.inspection_sticker_expiry)?.inspection_sticker_expiry ?? null;

  const upload = async (
    stage: LoadoutStage, slot: LoadoutSlot, file: File,
    extra: Partial<Parameters<typeof uploadLoadDocument>[0]> = {},
  ) => {
    const check = validateLoadoutPhotoFile(file);
    if (!check.valid) {
      toast({ title: 'Cannot use that file', description: check.error, variant: 'destructive' });
      return false;
    }
    setBusy(slot.key);
    try {
      await uploadLoadDocument({
        loadId,
        documentType: LOADOUT_STAGE_DOCUMENT_TYPE[stage],
        file,
        uploadChannel: 'driver_app',
        photoLabel: slot.photoLabel,
        ...extra,
      });
      await refresh();
      onUploaded?.();
      return true;
    } catch (err) {
      logDbError('[LoadoutCapture] upload failed', err, { loadId, slot: slot.key });
      toast({
        title: 'Photo not saved',
        description: getDbErrorMessage(err, 'The photo was not saved.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitDamage = async () => {
    if (!damageSlot || !damageFile || !damageNote.trim()) return;
    const ok = await upload(damageSlot.stage, damageSlot.slot, damageFile, {
      damageNoted: true,
      damageNotes: damageNote.trim(),
    });
    if (!ok) return;
    try {
      await recordLoadoutDamageFlag(loadId, damageNote.trim());
    } catch (err) {
      logDbError('[LoadoutCapture] damage flag failed', err, { loadId });
      toast({
        title: 'Photo saved, dispatch not flagged',
        description: getDbErrorMessage(err, 'Tell dispatch directly.'),
        variant: 'destructive',
      });
    }
    setDamageSlot(null); setDamageNote(''); setDamageFile(null);
    toast({ title: 'Damage recorded', description: 'Dispatch can see it. You can carry on.' });
  };

  const stickerSlot = LOADOUT_SLOTS.pickup.find(s => s.kind === 'sticker') as LoadoutSlot;

  const submitSticker = async () => {
    if (!stickerFile) return;
    const ok = await upload('pickup', stickerSlot, stickerFile, {
      inspectionStickerState: stickerMode,
      inspectionStickerExpiry: stickerMode === 'recorded' ? stickerExpiry || null : null,
    });
    if (!ok) return;
    setStickerOpen(false); setStickerFile(null); setStickerExpiry('');
    toast({ title: 'Inspection sticker recorded' });
  };

  const stickerNotFound = async () => {
    setBusy(stickerSlot.key);
    try {
      await recordLoadoutStickerNotFound(loadId, stickerSlot.photoLabel);
      await refresh();
      onUploaded?.();
      toast({ title: 'Recorded — no sticker found' });
    } catch (err) {
      logDbError('[LoadoutCapture] sticker not found failed', err, { loadId });
      toast({
        title: 'Not recorded',
        description: getDbErrorMessage(err, 'Try again.'),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {LOADOUT_STAGES.map(stage => {
        const slots = LOADOUT_SLOTS[stage];
        const required = slots.filter(s => s.required && s.kind === 'photo');
        const optional = slots.filter(s => !s.required && s.kind === 'photo');
        const damage = slots.find(s => s.kind === 'damage');
        const hasSticker = slots.some(s => s.kind === 'sticker');
        const missing = required.filter(s => countFor(rows, stage, s) === 0).length;

        return (
          <section key={stage} className="space-y-2" data-testid={`loadout-stage-${stage}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{LOADOUT_STAGE_LABEL[stage]}</p>
              <p className="text-[11px] text-muted-foreground">
                {missing === 0 ? 'All required photos taken' : `${missing} still to take`}
              </p>
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required</p>
            {required.map(slot => (
              <SlotRow
                key={slot.key} slot={slot} count={countFor(rows, stage, slot)}
                busy={busy === slot.key} onCapture={f => void upload(stage, slot, f)}
              />
            ))}

            {hasSticker && (
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 space-y-2">
                <p className="text-sm font-medium text-foreground leading-snug flex items-center gap-1.5">
                  {stickerAnswer && <Check className="h-3.5 w-3.5 text-status-complete shrink-0" />}
                  {stickerSlot.title}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">{stickerSlot.instruction}</p>
                {stickerAnswer ? (
                  <p className="text-xs text-foreground">
                    {stickerAnswer === 'recorded'
                      ? `Recorded${stickerExpiryOnFile ? ` — expires ${stickerExpiryOnFile}` : ''}`
                      : stickerAnswer === 'unreadable'
                        ? 'Sticker present but unreadable'
                        : 'No sticker found'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button" size="sm" disabled={busy === stickerSlot.key}
                      onClick={() => { setStickerMode('recorded'); setStickerOpen(true); }}
                    >
                      Photo and expiry
                    </Button>
                    <Button
                      type="button" size="sm" variant="outline" disabled={busy === stickerSlot.key}
                      onClick={() => { setStickerMode('unreadable'); setStickerOpen(true); }}
                    >
                      Present but unreadable
                    </Button>
                    <Button
                      type="button" size="sm" variant="outline" disabled={busy === stickerSlot.key}
                      onClick={() => void stickerNotFound()}
                    >
                      No sticker found
                    </Button>
                  </div>
                )}
              </div>
            )}

            {optional.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                  Optional — helpful, skippable
                </p>
                {optional.map(slot => (
                  <SlotRow
                    key={slot.key} slot={slot} count={countFor(rows, stage, slot)}
                    busy={busy === slot.key} onCapture={f => void upload(stage, slot, f)}
                  />
                ))}
              </>
            )}

            {damage && (
              <Button
                type="button" variant="outline" size="sm" className="w-full"
                data-testid={`loadout-damage-${stage}`}
                onClick={() => { setDamageSlot({ stage, slot: damage }); setDamageNote(''); setDamageFile(null); }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Add damage — {LOADOUT_STAGE_LABEL[stage].toLowerCase()}
              </Button>
            )}
          </section>
        );
      })}

      <Dialog open={!!damageSlot} onOpenChange={o => { if (!o) setDamageSlot(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record damage</DialogTitle>
            <DialogDescription>
              This is a record, not a hold. Tell dispatch, note it here, and carry on with the trailer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="damage-note">What is wrong?</Label>
              <Textarea
                id="damage-note" value={damageNote} onChange={e => setDamageNote(e.target.value)}
                placeholder="e.g. Daylight through the roof about ten feet back, driver side."
              />
            </div>
            <Button type="button" variant="outline" onClick={() => damageInput.current?.click()}>
              <Camera className="h-4 w-4 mr-1.5" />
              {damageFile ? damageFile.name : 'Photograph it'}
            </Button>
            <input
              ref={damageInput} type="file" accept="image/*" capture="environment" className="hidden"
              data-testid="loadout-damage-photo"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setDamageFile(f); }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button" onClick={() => void submitDamage()}
              disabled={!damageFile || !damageNote.trim() || busy === damageSlot?.slot.key}
            >
              Save damage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stickerOpen} onOpenChange={setStickerOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Annual inspection sticker</DialogTitle>
            <DialogDescription>
              {stickerMode === 'recorded'
                ? 'Photograph the sticker and enter the expiry date shown on it.'
                : 'Photograph the sticker anyway — the office may be able to read it.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button type="button" variant="outline" onClick={() => stickerInput.current?.click()}>
              <Camera className="h-4 w-4 mr-1.5" />
              {stickerFile ? stickerFile.name : 'Photograph the sticker'}
            </Button>
            <input
              ref={stickerInput} type="file" accept="image/*" capture="environment" className="hidden"
              data-testid="loadout-sticker-photo"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setStickerFile(f); }}
            />
            {stickerMode === 'recorded' && (
              <div className="space-y-1.5">
                <Label htmlFor="sticker-expiry">Expiry date</Label>
                <Input
                  id="sticker-expiry" type="date" value={stickerExpiry}
                  onChange={e => setStickerExpiry(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button" onClick={() => void submitSticker()}
              disabled={!stickerFile || (stickerMode === 'recorded' && !stickerExpiry) || busy === stickerSlot.key}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
