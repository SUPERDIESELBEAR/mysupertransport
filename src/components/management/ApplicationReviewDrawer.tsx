import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X, CheckCircle2, XCircle, User, Phone, Mail, MapPin, Calendar,
  Briefcase, Car, FileText, ShieldAlert, ChevronRight, AlertTriangle, Loader2, Printer
} from 'lucide-react';

interface ApplicationReviewDrawerProps {
  app: FullApplication | null;
  onClose: () => void;
  onApprove: (appId: string, notes: string) => Promise<void>;
  onDeny: (appId: string, notes: string) => Promise<void>;
}

export interface FullApplication {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  dob: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_duration: string | null;
  prev_address_street: string | null;
  prev_address_city: string | null;
  prev_address_state: string | null;
  prev_address_zip: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_class: string | null;
  cdl_expiration: string | null;
  cdl_10_years: boolean | null;
  endorsements: string[] | null;
  equipment_operated: string[] | null;
  years_experience: string | null;
  referral_source: string | null;
  employer_1: Record<string, string> | null;
  employer_2: Record<string, string> | null;
  employer_3: Record<string, string> | null;
  employer_4: Record<string, string> | null;
  employment_gaps: boolean | null;
  employment_gaps_explanation: string | null;
  additional_employers: string | null;
  dot_accidents: boolean | null;
  dot_accidents_description: string | null;
  moving_violations: boolean | null;
  moving_violations_description: string | null;
  dot_positive_test_past_2yr: boolean | null;
  dot_return_to_duty_docs: boolean | null;
  sap_process: boolean | null;
  auth_safety_history: boolean | null;
  auth_drug_alcohol: boolean | null;
  auth_previous_employers: boolean | null;
  testing_policy_accepted: boolean | null;
  typed_full_name: string | null;
  signed_date: string | null;
  review_status: string;
  submitted_at: string | null;
  reviewer_notes: string | null;
  dl_front_url: string | null;
  dl_rear_url: string | null;
  medical_cert_url: string | null;
  signature_image_url: string | null;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="text-gold">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-sm">
      <span className="col-span-2 text-muted-foreground">{label}</span>
      <span className="col-span-3 text-foreground font-medium break-words">{value || <span className="text-muted-foreground italic">Not provided</span>}</span>
    </div>
  );
}

