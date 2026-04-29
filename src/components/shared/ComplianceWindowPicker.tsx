import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Bell } from 'lucide-react';
import {
  COMPLIANCE_WINDOW_OPTIONS,
  useComplianceWindow,
  type ComplianceWindowDays,
} from '@/hooks/useComplianceWindow';

interface ComplianceWindowPickerProps {
  /** Optional className applied to the trigger */
  className?: string;
  /** Hide the leading bell icon (defaults to false) */
  hideIcon?: boolean;
}

/**
 * Lets staff choose how far ahead (30 / 60 / 90 days) compliance "warning"
 * alerts begin to appear. Expired and critical (≤7d) tiers are always shown.
 */
export function ComplianceWindowPicker({ className, hideIcon }: ComplianceWindowPickerProps) {
  const { windowDays, setWindowDays } = useComplianceWindow();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-2">
            {!hideIcon && <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
            <Select
              value={String(windowDays)}
              onValueChange={(v) => setWindowDays(Number(v) as ComplianceWindowDays)}
            >
              <SelectTrigger className={className ?? 'h-8 w-[148px] text-xs'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPLIANCE_WINDOW_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    Within {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[240px] text-center">
          How far ahead "warning" alerts appear. Expired and critical (≤7 days) items always show.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}