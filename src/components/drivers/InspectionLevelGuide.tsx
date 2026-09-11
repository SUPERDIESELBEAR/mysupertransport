import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { INSPECTION_LEVEL_INFO } from './roadsideStopTypes';
import { DEFAULT_BONUS_AMOUNTS, bonusAmountForLevel } from '@/lib/inspectionBonus';

interface Props {
  /** Show the clean-inspection bonus amount next to each level. */
  showBonus?: boolean;
  className?: string;
}

/**
 * Collapsible plain-language reference for inspection Levels I, II and III.
 * Shared by the roadside stop form, the bonus review queue and the driver's
 * own roadside list so everyone reads the same definition.
 */
export default function InspectionLevelGuide({ showBonus = true, className = '' }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border border-border rounded-lg bg-muted/20 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Info className="h-3.5 w-3.5 text-gold" />
          What is a Level I, II or III inspection?
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {INSPECTION_LEVEL_INFO.map(info => (
            <div key={info.value} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{info.title}</p>
                {showBonus && (
                  <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                    ${bonusAmountForLevel(info.value, DEFAULT_BONUS_AMOUNTS)} clean bonus
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{info.summary}</p>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div>
                  <dt className="inline font-medium text-foreground">What it covers: </dt>
                  <dd className="inline text-muted-foreground">{info.covers}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground">Process: </dt>
                  <dd className="inline text-muted-foreground">{info.process}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground">Worth knowing: </dt>
                  <dd className="inline text-muted-foreground">{info.special}</dd>
                </div>
              </dl>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Clean means zero recorded violations of any kind. A violation that does not put the truck
            out of service still counts against the record and does not qualify for the bonus.
          </p>
        </div>
      )}
    </div>
  );
}
