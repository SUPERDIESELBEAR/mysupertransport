import { ApplicationFormData, US_STATES } from './types';
import { FormField, AppInput, AppSelect, RadioGroup } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

export default function Step1Personal({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Personal Information</h2>
        <p className="text-sm text-muted-foreground">Please provide your legal name and current contact information.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="First Name" required error={errors.first_name}>
          <AppInput
            value={data.first_name}
            onChange={e => onChange('first_name', e.target.value)}
            placeholder="John"
            error={!!errors.first_name}
          />
        </FormField>
        <FormField label="Last Name" required error={errors.last_name}>
          <AppInput
            value={data.last_name}
            onChange={e => onChange('last_name', e.target.value)}
            placeholder="Smith"
            error={!!errors.last_name}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Date of Birth" required error={errors.dob}>
          <AppInput
            type="date"
            value={data.dob}
            onChange={e => onChange('dob', e.target.value)}
            error={!!errors.dob}
          />
        </FormField>
        <FormField label="Cell Phone Number" required error={errors.phone}>
          <AppInput
            type="tel"
            value={data.phone}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              let formatted = '';
              if (digits.length > 0) formatted = '(' + digits.slice(0, 3);
              if (digits.length >= 3) formatted += ') ' + digits.slice(3, 6);
              if (digits.length >= 6) formatted += '-' + digits.slice(6);
              onChange('phone', formatted);
            }}
            placeholder="(555) 000-0000"
            maxLength={14}
            error={!!errors.phone}
          />
        </FormField>
      </div>

      <FormField label="Email Address" required error={errors.email}>
        <AppInput
          type="email"
          value={data.email}
          onChange={e => onChange('email', e.target.value)}
          placeholder="john@example.com"
          error={!!errors.email}
        />
      </FormField>

      <div className="pt-2 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-4">Current Address</h3>
        <div className="space-y-4">
          <FormField label="Street Address" required error={errors.address_street}>
            <AppInput
              value={data.address_street}
              onChange={e => onChange('address_street', e.target.value)}
              placeholder="123 Main St"
              error={!!errors.address_street}
            />
          </FormField>
          <FormField label="Address Line 2">
            <AppInput
              value={data.address_line2}
              onChange={e => onChange('address_line2', e.target.value)}
              placeholder="Apt, Suite, Unit (optional)"
            />
          </FormField>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FormField label="City" required className="col-span-2 sm:col-span-1" error={errors.address_city}>
              <AppInput value={data.address_city} onChange={e => onChange('address_city', e.target.value)} placeholder="Springfield" error={!!errors.address_city} />
            </FormField>
            <FormField label="State" required error={errors.address_state}>
              <AppSelect value={data.address_state} onChange={e => onChange('address_state', e.target.value)} error={!!errors.address_state}>
                <option value="">State</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </AppSelect>
            </FormField>
            <FormField label="ZIP Code" required error={errors.address_zip}>
              <AppInput value={data.address_zip} onChange={e => onChange('address_zip', e.target.value)} placeholder="62701" error={!!errors.address_zip} />
            </FormField>
          </div>
          <FormField label="How long at this address?" required error={errors.address_duration}>
            <RadioGroup
              name="address_duration"
              value={data.address_duration}
              onChange={v => onChange('address_duration', v)}
              options={[
                { label: 'Less than 3 years', value: 'less_than_3' },
                { label: '3 years or more', value: '3_or_more' },
              ]}
              error={!!errors.address_duration}
            />
          </FormField>
        </div>
      </div>

      {data.address_duration === 'less_than_3' && (
        <div className="pt-2 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Previous Address</h3>
          <div className="space-y-4">
            <FormField label="Street Address">
              <AppInput value={data.prev_address_street} onChange={e => onChange('prev_address_street', e.target.value)} placeholder="123 Previous St" />
            </FormField>
            <FormField label="Address Line 2">
              <AppInput value={data.prev_address_line2} onChange={e => onChange('prev_address_line2', e.target.value)} placeholder="Apt, Suite, Unit (optional)" />
            </FormField>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FormField label="City" className="col-span-2 sm:col-span-1">
                <AppInput value={data.prev_address_city} onChange={e => onChange('prev_address_city', e.target.value)} placeholder="Springfield" />
              </FormField>
              <FormField label="State">
                <AppSelect value={data.prev_address_state} onChange={e => onChange('prev_address_state', e.target.value)}>
                  <option value="">State</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </AppSelect>
              </FormField>
              <FormField label="ZIP Code">
                <AppInput value={data.prev_address_zip} onChange={e => onChange('prev_address_zip', e.target.value)} placeholder="62701" />
              </FormField>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
