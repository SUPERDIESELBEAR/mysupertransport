import { ApplicationFormData, EmployerRecord, US_STATES, defaultEmployer } from './types';
import { FormField, AppInput, AppSelect, RadioGroup, AppTextarea } from './FormField';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

const EMPLOYER_LABELS = [
  'Current or Last Employer',
  'Second to Last Employer',
  'Third to Last Employer',
  'Fourth to Last Employer',
];

function getEmployerLabel(index: number): string {
  if (index < EMPLOYER_LABELS.length) return EMPLOYER_LABELS[index];
  return `Employer ${index + 1}`;
}

interface EmployerBlockProps {
  index: number;
  total: number;
  value: EmployerRecord;
  onChange: (v: EmployerRecord) => void;
  onRemove?: () => void;
}

function formatMonthYear(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

function EmployerBlock({ index, total, value, onChange, onRemove }: EmployerBlockProps) {
  const set = (field: keyof EmployerRecord, v: string) => onChange({ ...value, [field]: v });
  const isCurrentEmployer = index === 0;
  const isCurrentlyEmployed = value.end_date === 'Present';

  const handleCurrentlyEmployedToggle = () => {
    if (isCurrentlyEmployed) {
      set('end_date', '');
    } else {
      set('end_date', 'Present');
    }
  };

  return (
    <div className="border border-border rounded-xl p-4 sm:p-5 space-y-4 bg-secondary/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          ({index + 1}) {getEmployerLabel(index)}
        </h3>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Employer Name" required>
          <AppInput value={value.name} onChange={e => set('name', e.target.value)} placeholder="Company name" />
        </FormField>
        <FormField label="City" required>
          <AppInput value={value.city} onChange={e => set('city', e.target.value)} placeholder="City" />
        </FormField>
        <FormField label="State" required>
          <AppSelect value={value.state} onChange={e => set('state', e.target.value)}>
            <option value="">State</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </AppSelect>
        </FormField>
        <FormField label="Position Held" required>
          <AppInput value={value.position} onChange={e => set('position', e.target.value)} placeholder="Job title / position" />
        </FormField>
      </div>

      <FormField label="Employer Email (optional, helps speed up verification)">
        <AppInput
          type="email"
          value={value.email ?? ''}
          onChange={e => set('email', e.target.value)}
          placeholder="hr@company.com"
        />
      </FormField>

      <FormField label="Reason for Leaving" required>
        <AppTextarea
          value={isCurrentlyEmployed ? 'Currently Employed' : value.reason_leaving}
          onChange={e => set('reason_leaving', e.target.value)}
          placeholder={isCurrentlyEmployed ? 'Currently Employed' : 'Reason for leaving'}
          rows={2}
          disabled={isCurrentlyEmployed}
        />
      </FormField>

      <FormField label="Was this a CMV driving position?">
        <RadioGroup
          name={`cmv_${index}`}
          value={value.cmv_position}
          onChange={v => set('cmv_position', v)}
          options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start Date (MM/YYYY)">
          <AppInput
            value={value.start_date}
            onChange={e => set('start_date', formatMonthYear(e.target.value))}
            placeholder="01/2020"
            maxLength={7}
          />
        </FormField>
        <FormField label="End Date (MM/YYYY)">
          <AppInput
            value={isCurrentlyEmployed ? 'Present' : value.end_date}
            onChange={e => set('end_date', formatMonthYear(e.target.value))}
            placeholder="12/2023"
            maxLength={7}
            disabled={isCurrentlyEmployed}
            className={isCurrentlyEmployed ? 'bg-secondary text-muted-foreground' : ''}
          />
        </FormField>
      </div>

      {isCurrentEmployer && (
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={isCurrentlyEmployed}
            onChange={handleCurrentlyEmployedToggle}
            className="h-4 w-4 rounded accent-[hsl(var(--gold))]"
          />
          <span className="text-sm text-foreground group-hover:text-gold transition-colors">
            I am currently employed here
          </span>
          {isCurrentlyEmployed && (
            <span className="text-xs text-gold font-medium bg-gold/10 px-2 py-0.5 rounded-full">
              End date set to "Present"
            </span>
          )}
        </label>
      )}
    </div>
  );
}

export default function Step3Employment({ data, onChange, errors }: Props) {
  const employers = data.employers;

  const updateEmployer = (index: number, value: EmployerRecord) => {
    const updated = [...employers];
    updated[index] = value;
    onChange('employers', updated);
  };

  const addEmployer = () => {
    onChange('employers', [...employers, { ...defaultEmployer }]);
  };

  const removeEmployer = (index: number) => {
    const updated = employers.filter((_, i) => i !== index);
    onChange('employers', updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Employment History</h2>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>FMCSA Requirement:</strong> List all employment for the past 10 years or since obtaining your CDL. Include driving and non-driving positions. Do <strong>NOT</strong> leave any gaps. If you were off work, enter <em>NOT employed</em> under employer, your city and state, reason for not employed, and the not employed dates.
          </p>
        </div>
      </div>

      {employers.map((emp, i) => (
        <EmployerBlock
          key={i}
          index={i}
          total={employers.length}
          value={emp}
          onChange={v => updateEmployer(i, v)}
          onRemove={i > 0 ? () => removeEmployer(i) : undefined}
        />
      ))}

      <button
        type="button"
        onClick={addEmployer}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-gold hover:border-gold/40 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Previous Employer
      </button>

      {errors.employers && (
        <p className="text-xs text-destructive">{errors.employers}</p>
      )}

      <div className="border-t border-border pt-5 space-y-5">
        <FormField label="Were there any gaps in employment longer than 30 days?" required error={errors.employment_gaps}>
          <RadioGroup
            name="employment_gaps"
            value={data.employment_gaps}
            onChange={v => onChange('employment_gaps', v)}
            options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]}
            error={!!errors.employment_gaps}
          />
        </FormField>

        {data.employment_gaps === 'yes' && (
          <FormField label="Please explain any employment gaps">
            <AppTextarea
              value={data.employment_gaps_explanation}
              onChange={e => onChange('employment_gaps_explanation', e.target.value)}
              placeholder="Describe each gap including dates and reason..."
              rows={3}
            />
          </FormField>
        )}
      </div>
    </div>
  );
}
