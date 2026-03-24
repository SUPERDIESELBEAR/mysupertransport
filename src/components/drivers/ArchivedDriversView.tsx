import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, Users2, RefreshCw, ArrowRight, Phone, RotateCcw, Archive, CalendarDays, Loader2, MessageSquare } from 'lucide-react';

interface ArchivedDriver {
  operator_id: string;
  operator_user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  unit_number: string | null;
  cdl_expiration: string | null;
  medical_cert_expiration: string | null;
  fully_onboarded: boolean | null;
  deactivated_at: string | null; // we use updated_at as proxy
  deactivate_reason: string | null;
}

interface ArchivedDriversViewProps {
  onOpenDriver: (operatorId: string) => void;
  onMessageDriver?: (userId: string) => void;
  /** Called after a driver is reactivated so parent can refresh counts */
  onReactivated?: () => void;
}

export default function ArchivedDriversView({ onOpenDriver, onMessageDriver, onReactivated }: ArchivedDriversViewProps) {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<ArchivedDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmReactivate, setConfirmReactivate] = useState<ArchivedDriver | null>(null);
  const [reactivating, setReactivating] = useState(false);

  const fetchArchived = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const { data: rawData } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        unit_number,
        updated_at,
        onboarding_status (fully_onboarded, unit_number),
        applications (first_name, last_name, phone, address_state, cdl_expiration, medical_cert_expiration)
      `)
      .eq('is_active', false);

    if (rawData) {
      const operatorIds = (rawData as any[]).map((op: any) => op.id).filter(Boolean);
      const userIds = (rawData as any[]).map((op: any) => op.user_id).filter(Boolean);

      // Fetch profiles
      const profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, phone, home_state')
          .in('user_id', userIds);
        (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      // Fetch most-recent operator_deactivated audit log entry per operator for reason
      const reasonMap: Record<string, string | null> = {};
      if (operatorIds.length > 0) {
        const { data: auditRows } = await supabase
          .from('audit_log' as any)
          .select('entity_id, metadata, created_at')
          .eq('action', 'operator_deactivated')
          .in('entity_id', operatorIds)
          .order('created_at', { ascending: false });
        // Keep only the latest entry per operator
        (auditRows as any[] ?? []).forEach((row: any) => {
          if (row.entity_id && !(row.entity_id in reasonMap)) {
            reasonMap[row.entity_id] = (row.metadata as any)?.reason ?? null;
          }
        });
      }

      const getOne = (val: any) => (Array.isArray(val) ? val[0] : val) ?? null;

      const mapped: ArchivedDriver[] = (rawData as any[]).map(op => {
        const os = getOne(op.onboarding_status);
        const app = getOne(op.applications);
        const profile = profileMap[op.user_id] ?? {};
        return {
          operator_id: op.id,
          operator_user_id: op.user_id,
          first_name: profile.first_name ?? app?.first_name ?? null,
          last_name: profile.last_name ?? app?.last_name ?? null,
          phone: profile.phone ?? app?.phone ?? null,
          home_state: profile.home_state ?? app?.address_state ?? null,
          unit_number: os?.unit_number ?? op.unit_number ?? null,
          cdl_expiration: app?.cdl_expiration ?? null,
          medical_cert_expiration: app?.medical_cert_expiration ?? null,
          fully_onboarded: os?.fully_onboarded ?? null,
          deactivated_at: op.updated_at ?? null,
          deactivate_reason: reasonMap[op.id] ?? null,
        };
      }).sort((a, b) => {
        // Most recently deactivated first
        if (!a.deactivated_at) return 1;
        if (!b.deactivated_at) return -1;
        return new Date(b.deactivated_at).getTime() - new Date(a.deactivated_at).getTime();
      });

      setDrivers(mapped);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const handleReactivate = async () => {
    if (!confirmReactivate) return;
    setReactivating(true);
    const { error } = await supabase
      .from('operators')
      .update({ is_active: true })
      .eq('id', confirmReactivate.operator_id);

    if (error) {
      toast({ title: 'Error', description: 'Could not reactivate driver.', variant: 'destructive' });
    } else {
      // Audit log
      await supabase.from('audit_log').insert({
        entity_type: 'operator',
        entity_id: confirmReactivate.operator_id,
        entity_label: [confirmReactivate.first_name, confirmReactivate.last_name].filter(Boolean).join(' ') || 'Unknown',
        action: 'operator_reactivated',
      });
      const name = [confirmReactivate.first_name, confirmReactivate.last_name].filter(Boolean).join(' ') || 'Driver';
      toast({ title: `${name} reactivated`, description: 'Driver has been moved back to the active roster.' });
      setConfirmReactivate(null);
      fetchArchived(true);
      onReactivated?.();
    }
    setReactivating(false);
  };

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    return !q ||
      `${d.first_name ?? ''} ${d.last_name ?? ''}`.toLowerCase().includes(q) ||
      (d.unit_number ?? '').toLowerCase().includes(q) ||
      (d.phone ?? '').includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Context banner */}
      <div className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 border border-border bg-muted/30 text-xs text-muted-foreground">
        <Archive className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
        <span>
          Archived drivers have been deactivated and are hidden from the active roster and dispatch. All records, history, and documents are preserved. Management can reactivate at any time.
        </span>
      </div>

      {/* Search + refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search archived drivers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchArchived(true)} disabled={refreshing} className="gap-1.5 shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Count */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Archive className="h-3.5 w-3.5" />
        <strong className="text-foreground">{filtered.length}</strong> archived driver{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== drivers.length && ` (of ${drivers.length})`}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-border rounded-xl">
          <Archive className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No archived drivers</p>
          <p className="text-xs text-muted-foreground mt-1">
            {drivers.length === 0
              ? 'Deactivated drivers will appear here.'
              : 'No drivers match your search.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-20">Unit #</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">State</TableHead>
                <TableHead className="hidden lg:table-cell">Onboarding</TableHead>
                <TableHead className="hidden xl:table-cell">Deactivated</TableHead>
                <TableHead className="w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(driver => {
                const name = [driver.first_name, driver.last_name].filter(Boolean).join(' ') || 'Unknown Driver';
                const initials = [driver.first_name?.[0], driver.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';

                return (
                  <TableRow
                    key={driver.operator_id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors opacity-75 hover:opacity-100"
                    onClick={() => onOpenDriver(driver.operator_id)}
                  >
                    {/* Unit */}
                    <TableCell>
                      <span className="font-mono text-sm font-semibold text-muted-foreground">
                        {driver.unit_number ?? <span className="text-muted-foreground/50 text-xs">—</span>}
                      </span>
                    </TableCell>

                    {/* Name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border">
                          <span className="text-xs font-bold text-muted-foreground">{initials}</span>
                        </div>
                        <div>
                          <span className="font-medium text-sm text-foreground">{name}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground/70 leading-relaxed">
                              Inactive
                            </Badge>
                            {driver.deactivate_reason && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/20 text-muted-foreground/50 leading-relaxed">
                                {driver.deactivate_reason}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Phone */}
                    <TableCell className="hidden sm:table-cell">
                      {driver.phone
                        ? <a href={`tel:${driver.phone}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1" onClick={e => e.stopPropagation()}><Phone className="h-3 w-3" />{driver.phone}</a>
                        : <span className="text-muted-foreground/50 text-xs">—</span>}
                    </TableCell>

                    {/* State */}
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{driver.home_state ?? '—'}</span>
                    </TableCell>

                    {/* Onboarding status */}
                    <TableCell className="hidden lg:table-cell">
                      {driver.fully_onboarded
                        ? <Badge className="status-complete border text-xs">Fully Onboarded</Badge>
                        : <Badge className="status-neutral border text-xs">Incomplete</Badge>}
                    </TableCell>

                    {/* Deactivated date */}
                    <TableCell className="hidden xl:table-cell">
                      {driver.deactivated_at ? (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <CalendarDays className="h-3 w-3" />
                                {format(parseISO(driver.deactivated_at), 'MMM d, yyyy')}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-0.5">
                                <div>{format(parseISO(driver.deactivated_at), 'MMMM d, yyyy · h:mm a')}</div>
                                {driver.deactivate_reason && (
                                  <div className="text-muted-foreground">Reason: {driver.deactivate_reason}</div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {onMessageDriver && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Message driver"
                            onClick={() => onMessageDriver(driver.operator_user_id)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-primary/70 hover:text-primary hover:bg-primary/10"
                                onClick={() => setConfirmReactivate(driver)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">Reactivate driver</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="View full profile"
                          onClick={() => onOpenDriver(driver.operator_id)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reactivate Confirmation */}
      <AlertDialog open={!!confirmReactivate} onOpenChange={open => { if (!open && !reactivating) setConfirmReactivate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              Reactivate Driver
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{[confirmReactivate?.first_name, confirmReactivate?.last_name].filter(Boolean).join(' ') || 'This driver'}</strong> will be moved back to the active roster and become visible to dispatchers. All existing records and history will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reactivating}
              onClick={e => { e.preventDefault(); handleReactivate(); }}
              className="gap-2"
            >
              {reactivating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Reactivating…</>
              ) : (
                <><RotateCcw className="h-3.5 w-3.5" />Reactivate Driver</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
