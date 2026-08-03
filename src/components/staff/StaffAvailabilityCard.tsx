import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, Search, UserCheck, Bell } from 'lucide-react';
import { getDesktopNotifPreference, setDesktopNotifPreference } from '@/hooks/useDesktopNotifications';

const SOUND_KEY = 'superdrive_messages_sound_enabled';
const DEFAULT_VIEW_KEY = 'superdrive_messages_default_view';

type Mode = 'all_drivers' | 'specific_drivers' | 'none';

interface DriverRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  unit_number: string | null;
}

interface AutoRow {
  driver_id: string;
  full_name: string | null;
  unit_number: string | null;
  source: 'assigned_onboarding' | 'assigned_dispatcher';
  suppressed: boolean;
}

function sourceLabel(s: AutoRow['source']) {
  return s === 'assigned_dispatcher' ? 'Assigned as dispatcher' : 'Assigned as onboarding lead';
}

/**
 * Lets a staff member control whether drivers can start messages with them,
 * pick specific drivers when in "specific_drivers" mode, and opt-out of
 * auto-inclusion for individual drivers they lead as dispatcher/onboarding.
 */
export default function StaffAvailabilityCard() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('none');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Specific drivers picker state
  const [allDrivers, setAllDrivers] = useState<DriverRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [pickerSearch, setPickerSearch] = useState('');

  // Auto-assigned drivers + suppressions
  const [autoRows, setAutoRows] = useState<AutoRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: settings }, { data: contacts }, { data: drivers }, { data: auto }] = await Promise.all([
        supabase
          .from('staff_messaging_settings')
          .select('availability_mode, availability_note')
          .eq('staff_id', user.id)
          .maybeSingle(),
        supabase
          .from('driver_staff_contacts')
          .select('driver_id')
          .eq('staff_id', user.id),
        supabase
          .from('operators')
          .select('user_id, unit_number')
          .eq('is_active', true)
          .not('user_id', 'is', null),
        supabase.rpc('list_staff_auto_assigned_drivers', { _staff: user.id }),
      ]);
      if (settings) {
        setMode(settings.availability_mode as Mode);
        setNote(settings.availability_note ?? '');
      }
      const ids = new Set<string>((contacts ?? []).map((r: any) => r.driver_id));
      setSelectedIds(new Set(ids));
      setInitialIds(new Set(ids));
      const driverIds = (drivers ?? []).map((r: any) => r.user_id).filter(Boolean) as string[];
      const { data: profs } = driverIds.length
        ? await supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', driverIds)
        : { data: [] as any[] };
      const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.user_id, p]));
      const rows: DriverRow[] = (drivers ?? []).map((r: any) => ({
        user_id: r.user_id,
        unit_number: r.unit_number ?? null,
        first_name: profMap.get(r.user_id)?.first_name ?? null,
        last_name: profMap.get(r.user_id)?.last_name ?? null,
      })).sort((a, b) =>
        `${a.first_name ?? ''} ${a.last_name ?? ''}`.localeCompare(`${b.first_name ?? ''} ${b.last_name ?? ''}`)
      );
      setAllDrivers(rows);
      setAutoRows(((auto ?? []) as AutoRow[]));
      setLoading(false);
    })();
  }, [user?.id]);

  const filteredDrivers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return allDrivers;
    return allDrivers.filter((d) => {
      const name = `${d.first_name ?? ''} ${d.last_name ?? ''}`.toLowerCase();
      const unit = (d.unit_number ?? '').toLowerCase();
      return name.includes(q) || unit.includes(q);
    });
  }, [allDrivers, pickerSearch]);

  function toggleDriver(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function toggleAutoSuppression(row: AutoRow, includeOn: boolean) {
    if (!user?.id) return;
    // includeOn = ON means NOT suppressed
    if (includeOn) {
      const { error } = await supabase
        .from('driver_staff_contact_suppressions')
        .delete()
        .eq('staff_id', user.id)
        .eq('driver_id', row.driver_id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase
        .from('driver_staff_contact_suppressions')
        .insert({ staff_id: user.id, driver_id: row.driver_id, created_by: user.id });
      if (error) { toast.error(error.message); return; }
    }
    setAutoRows((prev) => prev.map((r) => r.driver_id === row.driver_id ? { ...r, suppressed: !includeOn } : r));
  }

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);

    // 1. Upsert settings
    const { error: settingsErr } = await supabase.from('staff_messaging_settings').upsert({
      staff_id: user.id,
      availability_mode: mode,
      availability_note: note || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (settingsErr) { setSaving(false); toast.error(settingsErr.message); return; }

    // 2. If in specific_drivers, diff and sync driver_staff_contacts
    if (mode === 'specific_drivers') {
      const toAdd = [...selectedIds].filter((id) => !initialIds.has(id));
      const toRemove = [...initialIds].filter((id) => !selectedIds.has(id));
      if (toAdd.length) {
        const rows = toAdd.map((driver_id) => ({ driver_id, staff_id: user.id, created_by: user.id }));
        const { error } = await supabase.from('driver_staff_contacts').insert(rows);
        if (error) { setSaving(false); toast.error(error.message); return; }
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from('driver_staff_contacts')
          .delete()
          .eq('staff_id', user.id)
          .in('driver_id', toRemove);
        if (error) { setSaving(false); toast.error(error.message); return; }
      }
      setInitialIds(new Set(selectedIds));
    }

    setSaving(false);
    toast.success('Availability updated');
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">My Availability to Drivers</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        This only limits which drivers can start a new conversation with you. Messages you send always
        reach the driver, existing threads and history stay open, and other management staff can
        always reach you.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Which drivers can start a conversation with me?</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={loading}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None — I'll start the conversation (default)</SelectItem>
            <SelectItem value="specific_drivers">Only drivers I choose</SelectItem>
            <SelectItem value="all_drivers">Any active driver</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'specific_drivers' && (
        <div className="space-y-2 rounded-md border border-border p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Select drivers</Label>
            <span className="text-[11px] text-muted-foreground">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or unit…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded border border-border bg-background divide-y divide-border/60">
            {filteredDrivers.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">No drivers match.</div>
            ) : filteredDrivers.map((d) => {
              const label = `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || 'Driver';
              const checked = selectedIds.has(d.user_id);
              return (
                <label key={d.user_id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleDriver(d.user_id, v === true)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{label}</p>
                    {d.unit_number && (
                      <p className="text-[11px] text-muted-foreground">Unit {d.unit_number}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Short note (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={140}
          placeholder="e.g. Dispatch questions only, M–F 8a–5p CT"
          className="text-sm"
        />
      </div>

      <Button size="sm" onClick={save} disabled={saving || loading}>
        {saving ? 'Saving…' : 'Save'}
      </Button>

      {/* Auto-assigned drivers (independent of mode / save) */}
      <div className="pt-2 border-t border-border space-y-2">
        <div className="flex items-center gap-1.5">
          <UserCheck className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Auto-assigned drivers</h4>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Drivers you lead as dispatcher or onboarding coordinator automatically see you in their
          Contacts. Toggle off if you no longer want to appear in a specific driver's list —
          existing message history stays intact.
        </p>
        {autoRows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No drivers are auto-assigned to you.</p>
        ) : (
          <ul className="rounded-md border border-border divide-y divide-border/60 bg-background">
            {autoRows.map((row) => {
              const includeOn = !row.suppressed;
              return (
                <li key={`${row.driver_id}:${row.source}`} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {row.full_name || 'Driver'}
                      {row.unit_number && (
                        <span className="text-[11px] font-normal text-muted-foreground ml-1.5">
                          Unit {row.unit_number}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{sourceLabel(row.source)}</p>
                  </div>
                  <Switch
                    checked={includeOn}
                    onCheckedChange={(v) => toggleAutoSuppression(row, v)}
                    aria-label={`Auto-include for ${row.full_name}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      <AlertsSection />
    </Card>
  );
}

/** Local, per-browser message alert preferences. */
function AlertsSection() {
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'false'; } catch { return true; }
  });
  const [desktop, setDesktop] = useState(() => getDesktopNotifPreference());
  const [unreadFirst, setUnreadFirst] = useState(() => {
    try { return localStorage.getItem(DEFAULT_VIEW_KEY) === 'unread'; } catch { return false; }
  });

  return (
    <div className="space-y-3 pt-4 mt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Alerts</h4>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Sound on new message</p>
          <p className="text-[11px] text-muted-foreground">Plays a short chime when a message arrives.</p>
        </div>
        <Switch
          checked={sound}
          onCheckedChange={(v) => {
            setSound(v);
            try { localStorage.setItem(SOUND_KEY, String(v)); } catch { /* ignore */ }
            toast.success(v ? 'Message sound on' : 'Message sound off');
          }}
          aria-label="Sound on new message"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Desktop notifications</p>
          <p className="text-[11px] text-muted-foreground">Alerts you when the SUPERDRIVE tab is in the background.</p>
        </div>
        <Switch
          checked={desktop}
          onCheckedChange={(v) => {
            setDesktop(v);
            setDesktopNotifPreference(v);
            toast.success(v ? 'Desktop notifications on' : 'Desktop notifications off');
          }}
          aria-label="Desktop notifications"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Open Messages on Unread</p>
          <p className="text-[11px] text-muted-foreground">Start with the Unread filter instead of All.</p>
        </div>
        <Switch
          checked={unreadFirst}
          onCheckedChange={(v) => {
            setUnreadFirst(v);
            try { localStorage.setItem(DEFAULT_VIEW_KEY, v ? 'unread' : 'all'); } catch { /* ignore */ }
          }}
          aria-label="Open Messages on Unread"
        />
      </div>
    </div>
  );
}