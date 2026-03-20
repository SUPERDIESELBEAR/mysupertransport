import { ApplicationFormData } from './types';
import { RadioGroup } from './FormField';

interface Props {
  data: ApplicationFormData;
  onChange: (field: keyof ApplicationFormData, value: any) => void;
  errors: Partial<Record<keyof ApplicationFormData, string>>;
}

export default function Step8Disclosures({ data, onChange, errors }: Props) {
  const CheckItem = ({
    id, checked, onChange: onChg, label, error
  }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; error?: string }) => (
    <div className="space-y-1">
      <label
        className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
          checked ? 'border-gold bg-gold/8' : 'border-border bg-white hover:border-gold/40'
        } ${error ? 'border-destructive' : ''}`}
      >
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={e => onChg(e.target.checked)}
          className="mt-0.5 accent-[hsl(var(--gold))] h-4 w-4 shrink-0"
        />
        <span className="text-sm text-foreground leading-relaxed">{label}</span>
      </label>
      {error && <p className="text-xs text-destructive font-medium px-1">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Disclosures & Authorizations</h2>
        <p className="text-sm text-muted-foreground">Please read and authorize each disclosure below.</p>
      </div>

      {/* FCRA */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Fair Credit Reporting Act Authorization</h3>
        <div className="p-4 bg-secondary border border-border rounded-xl text-xs text-muted-foreground leading-relaxed max-h-36 overflow-y-auto">
          I hereby authorize SUPERTRANSPORT to conduct a background investigation through a consumer reporting agency as permitted by the Fair Credit Reporting Act. This investigation may include, but is not limited to: Social Security Number verification, residential history, employment history, education verification, personal and professional references, credit history, criminal records, motor vehicle records (MVR), and any other public records deemed relevant. I understand that this investigation is a condition of my application and continued employment, and that I have the right to request disclosure of the nature and scope of any investigation.
        </div>
      </section>

      {/* Pre-Employment Authorizations */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Pre-Employment Authorizations</h3>
        <div className="space-y-3">
          <CheckItem
            id="auth_safety"
            checked={data.auth_safety_history}
            onChange={v => onChange('auth_safety_history', v)}
            label="I authorize this motor carrier to investigate my safety performance history with previous employers as required by FMCSA regulations (49 CFR Part 391)."
            error={errors.auth_safety_history}
          />
          <CheckItem
            id="auth_drug"
            checked={data.auth_drug_alcohol}
            onChange={v => onChange('auth_drug_alcohol', v)}
            label="I consent to the release of information regarding my DOT drug and alcohol testing history from previous employers, including the FMCSA Drug & Alcohol Clearinghouse."
            error={errors.auth_drug_alcohol}
          />
          <CheckItem
            id="auth_employers"
            checked={data.auth_previous_employers}
            onChange={v => onChange('auth_previous_employers', v)}
            label="I authorize the release of employment records, performance information, and other relevant data from previous employers and government agencies to SUPERTRANSPORT LLC."
            error={errors.auth_previous_employers}
          />
        </div>
      </section>

      {/* DOT Drug/Alcohol Pre-Employment Questions */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">DOT Drug & Alcohol Pre-Employment Questions</h3>
        <div className="p-4 bg-secondary border border-border rounded-xl text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">49 CFR Part 40.25(j) Notice:</strong> As required by federal regulations, you must answer the following questions truthfully. This information will be used to assess your eligibility to perform safety-sensitive transportation functions.
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              1. Have you tested positive, or refused to test, on any pre-employment drug or alcohol test administered by an employer to which you applied for, but did not obtain, safety-sensitive transportation work covered by DOT agency drug and alcohol testing rules during the past two years?
            </p>
            <RadioGroup
              name="dot_positive_test"
              value={data.dot_positive_test_past_2yr}
              onChange={v => onChange('dot_positive_test_past_2yr', v)}
              options={[{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }]}
              error={!!errors.dot_positive_test_past_2yr}
            />
            {errors.dot_positive_test_past_2yr && <p className="text-xs text-destructive font-medium">{errors.dot_positive_test_past_2yr}</p>}
          </div>

          {data.dot_positive_test_past_2yr === 'yes' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                2. Can you provide documentation of successful completion of DOT return-to-duty requirements (including follow-up tests)?
              </p>
              <RadioGroup
                name="dot_return_to_duty"
                value={data.dot_return_to_duty_docs}
                onChange={v => onChange('dot_return_to_duty_docs', v)}
                options={[{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }]}
              />
            </div>
          )}
        </div>
      </section>

      {/* Company Testing Policy */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Certificate of Receipt — Company Testing Policy</h3>
        <div className="p-4 bg-secondary border border-border rounded-xl text-xs text-muted-foreground leading-relaxed max-h-48 overflow-y-auto">
          <p className="font-semibold text-foreground mb-2">SUPERTRANSPORT LLC — Federal Motor Carrier Safety Compliance Notice</p>
          <p className="mb-2">By accepting these terms, you acknowledge that you have received, read, and understand SUPERTRANSPORT LLC's Drug and Alcohol Policy as required by 49 CFR §382.601. You certify that you are familiar with the requirements of 49 CFR Parts 40, 382, and 391, and you agree to comply with all applicable FMCSA regulations while operating under SUPERTRANSPORT LLC's authority.</p>
          <p className="mb-2">You acknowledge that: (1) you are subject to controlled substance and alcohol testing as a condition of employment; (2) a positive test result or refusal to test will result in immediate removal from safety-sensitive duties; (3) you understand the consequences of violations and your rights as described in the policy.</p>
          <p>You certify that all information provided in this application is accurate and complete to the best of your knowledge, and that providing false information may result in disqualification from consideration or termination of employment.</p>
        </div>
        <CheckItem
          id="testing_policy"
          checked={data.testing_policy_accepted}
          onChange={v => onChange('testing_policy_accepted', v)}
          label="I accept the Terms and Conditions, acknowledge receipt of the Company Drug & Alcohol Testing Policy, and certify that all information in this application is true and complete."
          error={errors.testing_policy_accepted}
        />
      </section>
    </div>
  );
}
