/**
 * Platform-only "Create a carrier" screen (demo carrier stage 4 part 2b, P43–P47).
 *
 * Hidden route, no navigation entry. This page asks is_platform_admin() and shows
 * nothing to anyone else — but it is NOT the gate: the create-carrier function
 * checks the caller again, and create_carrier() re-checks inside the database.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import NotFound from '@/pages/NotFound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Field = { key: string; label: string; placeholder?: string; optional?: boolean };

const SECTIONS: { title: string; fields: Field[] }[] = [
  { title: 'Carrier', fields: [
    { key: 'legal_name', label: 'Legal name' },
    { key: 'usdot_number', label: 'USDOT number' },
    { key: 'mc_number', label: 'MC number' },
    { key: 'main_office_address', label: 'Main office address' },
    { key: 'home_terminal_address', label: 'Home terminal address' },
    { key: 'home_terminal_timezone', label: 'Home terminal time zone', placeholder: 'America/Chicago' },
    { key: 'fmcsa_division_state', label: 'FMCSA division state', placeholder: 'MO' },
    { key: 'applicant_locality', label: 'Applicant locality (city, state)', placeholder: 'Tulsa, Oklahoma' },
    { key: 'apply_slug', label: 'Apply link name', placeholder: 'my-carrier' },
    { key: 'rate_con_ingest_address', label: 'Rate confirmation email address', optional: true },
  ]},
  { title: 'Numbering', fields: [
    { key: 'load_number_prefix', label: 'Load number prefix' },
    { key: 'invoice_number_prefix', label: 'Invoice number prefix' },
  ]},
  { title: 'Owner', fields: [
    { key: 'owner_first_name', label: 'First name' },
    { key: 'owner_last_name', label: 'Last name' },
    { key: 'owner_email', label: 'Email' },
    { key: 'signature_typed_name', label: 'Signature name (on agreements)' },
    { key: 'signature_title', label: 'Signature title', placeholder: 'Owner' },
  ]},
  { title: 'Dispatch and factoring (no default)', fields: [
    { key: 'dispatch_pct', label: 'Dispatch %' },
    { key: 'factoring_pct', label: 'Factoring %' },
  ]},
  { title: 'Inspections', fields: [
    { key: 'inspection_submission_email', label: 'Inspection submission email' },
  ]},
];

// P44: SUPERDRIVE standard percentages, shown pre-filled.
const PAY_FIELDS: { key: string; label: string; def: string }[] = [
  { key: 'linehaul_pct', label: 'Linehaul', def: '72' },
  { key: 'fsc_pct', label: 'Fuel surcharge', def: '72' },
  { key: 'tonu_pct', label: 'TONU', def: '72' },
  { key: 'stopoff_pct', label: 'Stop-off', def: '72' },
  { key: 'loadout_pct', label: 'Loadout', def: '72' },
  { key: 'per_ton_pct', label: 'Per-ton', def: '72' },
  { key: 'other_accessorial_pct', label: 'Other accessorials', def: '72' },
  { key: 'detention_pct', label: 'Detention', def: '100' },
  { key: 'layover_pct', label: 'Layover', def: '100' },
  { key: 'lumper_reimbursement_pct', label: 'Lumper', def: '100' },
];

interface PlanRow { table: string; rows: number; summary: unknown }

export default function CreateCarrierPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pay, setPay] = useState<Record<string, string>>(
    Object.fromEntries(PAY_FIELDS.map((f) => [f.key, f.def])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string | null } | null>(null);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [created, setCreated] = useState<{ company_id: string; invite_sent: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.rpc('is_platform_admin', { _user_id: user.id }).then(({ data, error: e }) => {
      setAllowed(!e && data === true);
    });
  }, [user]);

  if (allowed === null) return null;
  if (!allowed) return <NotFound />;

  const call = async (dryRun: boolean) => {
    setBusy(true); setError(null); setPlan(null); setCreated(null);
    const { data, error: fnErr } = await supabase.functions.invoke('create-carrier', {
      body: { dry_run: dryRun, inputs: { ...values, pay } },
    });
    setBusy(false);
    if (fnErr) {
      let message = fnErr.message; let field: string | null = null;
      try {
        const ctx = (fnErr as { context?: Response }).context;
        const b = ctx ? await ctx.json() : null;
        if (b?.error) { message = b.error; field = b.field ?? null; }
      } catch { /* keep the generic message */ }
      setError({ message, field });
      return;
    }
    if (dryRun) setPlan((data?.plan?.rows ?? []) as PlanRow[]);
    else setCreated({ company_id: data.company_id, invite_sent: !!data.invite_sent });
  };

  const carrierName = values.legal_name?.trim() || 'this carrier';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create a carrier</h1>
          <p className="text-sm text-muted-foreground">
            SUPERDRIVE platform only. "Check only" runs every step and saves nothing.
          </p>
        </div>

        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardHeader><CardTitle className="text-base">{s.title}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {s.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key}>{f.label}{f.optional ? ' (optional)' : ''}</Label>
                  <Input
                    id={f.key}
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    aria-invalid={error?.field === f.key}
                    className={error?.field === f.key ? 'border-destructive' : undefined}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader><CardTitle className="text-base">Driver pay percentages (SUPERDRIVE standard, change if needed)</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {PAY_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`pay-${f.key}`}>{f.label} %</Label>
                <Input id={`pay-${f.key}`} value={pay[f.key]}
                  onChange={(e) => setPay((p) => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          The inspection bonus programme starts off for a new carrier until it sets its own numbers.
        </p>

        {error && (
          <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}{error.field ? ` (field: ${error.field})` : ''}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" disabled={busy} onClick={() => call(true)}>Check only</Button>
          <Button disabled={busy} onClick={() => setConfirmOpen(true)}>Create carrier</Button>
        </div>

        {plan && (
          <Card data-testid="dry-run-plan">
            <CardHeader><CardTitle className="text-base">Check passed — nothing was saved. This would be created:</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {plan.map((r) => (
                  <li key={r.table}>
                    <span className="font-medium">{r.table}</span> — {r.rows} row{r.rows === 1 ? '' : 's'}:{' '}
                    {typeof r.summary === 'string' ? r.summary
                      : Object.entries(r.summary as Record<string, unknown>).map(([k, v]) => `${k} ${v}%`).join(', ')}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {created && (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            {carrierName} was created. {created.invite_sent
              ? 'The owner has been emailed a link to set up their account.'
              : 'The owner invitation email did not go out; the carrier is saved and a link can be re-sent.'}
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create {carrierName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates {carrierName} as a new carrier on SUPERDRIVE, makes{' '}
              {values.owner_email?.trim() || 'the owner'} its owner and emails them a sign-in link.
              It cannot be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); call(false); }}>
              Yes, create {carrierName}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
