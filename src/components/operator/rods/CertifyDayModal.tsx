import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Loader2, X } from 'lucide-react';
import { formatLogDate, type RodsDay } from '@/lib/eld/rodsTypes';
import type { RodsValidation } from '@/lib/eld/rodsValidation';

export default function CertifyDayModal({
  open, onOpenChange, day, validation, legalName, onLegalNameChange, onConfirm, busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  day: RodsDay;
  validation: RodsValidation;
  legalName: string;
  onLegalNameChange: (v: string) => void;
  onConfirm: (signatureDataUrl: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [sigWidth, setSigWidth] = useState(320);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const w = hostRef.current?.clientWidth;
      if (w) setSigWidth(w - 2);
    }, 60);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Certify {formatLogDate(day.log_date)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="space-y-1.5 rounded-lg border border-border p-3 text-xs">
            {validation.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {c.ok
                  ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                <span className={c.ok ? 'text-muted-foreground' : 'text-foreground'}>
                  {c.label}
                  {!c.ok && c.detail && <span className="block text-[11px] text-muted-foreground">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>

          <p className="rounded-lg bg-muted/40 p-3 text-xs text-foreground">
            I certify that my data entries and my record of duty status for this 24-hour period are true and correct.
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Type your full legal name</Label>
            <Input
              className="text-base"
              value={legalName}
              onChange={(e) => onLegalNameChange(e.target.value)}
              placeholder="First Last"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Sign below</Label>
            <div ref={hostRef} className="rounded-lg border border-border bg-background">
              <SignatureCanvas
                ref={(r) => { sigRef.current = r; }}
                penColor="#0D0D0D"
                canvasProps={{ width: sigWidth, height: 140, className: 'rounded-lg touch-none' }}
              />
            </div>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => sigRef.current?.clear()}>
              Clear signature
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Once certified, this log is locked. If something is wrong afterward you can create an amendment, which keeps
            the original on file and records what changed and why.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={busy || !validation.canCertify}
              onClick={() => {
                const sig = sigRef.current;
                if (!sig || sig.isEmpty()) return;
                void onConfirm(sig.getCanvas().toDataURL('image/png'));
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Certify log'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}