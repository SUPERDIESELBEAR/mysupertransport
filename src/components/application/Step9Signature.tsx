import { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { RotateCcw, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ApplicationFormData } from './types';
import { FormField, AppInput } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

export default function Step9Signature({ data, onChange, errors }: Props) {
  const sigRef = useRef<SignatureCanvas>(null);
  const sigWrapRef = useRef<HTMLDivElement>(null);
  const [savingSig, setSavingSig] = useState(false);
  const [sigSaved, setSigSaved] = useState(!!data.signature_image_url);
  const [showSSN, setShowSSN] = useState(false);

  // ── DPR-aware canvas sizing ──────────────────────────────────────────────
  // Size the canvas exactly ONCE on mount. Re-sizing the canvas element
  // wipes its bitmap, which on iOS Safari fires every time the URL bar
  // collapses — causing the user's signature to vanish and the submit
  // to fail validation. Mirrors the ICA signing pad pattern.
  useEffect(() => {
    const wrap = sigWrapRef.current;
    if (!wrap) return;
    const canvas = wrap.querySelector('canvas');
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.offsetWidth;
    const h = 160;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSig = () => {
    sigRef.current?.clear();
    onChange('signature_image_url', '');
    setSigSaved(false);
  };

  const saveSig = async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    setSavingSig(true);
    try {
      const dataUrl = sigRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const path = `signatures/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
      const { error } = await supabase.storage.from('signatures').upload(path, blob, { contentType: 'image/png' });
      if (error) throw error;
      onChange('signature_image_url', path);
      setSigSaved(true);
    } catch {
      // keep trying
    } finally {
      setSavingSig(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Certification & Signature</h2>
        <p className="text-sm text-muted-foreground">Review the certification statement and provide your electronic signature below.</p>
      </div>

      {/* Certification Statement */}
      <div className="p-4 border border-border rounded-xl bg-secondary">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Certification:</strong> I certify that all information provided in this application is true, correct, and complete to the best of my knowledge. I understand that: providing false or misleading information may result in disqualification or termination; the motor carrier will conduct independent verification as required by FMCSA; approximate information is acceptable when exact details are unavailable. I authorize all investigations and release of information described in this application.
        </p>
      </div>

      {/* SSN */}
      <FormField
        label="Social Security Number"
        required
        error={errors.ssn}
        hint="Required by FMCSA per 49 CFR § 391.21. Your SSN is encrypted and stored securely."
      >
        <div className="relative">
          <AppInput
            type={showSSN ? 'text' : 'password'}
            value={data.ssn}
            onChange={e => onChange('ssn', e.target.value)}
            placeholder="XXX-XX-XXXX"
            error={!!errors.ssn}
            maxLength={11}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowSSN(prev => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showSSN ? 'Hide SSN' : 'Show SSN'}
          >
            {showSSN ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </FormField>

      {/* Typed Full Name */}
      <FormField
        label="Type Your Full Legal Name"
        required
        error={errors.typed_full_name}
        hint="This serves as your electronic signature acknowledgment"
      >
        <AppInput
          value={data.typed_full_name}
          onChange={e => onChange('typed_full_name', e.target.value)}
          placeholder="Your full legal name"
          error={!!errors.typed_full_name}
        />
      </FormField>

      {/* Signature Pad */}
      <FormField label="Signature" required error={errors.signature_image_url}>
        <div className={`border-2 rounded-xl overflow-hidden bg-white ${errors.signature_image_url ? 'border-destructive' : 'border-border'}`}>
          <div className="bg-secondary border-b border-border px-3 py-2 flex items-center justify-between gap-2 min-w-0">
            <span className="text-xs text-muted-foreground truncate">Draw your signature below</span>
            <div className="flex items-center gap-2 shrink-0">
              {sigSaved && <span className="text-xs text-green-600 font-medium whitespace-nowrap">Saved ✓</span>}
              <button
                type="button"
                onClick={clearSig}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-border whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>
          <div ref={sigWrapRef} className="w-full touch-none">
            <SignatureCanvas
              ref={sigRef}
              penColor="black"
              canvasProps={{
                style: { display: 'block', width: '100%', height: '160px', touchAction: 'none' },
              }}
              onEnd={saveSig}
            />
          </div>
        </div>
        {savingSig && <p className="text-xs text-muted-foreground mt-1">Saving signature…</p>}
      </FormField>

      {/* Date */}
      <FormField label="Date">
        <div className="px-3 py-2.5 rounded-lg border border-border bg-secondary text-sm text-muted-foreground">
          {data.signed_date}
        </div>
      </FormField>
    </div>
  );
}
