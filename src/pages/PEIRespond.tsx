import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Lookup = {
  request_id: string;
  application_id: string;
  applicant_first_name: string | null;
  applicant_last_name: string | null;
  employer_name: string;
  employer_city: string | null;
  employer_state: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  status: string;
  deadline_date: string | null;
  already_responded: boolean;
};

interface Accident {
  accident_date: string;
  location_city_state: string;
  number_of_injuries: string;
  number_of_fatalities: string;
  hazmat_spill: boolean;
}

const RATINGS = ['excellent', 'good', 'poor'] as const;
const RATING_LABEL: Record<(typeof RATINGS)[number], string> = {
  excellent: 'Excellent',
  good: 'Good',
  poor: 'Poor',
};

const initialAccident: Accident = {
  accident_date: '',
  location_city_state: '',
  number_of_injuries: '',
  number_of_fatalities: '',
  hazmat_spill: false,
};

const responderSchema = z.object({
  responder_name: z.string().trim().min(1, 'Required').max(120),
  responder_title: z.string().trim().max(120).optional().or(z.literal('')),
  responder_company: z.string().trim().max(160).optional().or(z.literal('')),
  responder_email: z.string().trim().email('Invalid email').max(160).optional().or(z.literal('')),
  responder_phone: z.string().trim().max(40).optional().or(z.literal('')),
});

