import { ApplicationFormData } from './types';
import { FormField, RadioGroup, AppTextarea } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

export default function Step5Accidents({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Accident & Violation History</h2>
        <p className="text-sm text-muted-foreground">Answer the following questions truthfully. This information is required by FMCSA.</p>
      </div>

      <div className="p-4 border border-border rounded-xl space-y-5">
        <FormField label="Have you been involved in any DOT-recordable accidents?" required error={errors.dot_accidents}>
          <RadioGroup
            name="dot_accidents"
            value={data.dot_accidents}
            onChange={v => onChange('dot_accidents', v)}
            options={[{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }]}
            error={!!errors.dot_accidents}
          />
        </FormField>
        {data.dot_accidents === 'yes' && (
          <FormField label="Describe each accident (date, location, description, injuries/fatalities)" required error={errors.dot_accidents_description}>
            <AppTextarea
              value={data.dot_accidents_description}
              onChange={e => onChange('dot_accidents_description', e.target.value)}
              placeholder="Date, location, brief description of each accident..."
              rows={4}
            />
          </FormField>
        )}
      </div>

      <div className="p-4 border border-border rounded-xl space-y-5">
        <FormField label="Have you had any moving violations?" required error={errors.moving_violations}>
          <RadioGroup
            name="moving_violations"
            value={data.moving_violations}
            onChange={v => onChange('moving_violations', v)}
            options={[{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }]}
            error={!!errors.moving_violations}
          />
        </FormField>
        {data.moving_violations === 'yes' && (
          <FormField label="Describe each violation (date, location, type of violation)" required error={errors.moving_violations_description}>
            <AppTextarea
              value={data.moving_violations_description}
              onChange={e => onChange('moving_violations_description', e.target.value)}
              placeholder="Date, location, type of violation for each..."
              rows={4}
            />
          </FormField>
        )}
      </div>
    </div>
  );
}
