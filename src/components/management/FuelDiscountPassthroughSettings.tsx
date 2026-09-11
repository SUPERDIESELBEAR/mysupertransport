/**
 * FUEL DISCOUNT PASS-THROUGH — the company rule and its exceptions, together.
 *
 * ONE PLACE. The company-wide value lives on the company default pay policy and
 * had no control at all until now; the per-driver value lives on the operator
 * and used to be edited on the driver's own page, far from the rule it
 * overrides. A rule read in one place and changed in two is how a setting
 * quietly drifts, so both sit here, the exceptions folded under the rule.
 *
 * THIS IS A SETTING, NOT A RATE. It never changes the fuel deduction — the
 * driver is deducted the gross amount of his purchases either way. It decides
 * only whether the discount is credited back as its own line.
 *
 * THREE STATES PER DRIVER, NOT A CHECKBOX: follow the company setting, always
 * yes, always no. An unset driver moves with a later company change; a
 * deliberately-off driver does not, and a checkbox cannot say which is which.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, Fuel, Loader2 } from 'lucide-react';
import { fetchOperatorOptions, operatorLabel, type OperatorOption } from '@/lib/fuel/fuelOperators';

type Choice = 'inherit' | 'on' | 'off';

export const toChoice = (v: boolean | null | undefined): Choice =>
  v == null ? 'inherit' : v ? 'on' : 'off';
export const toValue = (c: Choice): boolean | null => (c === 'inherit' ? null : c === 'on');

/** How many drivers deliberately differ from the company rule. */
export function exceptionCount(choices: Record<string, Choice>): number {
  return Object.values(choices).filter(c => c !== 'inherit').length;
}

interface Row extends OperatorOption { choice: Choice }

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'inherit', label: 'Follow company' },
  { value: 'on', label: 'Yes' },
  { value: 'off', label: 'No' },
];

export default function FuelDiscountPassthroughSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [companyOn, setCompanyOn] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Record<string, Choice>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingDriver, setSavingDriver] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [policy, options, overrides] = await Promise.all([
      supabase.from('pay_policies')
        .select('id, fuel_discount_passthrough')
        .eq('is_company_default', true).maybeSingle(),
      fetchOperatorOptions(),
      supabase.from('operators').select('id, fuel_discount_passthrough_override').limit(1000),
    ]);
    const byId = new Map<string, boolean | null>(
      ((overrides.data ?? []) as { id: string; fuel_discount_passthrough_override: boolean | null }[])
        .map(o => [o.id, o.fuel_discount_passthrough_override]),
    );
    setPolicyId(policy.data?.id ?? null);
    setCompanyOn(Boolean(policy.data?.fuel_discount_passthrough));
    setRows(options.map(o => ({ ...o, choice: toChoice(byId.get(o.id)) })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const choices = useMemo(
    () => Object.fromEntries(rows.map(r => [r.id, r.choice])) as Record<string, Choice>,
    [rows],
  );
  const exceptions = exceptionCount(choices);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => operatorLabel(r).toLowerCase().includes(q));
  }, [rows, search]);

  const saveCompany = async (next: boolean) => {
    if (!policyId) {
      toast({ title: 'No company default pay policy on file', variant: 'destructive' });
      return;
    }
    setSavingCompany(true);
    const { error } = await supabase.from('pay_policies')
      .update({ fuel_discount_passthrough: next })
      .eq('id', policyId);
    setSavingCompany(false);
    if (error) {
      toast({ title: 'Not saved', description: error.message, variant: 'destructive' });
      return;
    }
    setCompanyOn(next);
    toast({
      title: next ? 'Discount passed through company-wide' : 'Discount no longer passed through',
      description: exceptions
        ? `${exceptions} driver${exceptions === 1 ? '' : 's'} keep their own setting.`
        : 'Every driver follows this setting.',
    });
  };

  const saveDriver = async (id: string) => {
    const choice = pending[id];
    const note = (notes[id] ?? '').trim();
    if (!choice || !note) return;
    setSavingDriver(id);
    const { error } = await supabase.rpc('set_operator_fuel_discount_passthrough', {
      _operator_id: id,
      _value: toValue(choice),
      _note: note,
    });
    setSavingDriver(null);
    if (error) {
      toast({ title: 'Not saved', description: error.message, variant: 'destructive' });
      return;
    }
    setRows(rs => rs.map(r => (r.id === id ? { ...r, choice } : r)));
    setPending(p => { const n = { ...p }; delete n[id]; return n; });
    setNotes(p => { const n = { ...p }; delete n[id]; return n; });
    toast({ title: 'Driver exception saved' });
  };

  return (
    <Card className="p-4 space-y-4" data-testid="fuel-discount-passthrough-settings">
      <div className="flex items-start gap-3">
        <Fuel className="mt-0.5 h-5 w-5 text-gold" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">Fuel Discount Pass-Through</p>
          <p className="text-[12px] text-muted-foreground leading-snug">
            The fuel deduction is the same either way — every driver is deducted the gross amount of
            his fuel purchases. This decides only whether the discount is credited back to him as its
            own line, "Fuel discount passed through". A driver who does not receive it sees no
            mention of a discount anywhere.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="fdp-company" className="text-xs font-semibold text-foreground">
                Pass the discount through, company-wide
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {companyOn
                  ? 'Every driver is credited his fuel discount unless he has his own setting below.'
                  : 'No driver is credited the discount unless he has his own setting below.'}
              </p>
            </div>
            <Switch
              id="fdp-company"
              data-testid="fdp-company-toggle"
              checked={companyOn}
              disabled={savingCompany || !policyId}
              onCheckedChange={saveCompany}
            />
          </div>

          <div className="rounded-lg border border-border">
            <button
              type="button"
              data-testid="fdp-exceptions-toggle"
              onClick={() => setOpen(o => !o)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-xs font-semibold text-foreground">
                Driver exceptions
                <span className="ml-2 font-normal text-muted-foreground" data-testid="fdp-exception-count">
                  {exceptions === 0
                    ? 'none — every driver follows the company setting'
                    : `${exceptions} driver${exceptions === 1 ? '' : 's'} set differently`}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
            </button>

            {open && (
              <div className="space-y-3 border-t border-border p-3">
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Find a driver…"
                  className="h-8"
                />
                {visible.length === 0 && (
                  <p className="text-xs text-muted-foreground">No drivers match.</p>
                )}
                {visible.map(r => {
                  const choice = pending[r.id] ?? r.choice;
                  const dirty = choice !== r.choice;
                  return (
                    <div key={r.id} className="space-y-2 rounded-md border border-border p-2.5" data-testid="fdp-driver-row">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{operatorLabel(r)}</span>
                        <div className="flex gap-1">
                          {CHOICES.map(c => (
                            <Button
                              key={c.value}
                              size="sm"
                              variant={choice === c.value ? 'default' : 'outline'}
                              className="h-7 text-[11px]"
                              onClick={() => setPending(p => ({ ...p, [r.id]: c.value }))}
                            >
                              {c.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {dirty && (
                        <div className="space-y-2">
                          <Textarea
                            rows={2}
                            value={notes[r.id] ?? ''}
                            onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                            placeholder="Reason for this driver's setting (required)"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={savingDriver === r.id || !(notes[r.id] ?? '').trim()}
                              onClick={() => saveDriver(r.id)}
                            >
                              {savingDriver === r.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPending(p => { const n = { ...p }; delete n[r.id]; return n; });
                                setNotes(n => { const x = { ...n }; delete x[r.id]; return x; });
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