export default function PEIRespond() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [wasEmployed, setWasEmployed] = useState<'true' | 'false' | ''>('');
  const [datesAccurate, setDatesAccurate] = useState<'true' | 'false' | ''>('');
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [safeAndEfficient, setSafeAndEfficient] = useState<'true' | 'false' | ''>('');
  const [reasonForLeaving, setReasonForLeaving] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [hadAccidents, setHadAccidents] = useState<'true' | 'false' | ''>('');
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [drugViolation, setDrugViolation] = useState<'true' | 'false' | ''>('');
  const [failedRehab, setFailedRehab] = useState<'true' | 'false' | ''>('');
  const [postRehabViolations, setPostRehabViolations] = useState<'true' | 'false' | ''>('');
  const [drugNotes, setDrugNotes] = useState('');
  const [ratings, setRatings] = useState({
    rating_quality_of_work: '',
    rating_cooperation: '',
    rating_safety_habits: '',
    rating_personal_habits: '',
    rating_driving_skills: '',
    rating_attitude: '',
  });
  const [equipment, setEquipment] = useState({
    equipment_straight_truck: false,
    equipment_tractor_semi: false,
    equipment_bus: false,
  });
  const [trailers, setTrailers] = useState({
    trailer_van: false,
    trailer_flatbed: false,
    trailer_reefer: false,
    trailer_cargo_tank: false,
    trailer_triples: false,
    trailer_doubles: false,
    trailer_na: false,
  });
  const [responder, setResponder] = useState({
    responder_name: '',
    responder_title: '',
    responder_company: '',
    responder_email: '',
    responder_phone: '',
    responder_city: '',
    responder_state: '',
    responder_postal_code: '',
  });

  useEffect(() => {
    if (!token) return;
    // Preview mode: when the test PEI dialog generates a link with this
    // sentinel token, render the form with mock data instead of hitting
    // the database. Submission is short-circuited with a toast so no rows
    // are written.
    if (token === 'test-token-preview') {
      setLookup({
        request_id: 'preview',
        application_id: 'preview',
        applicant_first_name: 'Test',
        applicant_last_name: 'Applicant',
        employer_name: 'Sample Trucking Co.',
        employer_city: null,
        employer_state: null,
        employment_start_date: '2022-01-01',
        employment_end_date: '2024-06-30',
        status: 'sent',
        deadline_date: null,
        already_responded: false,
      });
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_pei_request_for_response', { p_token: token });
        if (error) throw error;
        const row = (data as Lookup[] | null)?.[0];
        if (!row) {
          setError('This response link is invalid or has been revoked.');
        } else if (row.already_responded || row.status === 'completed') {
          setError('A response has already been submitted for this investigation. Thank you.');
        } else if (row.status === 'gfe_documented') {
          setError('This investigation has been closed. No further response is needed.');
        } else {
          setLookup(row);
        }
      } catch (e: any) {
        setError(e?.message ?? 'Could not load this request.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function setRating(k: keyof typeof ratings, v: string) {
    setRatings((r) => ({ ...r, [k]: v }));
  }

  async function handleSubmit() {
    if (!lookup || !token) return;
    if (token === 'test-token-preview') {
      toast.success('Preview mode — response not submitted.');
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!wasEmployed) return toast.error('Please confirm whether the applicant was employed by your company.');
    if (wasEmployed === 'true' && !safeAndEfficient) return toast.error('Please answer whether the applicant operated safely and efficiently.');
    const responderResult = responderSchema.safeParse(responder);
    if (!responderResult.success) {
      const issues = responderResult.error.flatten().fieldErrors;
      const first = Object.values(issues)[0]?.[0];
      return toast.error(first ?? 'Please complete the responder section.');
    }
    if (hadAccidents === 'true' && accidents.length === 0) {
      return toast.error('Add at least one accident or change the answer to No.');
    }

    setSubmitting(true);
    try {
      const payload = {
        was_employed: wasEmployed,
        dates_accurate: datesAccurate || '',
        actual_start_date: actualStart,
        actual_end_date: actualEnd,
        safe_and_efficient: safeAndEfficient || '',
        reason_for_leaving: reasonForLeaving,
        reason_detail: reasonDetail,
        had_accidents: hadAccidents || '',
        drug_alcohol_violation: drugViolation || '',
        failed_rehab: failedRehab || '',
        post_rehab_violations: postRehabViolations || '',
        drug_alcohol_notes: drugNotes,
        ...ratings,
        equipment_straight_truck: equipment.equipment_straight_truck ? 'true' : 'false',
        equipment_tractor_semi: equipment.equipment_tractor_semi ? 'true' : 'false',
        equipment_bus: equipment.equipment_bus ? 'true' : 'false',
        trailer_van: trailers.trailer_van ? 'true' : 'false',
        trailer_flatbed: trailers.trailer_flatbed ? 'true' : 'false',
        trailer_reefer: trailers.trailer_reefer ? 'true' : 'false',
        trailer_cargo_tank: trailers.trailer_cargo_tank ? 'true' : 'false',
        trailer_triples: trailers.trailer_triples ? 'true' : 'false',
        trailer_doubles: trailers.trailer_doubles ? 'true' : 'false',
        trailer_na: trailers.trailer_na ? 'true' : 'false',
        ...responder,
        submission_method: 'web_form',
      };
      const accidentsPayload = accidents.map((a) => ({
        accident_date: a.accident_date,
        location_city_state: a.location_city_state,
        number_of_injuries: a.number_of_injuries,
        number_of_fatalities: a.number_of_fatalities,
        hazmat_spill: a.hazmat_spill ? 'true' : 'false',
      }));
      const { error: rpcErr } = await supabase.rpc('submit_pei_response', {
        p_token: token,
        p_response: payload as any,
        p_accidents: accidentsPayload as any,
      });
      if (rpcErr) throw rpcErr;
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-semibold">Response Unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md p-8 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold">Response Received</h1>
          <p className="text-sm text-muted-foreground">
            Thank you. Your verification has been recorded as part of this driver's qualification file under 49 CFR §391.23.
          </p>
        </Card>
      </div>
    );
  }

  if (!lookup) return null;
  const applicantName = [lookup.applicant_first_name, lookup.applicant_last_name].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <ShieldCheck className="h-9 w-9 text-gold mx-auto" />
          <h1 className="text-2xl font-semibold">Previous Employment Verification</h1>
          <p className="text-sm text-muted-foreground">
            49 CFR §391.23 — Driver Qualification Investigation
          </p>
        </header>

        <Card className="p-6 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Field label="Applicant" value={applicantName || '—'} />
            <Field label="Your company" value={lookup.employer_name} />
            <Field label="Claimed start date" value={lookup.employment_start_date ?? '—'} />
            <Field label="Claimed end date" value={lookup.employment_end_date ?? '—'} />
          </div>
          <p className="text-xs text-muted-foreground">
            Federal regulation requires motor carriers to investigate the safety performance history of each driver-applicant. Your response is protected from civil action under 49 U.S.C. §508 when given in good faith.
          </p>
        </Card>

        <Card className="p-6 space-y-5">
          <h2 className="font-semibold">1 · Employment Verification</h2>
          <YesNo label="Was this applicant employed by your company?" value={wasEmployed} onChange={setWasEmployed} />
          {wasEmployed === 'true' && (
            <>
              <YesNo label="Are the dates of employment claimed by the applicant accurate?" value={datesAccurate} onChange={setDatesAccurate} />
              {datesAccurate === 'false' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <DateField label="Actual start date" value={actualStart} onChange={setActualStart} />
                  <DateField label="Actual end date" value={actualEnd} onChange={setActualEnd} />
                </div>
              )}
              <YesNo label="Did the applicant operate company vehicles in a safe and efficient manner?" value={safeAndEfficient} onChange={setSafeAndEfficient} />
              <div className="space-y-2">
                <Label>Reason for leaving</Label>
                <Select value={reasonForLeaving} onValueChange={setReasonForLeaving}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discharged">Discharged</SelectItem>
                    <SelectItem value="laid_off">Laid off</SelectItem>
                    <SelectItem value="resigned">Resigned</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} placeholder="Optional details" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Equipment operated</Label>
                <CheckboxRow id="eq_st" label="Straight truck" checked={equipment.equipment_straight_truck} onChange={(v) => setEquipment(s => ({ ...s, equipment_straight_truck: v }))} />
                <CheckboxRow id="eq_ts" label="Tractor / semi-trailer" checked={equipment.equipment_tractor_semi} onChange={(v) => setEquipment(s => ({ ...s, equipment_tractor_semi: v }))} />
                <CheckboxRow id="eq_bus" label="Bus" checked={equipment.equipment_bus} onChange={(v) => setEquipment(s => ({ ...s, equipment_bus: v }))} />
              </div>
              <div className="space-y-2">
                <Label>Trailer types</Label>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                  <CheckboxRow id="tr_van" label="Van" checked={trailers.trailer_van} onChange={(v) => setTrailers(s => ({ ...s, trailer_van: v }))} />
                  <CheckboxRow id="tr_flat" label="Flatbed" checked={trailers.trailer_flatbed} onChange={(v) => setTrailers(s => ({ ...s, trailer_flatbed: v }))} />
                  <CheckboxRow id="tr_reef" label="Reefer" checked={trailers.trailer_reefer} onChange={(v) => setTrailers(s => ({ ...s, trailer_reefer: v }))} />
                  <CheckboxRow id="tr_tank" label="Cargo tank" checked={trailers.trailer_cargo_tank} onChange={(v) => setTrailers(s => ({ ...s, trailer_cargo_tank: v }))} />
                  <CheckboxRow id="tr_trip" label="Triples" checked={trailers.trailer_triples} onChange={(v) => setTrailers(s => ({ ...s, trailer_triples: v }))} />
                  <CheckboxRow id="tr_dbl" label="Doubles" checked={trailers.trailer_doubles} onChange={(v) => setTrailers(s => ({ ...s, trailer_doubles: v }))} />
                  <CheckboxRow id="tr_na" label="N/A" checked={trailers.trailer_na} onChange={(v) => setTrailers(s => ({ ...s, trailer_na: v }))} />
                </div>
              </div>
            </>
          )}
        </Card>

        {wasEmployed === 'true' && (
          <>
            <Card className="p-6 space-y-4">
              <h2 className="font-semibold">2 · Accidents (preceding 3 years)</h2>
              <YesNo label="Was the applicant involved in any DOT-recordable accidents while employed by your company?" value={hadAccidents} onChange={(v) => { setHadAccidents(v); if (v === 'true' && accidents.length === 0) setAccidents([{ ...initialAccident }]); }} />
              {hadAccidents === 'true' && (
                <div className="space-y-3">
                  {accidents.map((a, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Accident #{i + 1}</span>
                        <Button size="sm" variant="ghost" onClick={() => setAccidents(arr => arr.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <DateField label="Date" value={a.accident_date} onChange={(v) => setAccidents(arr => arr.map((x, idx) => idx === i ? { ...x, accident_date: v } : x))} />
                        <div>
                          <Label className="text-xs">Location (City, State)</Label>
                          <Input value={a.location_city_state} onChange={(e) => setAccidents(arr => arr.map((x, idx) => idx === i ? { ...x, location_city_state: e.target.value } : x))} />
                        </div>
                        <div>
                          <Label className="text-xs">Injuries</Label>
                          <Input type="number" min={0} value={a.number_of_injuries} onChange={(e) => setAccidents(arr => arr.map((x, idx) => idx === i ? { ...x, number_of_injuries: e.target.value } : x))} />
                        </div>
                        <div>
                          <Label className="text-xs">Fatalities</Label>
                          <Input type="number" min={0} value={a.number_of_fatalities} onChange={(e) => setAccidents(arr => arr.map((x, idx) => idx === i ? { ...x, number_of_fatalities: e.target.value } : x))} />
                        </div>
                      </div>
                      <CheckboxRow id={`hz-${i}`} label="HazMat spill" checked={a.hazmat_spill} onChange={(v) => setAccidents(arr => arr.map((x, idx) => idx === i ? { ...x, hazmat_spill: v } : x))} />
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setAccidents(arr => [...arr, { ...initialAccident }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add accident
                  </Button>
                </div>
              )}
            </Card>

            <Card className="p-6 space-y-4">
              <h2 className="font-semibold">3 · Drug & Alcohol (49 CFR §40 / §382)</h2>
              <YesNo label="Did the applicant test positive or refuse a DOT drug/alcohol test while employed by your company?" value={drugViolation} onChange={setDrugViolation} />
              {drugViolation === 'true' && (
                <>
                  <YesNo label="Did the applicant fail to complete a Substance Abuse Professional (SAP) program?" value={failedRehab} onChange={setFailedRehab} />
                  <YesNo label="After return-to-duty, did the applicant violate again?" value={postRehabViolations} onChange={setPostRehabViolations} />
                  <Textarea value={drugNotes} onChange={(e) => setDrugNotes(e.target.value)} placeholder="Optional notes" rows={2} />
                </>
              )}
            </Card>

            <Card className="p-6 space-y-4">
              <h2 className="font-semibold">4 · Performance Ratings</h2>
              <div className="space-y-3">
                {([
                  ['rating_quality_of_work', 'Quality of work'],
                  ['rating_cooperation', 'Cooperation'],
                  ['rating_safety_habits', 'Safety habits'],
                  ['rating_personal_habits', 'Personal habits'],
                  ['rating_driving_skills', 'Driving skills'],
                  ['rating_attitude', 'Attitude'],
                ] as Array<[keyof typeof ratings, string]>).map(([k, label]) => (
                  <div key={k} className="grid sm:grid-cols-3 gap-2 items-center">
                    <Label className="text-sm">{label}</Label>
                    <div className="sm:col-span-2">
                      <Select value={ratings[k]} onValueChange={(v) => setRating(k, v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {RATINGS.map(r => <SelectItem key={r} value={r}>{RATING_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">{wasEmployed === 'true' ? '5' : '2'} · Your Information</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Your name *</Label>
              <Input value={responder.responder_name} onChange={(e) => setResponder(s => ({ ...s, responder_name: e.target.value }))} />
            </div>
            <div>
              <Label>Your title</Label>
              <Input value={responder.responder_title} onChange={(e) => setResponder(s => ({ ...s, responder_title: e.target.value }))} />
            </div>
            <div>
              <Label>Company</Label>
              <Input value={responder.responder_company} onChange={(e) => setResponder(s => ({ ...s, responder_company: e.target.value }))} placeholder={lookup.employer_name} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={responder.responder_phone} onChange={(e) => setResponder(s => ({ ...s, responder_phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={responder.responder_email} onChange={(e) => setResponder(s => ({ ...s, responder_email: e.target.value }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground border-t pt-3">
            By submitting this form, you certify under 49 U.S.C. §508 that the information provided is accurate to the best of your knowledge and given in good faith.
          </p>
        </Card>

        <div className="flex justify-end pb-12">
          <Button size="lg" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Submit Verification
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: 'true' | 'false' | ''; onChange: (v: 'true' | 'false') => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as 'true' | 'false')} className="flex gap-6">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="true" id={`${label}-y`} />
          <Label htmlFor={`${label}-y`} className="font-normal cursor-pointer">Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="false" id={`${label}-n`} />
          <Label htmlFor={`${label}-n`} className="font-normal cursor-pointer">No</Label>
        </div>
      </RadioGroup>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CheckboxRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      <Label htmlFor={id} className="font-normal cursor-pointer text-sm">{label}</Label>
    </div>
  );
}