import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

/**
 * Number input with a non-interactive "$" prefix. The stored value is still
 * numeric/plain text — the prefix is decoration only.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
        $
      </span>
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cn('pl-7', className)}
        {...props}
      />
    </div>
  ),
);
CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
