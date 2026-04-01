import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function formatDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function displayToStorage(display: string): string | null {
  if (display.length !== 10) return null;
  const parsed = parse(display, 'MM/dd/yyyy', new Date());
  if (!isValid(parsed)) return null;
  return format(parsed, 'yyyy-MM-dd');
}

function storageToDisplay(storage: string): string {
  if (!storage) return '';
  try {
    const parsed = parse(storage, 'yyyy-MM-dd', new Date());
    if (!isValid(parsed)) return '';
    return format(parsed, 'MM/dd/yyyy');
  } catch {
    return '';
  }
}

interface DateInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  /** Use "app" variant for application form styling, "default" for shadcn Input styling */
  variant?: 'default' | 'app';
  placeholder?: string;
}

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  error,
  variant = 'default',
  placeholder = 'MM/DD/YYYY',
}: DateInputProps) {
  const [display, setDisplay] = useState(() => storageToDisplay(value));
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    const newDisplay = storageToDisplay(value);
    setDisplay(prev => {
      // Only update if the storage value actually changed
      const currentStorage = displayToStorage(prev);
      if (currentStorage === value) return prev;
      return newDisplay;
    });
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatDateMask(e.target.value);
    setDisplay(masked);
    const iso = displayToStorage(masked);
    if (iso) {
      onChange(iso);
    } else if (masked === '') {
      onChange('');
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const iso = format(date, 'yyyy-MM-dd');
      setDisplay(format(date, 'MM/dd/yyyy'));
      onChange(iso);
    }
    setOpen(false);
  };

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const validSelected = selectedDate && isValid(selectedDate) ? selectedDate : undefined;

  const inputClasses = variant === 'app'
    ? cn(
        'w-full pl-3 pr-10 py-2.5 rounded-lg border text-sm bg-white text-foreground transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold',
        'placeholder:text-muted-foreground/60',
        error ? 'border-destructive' : 'border-border',
        className
      )
    : cn(
        'flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-10 py-2 text-base ring-offset-background',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        error ? 'border-destructive' : '',
        className
      );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClasses}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={validSelected}
            onSelect={handleCalendarSelect}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
