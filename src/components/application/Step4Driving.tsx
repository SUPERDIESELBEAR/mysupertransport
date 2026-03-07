import { ApplicationFormData } from './types';
import { FormField, RadioGroup, CheckboxGroup } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

const EQUIPMENT = [
  { label: 'Dry Van', value: 'dry_van' },
  { label: 'Temp-controlled', value: 'temp_controlled' },
  { label: 'Hopper/Bulk', value: 'hopper_bulk' },
  { label: 'Flatbed', value: 'flatbed' },
  { label: 'Step Deck', value: 'step_deck' },
  { label: 'Lowboy', value: 'lowboy' },
  { label: 'Tanker', value: 'tanker' },
];

export default function Step4Driving({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Driving Experience</h2>
        <p className="text-sm text-muted-foreground">Tell us about your commercial driving background.</p>
      </div>

      <FormField label="Total Years of Commercial Driving Experience" required error={errors.years_experience}>
        <RadioGroup
          name="years_experience"
          value={data.years_experience}
          onChange={v => onChange('years_experience', v)}
          options={[
            { label: 'Less than 2', value: 'less_than_2' },
            { label: '2–3 years', value: '2_3' },
            { label: '4–7 years', value: '4_7' },
            { label: '8–10 years', value: '8_10' },
            { label: '10+ years', value: '10_plus' },
          ]}
          error={!!errors.years_experience}
        />
      </FormField>

      <FormField label="Equipment Operated (select all that apply)" required error={errors.equipment_operated as string}>
        <CheckboxGroup
          values={data.equipment_operated}
          onChange={v => onChange('equipment_operated', v)}
          options={EQUIPMENT}
          error={!!(errors.equipment_operated as string)}
        />
      </FormField>
    </div>
  );
}
