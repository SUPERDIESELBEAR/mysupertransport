import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Fuel } from 'lucide-react';

/**
 * THE FUEL DISCOUNT PASS-THROUGH SETTING, per driver.
 *
 * THREE EXPLICIT CHOICES, NOT A CHECKBOX. A checkbox carries two states and
 * this setting has three: "inherit the company setting", "yes for this driver"
 * and "no for this driver". A tri-state control that LOOKS like a checkbox
 * hides the distinction that matters — an unset driver follows a later
 * company-wide change and a deliberately-off driver does not — so the three
 * are written out as three named options, with the company's current value
 * spelled out inside the inherit option.
 *
 * This is a SETTING, not a pay rate. Rates live on pay policies.
 */
type Choice = 'inherit' | 'on' | 'off';

const toChoice = (v: boolean | null | undefined): Choice =>
  v == null ? 'inherit' : v ? 'on' : 'off';
const toValue = (c: Choice): boolean | null =>
  c === 'inherit' ? null : c === 'on';

export default function FuelDiscountPassthroughCard({ operatorId }: { operatorId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Choice>('inherit');
  const [choice, setChoice] = useState<Choice>('inherit');
  const [note, setNote] = useState('');
  const [companyOn, setCompanyOn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [opRes, polRes] = await Promise.all([
        supabase.from('operators')
          .select('fuel_discount_passthrough_override')
          .eq('id', operatorId).maybeSingle(),
        supabase.from('pay_policies')
          .select('fuel_discount_passthrough')
          .eq('is_company_default', true).maybeSingle(),
      ]);
      if (cancelled) return;
      const c = toChoice((opRes.data as { fuel_discount_passthrough_override?: boolean | null } | null)
        ?.fuel_discount_passthrough_override);
      setSaved(c);
      setChoice(c);
      setCompanyOn(polRes.data?.fuel_discount_passthrough ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [operatorId]);

  const dirty = choice !== saved;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_operator_fuel_discount_passthrough', {
      _operator_id: operatorId,
      _value: toValue(choice),
      _note: note,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Not saved', description: error.message, variant: 'destructive' });
      return;
    }
    setSaved(choice);
    setNote('');
    toast({ title: 'Fuel discount setting saved' });
  };

  const companyLabel = companyOn == null
    ? 'no company default policy on file'
    : companyOn ? 'company setting: passed through' : 'company setting: not passed through';

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        The fuel deduction is the same either way — the driver is always deducted the gross
        amount of his fuel purchases. This decides only whether the discount is credited
        back to him as its own line, "Fuel discount passed through".
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <RadioGroup value={choice} onValueChange={v => setChoice(v as Choice)} className="space-y-2">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="inherit" id="fdp-inherit" className="mt-1" />
              <Label htmlFor="fdp-inherit" className="font-normal cursor-pointer">
                Follow the company setting
                <span className="block text-[12px] text-muted-foreground">
                  {companyLabel}. Changes with the company setting.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="on" id="fdp-on" className="mt-1" />
              <Label htmlFor="fdp-on" className="font-normal cursor-pointer">
                Yes — pass the discount through to this driver
                <span className="block text-[12px] text-muted-foreground">
                  Stays on even if the company setting is off.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="off" id="fdp-off" className="mt-1" />
              <Label htmlFor="fdp-off" className="font-normal cursor-pointer">
                No — do not pass it through to this driver
                <span className="block text-[12px] text-muted-foreground">
                  Stays off even if the company setting is turned on later.
                </span>
              </Label>
            </div>
          </RadioGroup>

          {dirty && (
            <div className="space-y-2">
              <Label htmlFor="fdp-note" className="text-[12px]">Reason (required)</Label>
              <Textarea
                id="fdp-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Why this driver's setting is changing"
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={saving || !note.trim()}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Fuel className="h-3 w-3" />}
                  Save setting
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setChoice(saved); setNote(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
