import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { FlaskConical, Loader2, Plus, RotateCcw, UserCheck, Undo2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useShowDemo } from '@/hooks/useShowDemo';
import DemoAccountBadge from '@/components/DemoAccountBadge';
import ShowDemoToggle from '@/components/ShowDemoToggle';

const SCENARIOS = [
  { value: 'blank', label: 'Blank (nothing started)' },
  { value: 'new_applicant', label: 'New applicant (submitted)' },
  { value: 'mid_onboarding', label: 'Mid-onboarding' },
  { value: 'fully_live', label: 'Fully live' },
  { value: 'offboarding', label: 'Offboarding' },
];

interface DemoRow {
  id: string;
  unit_number: string | null;
  demo_label: string | null;
  demo_scenario: string | null;
  is_active: boolean | null;
  applications: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface LiveDriverRow {
  id: string;
  user_id: string | null;
  unit_number: string | null;
  is_active: boolean | null;
  applications: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

export default function DemoAccountsPanel() {
  const { showDemo, setShowDemo } = useShowDemo();
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [convertOpen, setConvertOpen] = useState(false);
  const [liveDrivers, setLiveDrivers] = useState<LiveDriverRow[]>([]);
  const [ownerUserIds, setOwnerUserIds] = useState<string[]>([]);
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [convertLabel, setConvertLabel] = useState('');
  const [revertRow, setRevertRow] = useState<DemoRow | null>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', unitNumber: '', demoLabel: '', scenario: 'mid_onboarding',
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('operators')
      .select('id, unit_number, demo_label, demo_scenario, is_active, applications (first_name, last_name, email)')
      .eq('is_demo', true)
      .order('created_at', { ascending: false });
    setRows((data as any[] ?? []) as DemoRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const openConvert = useCallback(async () => {
    setConvertOpen(true);
    setSelectedDriverId(null);
    setDriverSearch('');
    setConvertLabel('');
    const [{ data: drivers }, { data: owners }] = await Promise.all([
      supabase
        .from('operators')
        .select('id, user_id, unit_number, is_active, applications (first_name, last_name, email)')
        .eq('is_demo', false)
        .order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id').eq('role', 'owner'),
    ]);
    setLiveDrivers((drivers as any[] ?? []) as LiveDriverRow[]);
    setOwnerUserIds(((owners as any[]) ?? []).map(r => r.user_id));
  }, []);

  const setDemoFlag = async (operatorId: string, isDemo: boolean, demoLabel?: string | null) => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('set-demo-flag', {
      body: { operatorId, isDemo, demoLabel: demoLabel ?? null },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast({
        title: isDemo ? 'Could not convert driver' : 'Could not return driver to live',
        description: String((data as any)?.error ?? error?.message),
        variant: 'destructive',
      });
      return false;
    }
    toast({
      title: isDemo ? 'Driver marked as demo' : 'Driver returned to live',
      description: isDemo
        ? 'Their data is untouched — they are now hidden from live views and their email is rerouted.'
        : 'They appear in live views again and receive their own email.',
    });
    if (isDemo && !showDemo) setShowDemo(true);
    fetchRows();
    return true;
  };

  const createDemo = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('provision-demo-driver', {
      body: {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        unitNumber: form.unitNumber || null,
        demoLabel: form.demoLabel || null,
        scenario: form.scenario,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Could not create demo driver', description: String((data as any)?.error ?? error?.message), variant: 'destructive' });
      return;
    }
    toast({ title: 'Demo driver created', description: `${form.firstName} ${form.lastName} is ready for testing.` });
    setCreateOpen(false);
    setForm({ firstName: '', lastName: '', email: '', unitNumber: '', demoLabel: '', scenario: 'mid_onboarding' });
    if (!showDemo) setShowDemo(true);
    fetchRows();
  };

  const resetDemo = async (operatorId: string, scenario: string) => {
    setBusyId(operatorId);
    const { data, error } = await supabase.functions.invoke('reset-demo-driver', {
      body: { operatorId, scenario },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast({ title: 'Reset failed', description: String((data as any)?.error ?? error?.message), variant: 'destructive' });
      return;
    }
    toast({ title: 'Demo driver reset', description: `Scenario set to ${scenario.replace(/_/g, ' ')}.` });
    fetchRows();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-purple-600" />
            Demo Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Sandbox drivers for training and testing. Hidden from live views and never emailed —
            their mail is rerouted to whoever triggered the send.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShowDemoToggle />
          <Button variant="outline" onClick={openConvert}>
            <UserCheck className="h-4 w-4 mr-1.5" /> Convert existing driver
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New demo driver
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading demo accounts…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No demo drivers yet. Create one to start demoing the pipeline safely.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => {
            const app = row.applications;
            const name = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Unnamed demo driver';
            return (
              <Card key={row.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{name}</span>
                      <DemoAccountBadge />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{app?.email ?? '—'}</p>
                    {row.demo_label && (
                      <p className="text-xs text-purple-700 mt-0.5">{row.demo_label}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    Unit {row.unit_number ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    defaultValue={row.demo_scenario ?? 'blank'}
                    onValueChange={(v) => resetDemo(row.id, v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Reset to scenario…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENARIOS.map(s => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => resetDemo(row.id, row.demo_scenario ?? 'blank')}
                  >
                    {busyId === row.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RotateCcw className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Reset wipes this driver's onboarding, documents and dispatch activity, then re-seeds the chosen scenario.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-muted-foreground"
                  onClick={() => setRevertRow(row)}
                >
                  <Undo2 className="h-4 w-4 mr-1.5" /> Return to live
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New demo driver</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First name</Label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email (must be unique)</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unit number</Label>
                <Input value={form.unitNumber} onChange={e => setForm(f => ({ ...f, unitNumber: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Demo label</Label>
                <Input placeholder="e.g. Training — Sept" value={form.demoLabel} onChange={e => setForm(f => ({ ...f, demoLabel: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Starting scenario</Label>
              <Select value={form.scenario} onValueChange={v => setForm(f => ({ ...f, scenario: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={createDemo}
              disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create demo driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert an existing driver into a demo account */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert existing driver to demo</DialogTitle>
            <DialogDescription>
              Nothing is deleted or reset. The driver keeps all of their data — they are simply
              hidden from live rosters, pipeline and compliance (unless "Show demo accounts" is on),
              badged as DEMO, and any email meant for them is rerouted to whoever triggers the send.
              This is reversible at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Search drivers</Label>
              <Input
                placeholder="Name or email…"
                value={driverSearch}
                onChange={e => setDriverSearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {liveDrivers
                .filter(d => {
                  const q = driverSearch.trim().toLowerCase();
                  if (!q) return true;
                  const a = d.applications;
                  return [a?.first_name, a?.last_name, a?.email]
                    .filter(Boolean).join(' ').toLowerCase().includes(q);
                })
                .slice(0, 100)
                .map(d => {
                  const a = d.applications;
                  const name = [a?.first_name, a?.last_name].filter(Boolean).join(' ') || 'Unnamed driver';
                  const selected = selectedDriverId === d.id;
                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => setSelectedDriverId(d.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${selected ? 'bg-muted' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {d.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{a?.email ?? '—'}</p>
                    </button>
                  );
                })}
              {liveDrivers.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground">Loading drivers…</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Demo label (optional)</Label>
              <Input
                placeholder="e.g. Training — Sept"
                value={convertLabel}
                onChange={e => setConvertLabel(e.target.value)}
              />
            </div>
            {selectedDriverId && ownerUserIds.includes(
              liveDrivers.find(d => d.id === selectedDriverId)?.user_id ?? ''
            ) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  This is an <strong>owner</strong> account. Marking it demo hides it from staff-facing
                  driver lists and reroutes its email. Continue only if that's intended.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedDriverId || saving}
              onClick={async () => {
                const okDone = await setDemoFlag(selectedDriverId!, true, convertLabel.trim() || null);
                if (okDone) setConvertOpen(false);
              }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Mark as demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return a demo account to live */}
      <Dialog open={!!revertRow} onOpenChange={(o) => !o && setRevertRow(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return this driver to live?</DialogTitle>
            <DialogDescription>
              The demo flag and label are removed. All of the driver's data stays exactly as it is —
              they will reappear in live rosters, pipeline and compliance, and email will be sent to
              them directly again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertRow(null)}>Cancel</Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const okDone = await setDemoFlag(revertRow!.id, false);
                if (okDone) setRevertRow(null);
              }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Return to live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
