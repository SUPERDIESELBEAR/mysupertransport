import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, ExternalLink, FileUp } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import LoadStatusBadge from '@/components/dispatch/LoadStatusBadge';
import type { LoadStatus } from '@/lib/loadFormat';
import { stopSummary, type DuplicateMatch } from '@/lib/duplicateBrokerRef';

interface Props {
  open: boolean;
  matches: DuplicateMatch[];
  reference: string;
  /** Whether the "update the existing load instead" path can carry a file over. */
  canRevise: boolean;
  onOpenChange: (open: boolean) => void;
  onViewExisting: (loadId: string) => void;
  onUpdateExisting: (loadId: string) => void;
  /** Proceed with the new load, recording the override against this load. */
  onCreateAnyway: (existingLoadId: string, reason: string) => void;
  /** Hide the create-anyway block when the check ran before the dispatcher saved. */
  createLabel?: string;
}

const dateFmt = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * A duplicate broker reference is usually a mistake, but not always — so this
 * warns and offers the three sensible ways out. It never blocks the save.
 */
export default function DuplicateBrokerRefDialog({
  open, matches, reference, canRevise, onOpenChange,
  onViewExisting, onUpdateExisting, onCreateAnyway, createLabel = 'Create anyway',
}: Props) {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (open) {
      setReason('');
      setSelected(matches[0]?.load.id ?? '');
    }
  }, [open, matches]);

  const probableOnly = matches.length > 0 && matches.every(m => m.confidence === 'probable');
  const target = matches.find(m => m.load.id === selected) ?? matches[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-gold" />
            {probableOnly
              ? 'A load may already exist for this rate confirmation'
              : 'A load already exists for this broker reference'}
          </DialogTitle>
          <DialogDescription>
            {probableOnly
              ? `Broker reference ${reference} is already on the load below, under a broker whose name matches the document. The broker on this load has not been linked yet, so this match is not certain.`
              : `Broker reference ${reference} is already on the load below for the same broker.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {matches.map(({ load, confidence }) => {
            const active = load.id === selected;
            return (
              <button
                key={load.id}
                type="button"
                onClick={() => setSelected(load.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  active ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/50'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {load.load_number}
                  </span>
                  <LoadStatusBadge status={load.status as LoadStatus} />
                  {confidence === 'probable' ? (
                    <Badge variant="outline" className="border-gold/40 bg-gold/10 text-xs">
                      Name match only
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {load.broker_name ? `${load.broker_name} · ` : ''}
                  Created {dateFmt(load.created_at)}
                  {load.created_by_name ? ` by ${load.created_by_name}` : ''}
                </p>
                {load.stops.length ? (
                  <p className="mt-1 text-xs text-foreground">{stopSummary(load.stops)}</p>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!target}
              onClick={() => target && onViewExisting(target.load.id)}
            >
              <ExternalLink className="h-4 w-4" />
              View existing load
            </Button>
            {canRevise ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-gold text-surface-dark hover:bg-gold-light"
                disabled={!target}
                onClick={() => target && onUpdateExisting(target.load.id)}
              >
                <FileUp className="h-4 w-4" />
                Update existing load instead
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {canRevise
              ? 'Updating applies this rate confirmation to the existing load as a revision — usually the right move when a broker reissues a rate con. The file you uploaded is carried over.'
              : 'Upload a rate confirmation first to apply it to the existing load as a revision.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duplicate-reason">
            Reason for creating a second load (required)
          </Label>
          <Textarea
            id="duplicate-reason"
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Broker split this into two loads under the same reference."
          />
          <p className="text-xs text-muted-foreground">
            This is written to both loads&rsquo; change history so the relationship is
            visible from either one later.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={!target || !reason.trim()}
            onClick={() => target && onCreateAnyway(target.load.id, reason.trim())}
          >
            {createLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
