import { ApplicationFormData } from './types';
import { FormField, RadioGroup } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

export default function Step6DrugAlcohol({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">DOT Drug & Alcohol Status</h2>
        <p className="text-sm text-muted-foreground">SAP (Substance Abuse Professional) Disclosure</p>
      </div>

      <div className="p-4 border border-border rounded-xl space-y-4">
        <FormField
          label="Are you currently participating in a DOT Return-to-Duty or Substance Abuse Professional (SAP) process?"
          required
          error={errors.sap_process}
          hint="Selecting 'Yes' does not automatically disqualify you."
        >
          <RadioGroup
            name="sap_process"
            value={data.sap_process}
            onChange={v => onChange('sap_process', v)}
            options={[{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }]}
            error={!!errors.sap_process}
          />
        </FormField>

        {data.sap_process === 'yes' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <strong>Note:</strong> If you are currently in a SAP process, you will be asked to provide documentation
            of your progress during the onboarding review. Selecting 'Yes' does not automatically disqualify you.
          </div>
        )}
      </div>
    </div>
  );
}
