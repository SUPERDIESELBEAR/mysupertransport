import { ApplicationFormData, US_STATES } from './types';
import { FormField, AppInput, AppSelect, RadioGroup, CheckboxGroup } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

const ENDORSEMENTS = [
  { label: 'None', value: 'none' },
  { label: 'T — Double/Triple Trailers', value: 'T' },
  { label: 'N — Tank', value: 'N' },
  { label: 'H — Hazardous Materials', value: 'H' },
  { label: 'X — Combined N & H', value: 'X' },
  { label: 'P — Passenger', value: 'P' },
];

const REFERRAL_SOURCES = ['Indeed', 'Facebook', 'Internet Search', 'Word of Mouth', 'Other'];

export default function Step2CDL({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">CDL Information</h2>
        <p className="text-sm text-muted-foreground">Provide your Commercial Driver's License details.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="CDL State" required error={errors.cdl_state}>
          <AppSelect value={data.cdl_state} onChange={e => onChange('cdl_state', e.target.value)} error={!!errors.cdl_state}>
            <option value="">Select state</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </AppSelect>
        </FormField>
        <FormField label="CDL Number" required error={errors.cdl_number}>
          <AppInput
            value={data.cdl_number}
            onChange={e => onChange('cdl_number', e.target.value)}
            placeholder="CDL number"
            error={!!errors.cdl_number}
          />
        </FormField>
      </div>

      <FormField label="CDL Class" required error={errors.cdl_class}>
        <RadioGroup
          name="cdl_class"
          value={data.cdl_class}
          onChange={v => onChange('cdl_class', v)}
          options={[
            { label: 'CDL-A', value: 'CDL-A' },
            { label: 'CDL-B', value: 'CDL-B' },
            { label: 'CDL-C', value: 'CDL-C' },
          ]}
          error={!!errors.cdl_class}
        />
      </FormField>

      <FormField label="CDL Expiration Date" required error={errors.cdl_expiration}>
        <AppInput
          type="date"
          value={data.cdl_expiration}
          onChange={e => onChange('cdl_expiration', e.target.value)}
          error={!!errors.cdl_expiration}
          className="max-w-xs"
        />
      </FormField>

      <FormField label="Endorsements (select all that apply)" required error={errors.endorsements as string}>
        <CheckboxGroup
          values={data.endorsements}
          onChange={v => onChange('endorsements', v)}
          options={ENDORSEMENTS}
          error={!!(errors.endorsements as string)}
        />
      </FormField>

      <FormField label="Have you held a CDL for 10 years or more?" required error={errors.cdl_10_years}>
        <RadioGroup
          name="cdl_10_years"
          value={data.cdl_10_years}
          onChange={v => onChange('cdl_10_years', v)}
          options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          error={!!errors.cdl_10_years}
        />
      </FormField>

      <FormField label="How did you hear about SUPERTRANSPORT?" required error={errors.referral_source}>
        <AppSelect value={data.referral_source} onChange={e => onChange('referral_source', e.target.value)} error={!!errors.referral_source}>
          <option value="">Select one</option>
          {REFERRAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </AppSelect>
      </FormField>
    </div>
  );
}