function YesNoBadge({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic text-sm">—</span>;
  return value
    ? <Badge className="bg-destructive/15 text-destructive border-0 text-xs">YES</Badge>
    : <Badge className="bg-status-complete/15 text-status-complete border-0 text-xs">NO</Badge>;
}

function EmployerBlock({ employer, label }: { employer: Record<string, string> | null; label: string }) {
  if (!employer || !employer.name) return null;
  return (
    <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5 text-sm">
      <p className="font-semibold text-foreground">{label}: <span className="text-gold">{employer.name}</span></p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>📍 {[employer.city, employer.state].filter(Boolean).join(', ') || 'No location'}</span>
        <span>📅 {employer.start_date} → {employer.end_date || '?'}</span>
        <span>💼 {employer.position || '—'}</span>
        <span>🚛 CMV: {employer.cmv_position || '—'}</span>
        {employer.reason_leaving && employer.reason_leaving !== 'Currently Employed' && (
          <span className="col-span-2">↪ Reason: {employer.reason_leaving}</span>
        )}
        {employer.end_date === 'Present' && (
          <span className="col-span-2 text-gold font-medium">✓ Currently employed here</span>
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-progress/15 text-status-progress',
  approved: 'bg-status-complete/15 text-status-complete',
  denied: 'bg-destructive/15 text-destructive',
};

export default function ApplicationReviewDrawer({ app, onClose, onApprove, onDeny }: ApplicationReviewDrawerProps) {
  const [notes, setNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'deny' | null>(null);
  const [loading, setLoading] = useState(false);

  if (!app) return null;

  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email;

  const handleAction = async (action: 'approve' | 'deny') => {
    setLoading(true);
    try {
      if (action === 'approve') {
        await onApprove(app.id, notes);
      } else {
        await onDeny(app.id, notes);
      }
      setConfirmAction(null);
      setNotes('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-dark shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white">{fullName}</h2>
              <Badge className={`text-xs ${STATUS_COLORS[app.review_status]}`}>
                {app.review_status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-surface-dark-muted text-xs mt-0.5">
              {app.submitted_at ? `Submitted ${new Date(app.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Draft'}
            </p>
          </div>
          <button onClick={onClose} className="text-surface-dark-muted hover:text-white transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7">

          {/* Personal Info */}
          <Section title="Personal Information" icon={<User className="h-4 w-4" />}>
            <Field label="Full Name" value={fullName} />
            <Field label="Email" value={app.email} />
            <Field label="Phone" value={app.phone} />
            <Field label="Date of Birth" value={app.dob ? new Date(app.dob).toLocaleDateString() : null} />
            <Field label="How they heard" value={app.referral_source} />
          </Section>

          {/* Address */}
          <Section title="Address" icon={<MapPin className="h-4 w-4" />}>
            <Field label="Current Address" value={[app.address_street, app.address_city, app.address_state, app.address_zip].filter(Boolean).join(', ')} />
            <Field label="Time at Address" value={app.address_duration} />
            {(app.prev_address_street || app.prev_address_city) && (
              <Field label="Previous Address" value={[app.prev_address_street, app.prev_address_city, app.prev_address_state, app.prev_address_zip].filter(Boolean).join(', ')} />
            )}
          </Section>

          {/* CDL Info */}
          <Section title="CDL Information" icon={<Car className="h-4 w-4" />}>
            <Field label="CDL Number" value={app.cdl_number} />
            <Field label="State" value={app.cdl_state} />
            <Field label="Class" value={app.cdl_class} />
            <Field label="Expiration" value={app.cdl_expiration ? new Date(app.cdl_expiration).toLocaleDateString() : null} />
            <Field label="10-Year CDL History" value={<YesNoBadge value={app.cdl_10_years} />} />
            <Field label="Endorsements" value={app.endorsements?.join(', ')} />
            <Field label="Equipment" value={app.equipment_operated?.join(', ')} />
            <Field label="Years Experience" value={app.years_experience} />
          </Section>

          {/* Employment */}
          <Section title="Employment History" icon={<Briefcase className="h-4 w-4" />}>
            <EmployerBlock employer={app.employer_1 as Record<string, string>} label="Current / Last Employer" />
            <EmployerBlock employer={app.employer_2 as Record<string, string>} label="2nd to Last" />
            <EmployerBlock employer={app.employer_3 as Record<string, string>} label="3rd to Last" />
            <EmployerBlock employer={app.employer_4 as Record<string, string>} label="4th to Last" />
            {app.additional_employers && (
              <div className="bg-secondary/50 rounded-lg p-3 text-sm">
                <p className="font-semibold text-foreground mb-1">Additional Employers</p>
                <p className="text-muted-foreground whitespace-pre-wrap text-xs">{app.additional_employers}</p>
              </div>
            )}
            <Field label="Employment Gaps" value={<YesNoBadge value={app.employment_gaps} />} />
            {app.employment_gaps_explanation && (
              <Field label="Gap Explanation" value={app.employment_gaps_explanation} />
            )}
          </Section>

          {/* Driving Record */}
          <Section title="Driving Record & Disclosures" icon={<ShieldAlert className="h-4 w-4" />}>
            <Field label="DOT Accidents (3yr)" value={<YesNoBadge value={app.dot_accidents} />} />
            {app.dot_accidents_description && <Field label="Accident Details" value={app.dot_accidents_description} />}
            <Field label="Moving Violations (3yr)" value={<YesNoBadge value={app.moving_violations} />} />
            {app.moving_violations_description && <Field label="Violation Details" value={app.moving_violations_description} />}
            <Field label="Positive Drug Test (2yr)" value={<YesNoBadge value={app.dot_positive_test_past_2yr} />} />
            {app.dot_return_to_duty_docs && <Field label="Return to Duty Docs" value={<YesNoBadge value={app.dot_return_to_duty_docs} />} />}
            <Field label="SAP Process" value={<YesNoBadge value={app.sap_process} />} />
          </Section>

          {/* Authorizations */}
          <Section title="Authorizations & Signature" icon={<FileText className="h-4 w-4" />}>
            <Field label="Auth: Safety History" value={<YesNoBadge value={app.auth_safety_history} />} />
            <Field label="Auth: Drug/Alcohol" value={<YesNoBadge value={app.auth_drug_alcohol} />} />
            <Field label="Auth: Previous Employers" value={<YesNoBadge value={app.auth_previous_employers} />} />
            <Field label="Testing Policy Accepted" value={<YesNoBadge value={app.testing_policy_accepted} />} />
            <Field label="Signed By" value={app.typed_full_name} />
            <Field label="Signed Date" value={app.signed_date ? new Date(app.signed_date).toLocaleDateString() : null} />
            {app.signature_image_url && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Signature</p>
                <div className="border border-border rounded-lg p-2 bg-secondary/30 inline-block">
                  <img src={app.signature_image_url} alt="Applicant signature" className="h-16 w-auto" />
                </div>
              </div>
            )}
          </Section>

          {/* Uploaded Documents */}
          {(app.dl_front_url || app.dl_rear_url || app.medical_cert_url) && (
            <Section title="Uploaded Documents" icon={<FileText className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-2">
                {app.dl_front_url && (
                  <a href={app.dl_front_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg">
                    <FileText className="h-3.5 w-3.5" /> DL Front
                  </a>
                )}
                {app.dl_rear_url && (
                  <a href={app.dl_rear_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg">
                    <FileText className="h-3.5 w-3.5" /> DL Rear
                  </a>
                )}
                {app.medical_cert_url && (
                  <a href={app.medical_cert_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gold hover:underline bg-gold/10 px-3 py-1.5 rounded-lg">
                    <FileText className="h-3.5 w-3.5" /> Medical Cert
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Existing reviewer notes */}
          {app.reviewer_notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">Previous Reviewer Notes</p>
              <p className="text-sm text-amber-900">{app.reviewer_notes}</p>
            </div>
          )}
        </div>

        {/* Action Footer — only show for pending */}
        {app.review_status === 'pending' && (
          <div className="border-t border-border p-5 bg-secondary/30 shrink-0 space-y-3">
            {!confirmAction ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    Reviewer Notes <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add internal notes about this application..."
                    rows={2}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-gold/30"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmAction('deny')}
                    className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Deny Application
                  </Button>
                  <Button
                    onClick={() => setConfirmAction('approve')}
                    className="flex-1 bg-status-complete text-white hover:bg-status-complete/90"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Invite
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-lg p-4 border ${confirmAction === 'approve' ? 'bg-status-complete/10 border-status-complete/30' : 'bg-destructive/10 border-destructive/30'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${confirmAction === 'approve' ? 'text-status-complete' : 'text-destructive'}`} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {confirmAction === 'approve'
                          ? `Approve application and send invite to ${app.email}?`
                          : `Deny application for ${fullName}?`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {confirmAction === 'approve'
                          ? 'This will send a SUPERTRANSPORT account invite email. An Operator record will be created automatically.'
                          : 'This action will mark the application as denied. It cannot be reversed without contacting support.'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setConfirmAction(null)} className="flex-1" disabled={loading}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleAction(confirmAction)}
                    disabled={loading}
                    className={`flex-1 text-white ${confirmAction === 'approve' ? 'bg-status-complete hover:bg-status-complete/90' : 'bg-destructive hover:bg-destructive/90'}`}
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      confirmAction === 'approve' ? 'Confirm Approve & Invite' : 'Confirm Deny'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
