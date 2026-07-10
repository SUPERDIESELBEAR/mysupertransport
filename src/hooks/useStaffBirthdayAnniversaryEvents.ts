import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { earlyWarnDateFor, isSameYMD } from '@/lib/birthdayAnniversary/holidays';

export type EventKind = 'birthday' | 'anniversary';

export interface BdayAnnivEvent {
  id: string;                 // stable key: operatorId:kind:YYYY-MM-DD
  kind: EventKind;
  operatorId: string;
  userId: string | null;      // driver's auth user id (for in-app notification)
  firstName: string;
  lastName: string;
  email: string | null;
  avatarUrl: string | null;
  actualDate: Date;           // this year's calendar date, local midnight
  actualDateISO: string;      // YYYY-MM-DD
  isEarly: boolean;           // true when today < actualDate
  years?: number;             // for anniversary
}

// Anchor a YYYY-MM-DD string at local noon to avoid TZ drift. Also accepts
// full ISO strings (returns null when unparseable).
function parseDateOnly(v: string | null | undefined): Date | null {
  if (!v) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// "Today" in US Central Time as a local Date at noon of that Y/M/D.
function todayInCentral(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface OperatorRow {
  id: string;
  user_id: string | null;
  applications: { email: string | null; first_name: string | null; last_name: string | null; dob: string | null; avatar_url?: string | null } | null;
  onboarding_status: { go_live_date: string | null } | null;
}

export function useStaffBirthdayAnniversaryEvents() {
  const { user, isStaff } = useAuth();
  const [events, setEvents] = useState<BdayAnnivEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user || !isStaff) {
      setEvents([]);
      return;
    }
    setLoading(true);
    try {
      const today = todayInCentral();
      const currentYear = today.getFullYear();

      const { data: operators } = await supabase
        .from('operators')
        .select(`
          id,
          user_id,
          applications!inner ( email, first_name, last_name, dob ),
          onboarding_status!inner ( go_live_date )
        `)
        .eq('is_active', true);

      // Fetch profile avatars for enrichment (best-effort).
      const userIds = ((operators ?? []) as unknown as OperatorRow[])
        .map((o) => o.user_id)
        .filter((v): v is string => !!v);
      let avatars = new Map<string, string | null>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, avatar_url')
          .in('user_id', userIds);
        for (const p of profs ?? []) avatars.set((p as any).user_id, (p as any).avatar_url ?? null);
      }

      // Fetch this user's acks whose event_date falls in the current year.
      const { data: acks } = await supabase
        .from('staff_event_acknowledgments')
        .select('operator_id, event_type, event_date')
        .eq('user_id', user.id)
        .gte('event_date', `${currentYear}-01-01`)
        .lte('event_date', `${currentYear}-12-31`);
      const ackKey = new Set(
        (acks ?? []).map((a: any) => `${a.operator_id}:${a.event_type}:${a.event_date}`),
      );

      const list: BdayAnnivEvent[] = [];

      for (const op of ((operators ?? []) as unknown as OperatorRow[])) {
        const app = op.applications;
        if (!app) continue;
        const firstName = (app.first_name ?? '').trim() || 'Driver';
        const lastName = (app.last_name ?? '').trim();

        const pushEvent = (kind: EventKind, srcDate: Date, years?: number) => {
          const actual = new Date(currentYear, srcDate.getMonth(), srcDate.getDate(), 12, 0, 0);
          const warn = earlyWarnDateFor(actual);
          // Show only if today is between warn date and actual date (inclusive).
          if (today < warn) return;
          if (today > actual) return;
          const iso = ymd(actual);
          if (ackKey.has(`${op.id}:${kind}:${iso}`)) return;
          list.push({
            id: `${op.id}:${kind}:${iso}`,
            kind,
            operatorId: op.id,
            userId: op.user_id,
            firstName,
            lastName,
            email: app.email ?? null,
            avatarUrl: op.user_id ? avatars.get(op.user_id) ?? null : null,
            actualDate: actual,
            actualDateISO: iso,
            isEarly: !isSameYMD(today, actual),
            years,
          });
        };

        const dob = parseDateOnly(app.dob);
        if (dob) pushEvent('birthday', dob);

        const goLive = parseDateOnly(op.onboarding_status?.go_live_date);
        if (goLive && goLive.getFullYear() < currentYear) {
          pushEvent('anniversary', goLive, currentYear - goLive.getFullYear());
        }
      }

      // Sort: today first, then earliest upcoming date, then name.
      list.sort((a, b) => {
        if (a.isEarly !== b.isEarly) return a.isEarly ? 1 : -1;
        if (a.actualDateISO !== b.actualDateISO) return a.actualDateISO < b.actualDateISO ? -1 : 1;
        return a.firstName.localeCompare(b.firstName);
      });
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }, [user, isStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = useCallback(async (ev: BdayAnnivEvent) => {
    if (!user) return;
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    await supabase.from('staff_event_acknowledgments').insert({
      user_id: user.id,
      operator_id: ev.operatorId,
      event_type: ev.kind,
      event_date: ev.actualDateISO,
    });
  }, [user]);

  return useMemo(() => ({ events, loading, refetch: load, acknowledge }), [events, loading, load, acknowledge]);
}