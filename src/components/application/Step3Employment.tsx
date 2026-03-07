import { ApplicationFormData, EmployerRecord, US_STATES, defaultEmployer } from './types';
import { FormField, AppInput, AppSelect, RadioGroup, AppTextarea } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

const EMPLOYER_KEYS = ['employer_1', 'employer_2', 'employer_3', 'employer_4'] as const;
const EMPLOYER_LABELS = [
  'Current or Last Employer',
  'Second to Last Employer',
  'Third to Last Employer',
  'Fourth to Last Employer',
];

interface EmployerBlockProps {
  index: number;
  value: EmployerRecord;
  onChange: (v: EmployerRecord) => void;
}

function EmployerBlock({ index, value, onChange }: EmployerBlockProps) {
  const set = (field: keyof EmployerRecord, v: string) => onChange({ ...value, [field]: v });
  const isOptional = index > 0;
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
          ({index + 1}) {EMPLOYER_LABELS[index]}
        </h3>
        {isOptional && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Enter "NA" in each field if not applicable
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Employer Name" required={!isOptional}>
          <AppInput value={value.name} onChange={e => set('name', e.target.value)} placeholder={isOptional ? 'NA or employer name' : 'Company name'} />
        </FormField>
        <FormField label="City">
          <AppInput value={value.city} onChange={e => set('city', e.target.value)} placeholder="City" />
        </FormField>
        <FormField label="State">
          <AppSelect value={value.state} onChange={e => set('state', e.target.value)}>
            <option value="">State</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </AppSelect>
        </FormField>
        <FormField label="Position Held">
          <AppInput value={value.position} onChange={e => set('position', e.target.value)} placeholder="Job title / position" />
        </FormField>
      </div>

      <FormField label="Reason for Leaving">
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
            onChange={e => set('start_date', e.target.value)}
            placeholder="01/2020"
          />
        </FormField>
        <FormField label="End Date (MM/YYYY)">
          <AppInput
            value={isCurrentlyEmployed ? 'Present' : value.end_date}
            onChange={e => set('end_date', e.target.value)}
            placeholder="12/2023"
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

      {EMPLOYER_KEYS.map((key, i) => (
        <EmployerBlock
          key={key}
          index={i}
          value={data[key] as EmployerRecord}
          onChange={v => onChange(key, v)}
        />
      ))}

      <div className="border-t border-border pt-5 space-y-5">
        <FormField label="Do you have additional employers within the past 10 years not listed above?" required error={errors.has_additional_employers}>
          <RadioGroup
            name="has_additional_employers"
            value={data.has_additional_employers}
            onChange={v => onChange('has_additional_employers', v)}
            options={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]}
            error={!!errors.has_additional_employers}
          />
        </FormField>

        {data.has_additional_employers === 'yes' && (
          <FormField label="Additional Employers" hint="Format: Employer Name, City & State, CMV (yes/no), Start Date / End Date">
            <AppTextarea
              value={data.additional_employers}
              onChange={e => onChange('additional_employers', e.target.value)}
              placeholder="ABC Trucking, Dallas TX, CMV yes, 01/2010 - 06/2012&#10;XYZ Logistics, Memphis TN, CMV yes, 07/2012 - 03/2014"
              rows={4}
            />
          </FormField>
        )}

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
