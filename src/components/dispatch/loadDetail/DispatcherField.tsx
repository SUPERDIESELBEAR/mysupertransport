import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { fetchDispatcherOptions, setLoadDispatcher } from '@/lib/loadDetail';
import { getDbErrorMessage, logDbError } from '@/lib/dbError';

const NONE = '__none__';

interface Props {
  loadId: string;
  dispatcherId: string | null;
  dispatcherName: string | null;
}

/**
 * Management/owner-only editor for `loads.dispatcher_id`.
 * Unassigned is an explicit state, both to read and to choose.
 */
export default function DispatcherField({ loadId, dispatcherId, dispatcherName }: Props) {
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: options, isLoading } = useQuery({
    queryKey: ['dispatcher-options'],
    queryFn: fetchDispatcherOptions,
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: (value: string | null) => setLoadDispatcher(loadId, value),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['load-detail', loadId] });
      queryClient.invalidateQueries({ queryKey: ['load-change-history', loadId] });
      toast({ title: 'Dispatcher updated' });
    },
    onError: (err) => {
      logDbError('set_load_dispatcher', err);
      toast({
        title: 'Could not change the dispatcher',
        description: getDbErrorMessage(err, 'The change was not saved.'),
        variant: 'destructive',
      });
    },
  });

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={dispatcherName ? undefined : 'text-muted-foreground'}>
          {dispatcherName ?? 'Unassigned'}
        </span>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
          {dispatcherName ? 'Change' : 'Assign Dispatcher'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        defaultValue={dispatcherId ?? NONE}
        onValueChange={(v) => save.mutate(v === NONE ? null : v)}
        disabled={save.isPending}
      >
        <SelectTrigger className="h-8 w-56 text-xs">
          <SelectValue placeholder={isLoading ? 'Loading…' : 'Select a dispatcher'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unassigned</SelectItem>
          {(options ?? []).map(o => (
            <SelectItem key={o.profileId} value={o.profileId}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {save.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  );
}
