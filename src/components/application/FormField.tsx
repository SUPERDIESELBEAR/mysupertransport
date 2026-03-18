import { ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, required, error, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const AppInput = forwardRef<HTMLInputElement, InputProps>(({ error, className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        'w-full px-3 py-2.5 rounded-lg border text-sm bg-white text-foreground transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold',
        'placeholder:text-muted-foreground/60',
        error ? 'border-destructive' : 'border-border',
        className
      )}
    />
  );
});
AppInput.displayName = 'AppInput';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const AppSelect = forwardRef<HTMLSelectElement, SelectProps>(({ error, className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      {...props}
      className={cn(
        'w-full px-3 py-2.5 rounded-lg border text-sm bg-white text-foreground transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold',
        error ? 'border-destructive' : 'border-border',
        className
      )}
    >
      {children}
    </select>
  );
});
AppSelect.displayName = 'AppSelect';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const AppTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ error, className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(
        'w-full px-3 py-2.5 rounded-lg border text-sm bg-white text-foreground transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold',
        'placeholder:text-muted-foreground/60 resize-none',
        error ? 'border-destructive' : 'border-border',
        className
      )}
    />
  );
});
AppTextarea.displayName = 'AppTextarea';

interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  error?: boolean;
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(({ name, value, onChange, options, error }, ref) => {
  return (
    <div ref={ref} className="flex flex-wrap gap-3">
      {options.map(opt => (
        <label
          key={opt.value}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all text-sm',
            value === opt.value
              ? 'border-gold bg-gold/10 text-foreground font-medium'
              : 'border-border bg-white text-foreground hover:border-gold/40',
            error ? 'border-destructive' : ''
          )}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-[hsl(var(--gold))]"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
});
RadioGroup.displayName = 'RadioGroup';

interface CheckboxGroupProps {
  values: string[];
  onChange: (v: string[]) => void;
  options: { label: string; value: string }[];
  error?: boolean;
}

export function CheckboxGroup({ values, onChange, options, error }: CheckboxGroupProps) {
  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter(x => x !== v));
    else onChange([...values, v]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <label
          key={opt.value}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm',
            values.includes(opt.value)
              ? 'border-gold bg-gold/10 text-foreground font-medium'
              : 'border-border bg-white text-foreground hover:border-gold/40'
          )}
        >
          <input
            type="checkbox"
            checked={values.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="accent-[hsl(var(--gold))]"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
