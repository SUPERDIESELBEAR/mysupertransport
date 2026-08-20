// Parse a broker rate confirmation (PDF or image) with Lovable AI and return
// structured, confidence-tagged load data for the Create Load review screen.
// Staff-authenticated. The model never guesses money or times.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1';
const CHAT_MODEL = 'google/gemini-3-flash-preview';

interface RequestBody {
  file_base64: string;
  mime_type: string;
  file_name?: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT =
  'You extract structured data from freight broker rate confirmations. ' +
  'Only use values that are visibly printed on the document. ' +
  'Never guess, never infer, never calculate a money amount or a date/time that is not printed. ' +
  'If a value is not clearly present, return null for it. ' +
  'Every extracted value carries a confidence: "high" when the value is printed with an unambiguous label, ' +
  '"medium" when the value is present but the label or formatting is ambiguous, ' +
  '"low" when you are unsure. Money and date/time values must be "high" or null — if you would ' +
  'have to guess a dollar amount or an appointment time, return null instead. ' +
  'Return strictly one JSON object matching the requested schema.';

const USER_PROMPT = `Extract this rate confirmation into JSON.

Every scalar field is an object: {"value": <value or null>, "confidence": "high"|"medium"|"low"}.

{
  "broker": {
    "company_name": FIELD(string),
    "mc_number": FIELD(string, digits only, no "MC" prefix),
    "contact_name": FIELD(string),
    "contact_phone": FIELD(string),
    "contact_email": FIELD(string)
  },
  "load": {
    "broker_load_number": FIELD(string - the broker's own load/order/reference number),
    "bol_number": FIELD(string),
    "po_number": FIELD(string),
    "equipment_type": FIELD(one of "dry_van","reefer","flatbed","hopper_bottom"),
    "handling_type": FIELD(one of "live_load_unload","drop_and_hook"),
    "commodity": FIELD(string),
    "weight_lbs": FIELD(number),
    "loaded_miles": FIELD(number),
    "is_hazmat": FIELD(boolean),
    "is_team_load": FIELD(boolean)
  },
  "reefer": {
    "temp_f": FIELD(number, Fahrenheit),
    "temp_min_f": FIELD(number),
    "temp_max_f": FIELD(number),
    "precool_required": FIELD(boolean),
    "continuous_run": FIELD(boolean - true for continuous, false for cycle/start-stop),
    "notes": FIELD(string)
  },
  "rate": {
    "linehaul": FIELD(number - the base linehaul/flat rate line only),
    "fsc_amount": FIELD(number - fuel surcharge if listed as its own line),
    "total": FIELD(number - the total pay to carrier printed on the document),
    "line_items": [
      {
        "description": "exact label printed on the document",
        "amount": number,
        "category": one of "linehaul","fsc","stopoff","detention","layover","lumper","tonu","other",
        "stop_hint": "city, facility name, or stop number the charge refers to, or null",
        "confidence": "high"|"medium"|"low"
      }
    ]
  },
  "stops": [
    {
      "sequence": number starting at 1 in document order,
      "stop_type": "pickup" | "delivery" | "drop_and_hook",
      "facility_name": FIELD(string),
      "address_line1": FIELD(string),
      "address_line2": FIELD(string),
      "city": FIELD(string),
      "state": FIELD(2-letter state code),
      "zip": FIELD(string),
      "contact_name": FIELD(string),
      "contact_phone": FIELD(string),
      "appointment_start": FIELD("YYYY-MM-DDTHH:mm" local time as printed; null if no time printed),
      "appointment_end": FIELD("YYYY-MM-DDTHH:mm"; null unless a closing/end time is printed),
      "notes": FIELD(string - driver-relevant instructions for this stop only),
      "reference_numbers": [
        {
          "label": "exact label printed (e.g. PU#, Delivery #, BOL#, PO#, Appt #, LO, SI, SO)",
          "value": "the number",
          "useful": true or false - see the reference_numbers rule below,
          "reason": "short phrase explaining the useful judgement (e.g. load reference, GPS coordinate)",
          "confidence": "high"|"medium"|"low"
        }
      ]
    }
  ],
  "special_instructions": FIELD(string - carrier requirements that apply to the whole load),
  "loadout_signals": {
    "no_bol_mentioned": boolean - true if the document never mentions a BOL or bill of lading,
    "photo_pod_required": boolean - true if photos are named as proof of delivery,
    "multi_day_use_period": boolean - true if the carrier may keep/use the trailer for a period of days,
    "trailer_relocation_language": boolean - true if the job is described as relocating/repositioning an empty trailer,
    "no_commodity": boolean - true if no freight/commodity is named,
    "trailer_number": FIELD(string),
    "trailer_owner_company": FIELD(string),
    "relocation_fee": FIELD(number),
    "use_period_days": FIELD(number)
  }
}

Rules:
- Dates: normalize every date to a 4-digit year. If the year is not printed, use the year that keeps the stop dates in ascending order relative to any printed date; if that is still unclear, return null.
- Times: use 24-hour local time exactly as printed. A single printed time goes in appointment_start with appointment_end null. A range fills both. "FCFS"/open windows with only business hours printed: fill both from those hours at "medium" confidence.
- reference_numbers: list EVERY labelled number printed in the stop block, including unfamiliar broker shorthand. Never silently omit one — judge it instead and set "useful":
  - useful = true when a driver at a guard shack or a billing clerk would need it: pickup/delivery numbers, load or shipment references, order numbers, BOL, PO, appointment/confirmation numbers, pro numbers, seal and release numbers — including under shorthand labels such as LO, SI, SO, PU, DL, REF.
  - useful = false for operational noise: GPS latitude/longitude, pallet or piece counts, temperatures, weights, distances, page numbers, fax/phone numbers, MC/DOT numbers, quote numbers, carrier pay ids, and the broker's internal routing codes.
  - Judge the value, not just the label: a signed decimal such as -83.6779 is a coordinate however it is labelled; a long digit string labelled LO is a load reference.
  - Always give a short "reason" for the judgement.
- Do not put the broker's own load number in reference_numbers; it belongs in load.broker_load_number.
- line_items: one entry per printed money line. Do not invent a linehaul line by subtracting other lines from the total.
- If the document is not a rate confirmation, return every field null with an empty stops array.`;

type Conf = 'high' | 'medium' | 'low';

const KEEP_REF = /(^|\b)(pu|pick\s*up|pickup|delivery|del|drop|bol|bill\s*of\s*lading|po|purchase\s*order|appt|appointment|confirmation|conf|pro|order|release|seal)\b/i;
const DROP_REF = /(quote|carrier\s*pay|page|fax|mc\s*#|dot|invoice\s*to|tracking\s*id|w9|insurance)/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json(500, { error: 'Missing LOVABLE_API_KEY' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: 'Unauthorized' });
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['dispatcher', 'management', 'owner'])
      .limit(1);
    if (!roles || roles.length === 0) return json(403, { error: 'Dispatch role required' });

    const body = (await req.json()) as RequestBody;
    if (!body?.file_base64 || !body?.mime_type) {
      return json(400, { error: 'file_base64 and mime_type are required' });
    }
    const isPdf = body.mime_type === 'application/pdf';
    const isImage = body.mime_type.startsWith('image/');
    if (!isPdf && !isImage) {
      return json(400, { error: 'Unsupported file type. Upload a PDF or an image.' });
    }
    if (body.file_base64.length > 28_000_000) {
      return json(400, { error: 'That file is too large to parse. Use a file under 20 MB.' });
    }

    const contentBlocks: unknown[] = [{ type: 'text', text: USER_PROMPT }];
    if (isPdf) {
      contentBlocks.push({
        type: 'file',
        file: {
          filename: body.file_name || 'rate-confirmation.pdf',
          file_data: `data:${body.mime_type};base64,${body.file_base64}`,
        },
      });
    } else {
      contentBlocks.push({
        type: 'image_url',
        image_url: { url: `data:${body.mime_type};base64,${body.file_base64}` },
      });
    }

    const aiRes = await fetch(`${AI_GATEWAY}/chat/completions`, {
      method: 'POST',
      headers: { 'Lovable-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contentBlocks },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) return json(429, { error: 'AI is busy. Try again in a moment.' });
      if (aiRes.status === 402) return json(402, { error: 'AI credits exhausted. Ask an admin to top up.' });
      if (aiRes.status === 403) return json(403, { error: 'AI access is blocked for this workspace.' });
      console.error('AI gateway failed', aiRes.status, t.slice(0, 400));
      return json(502, { error: `AI request failed (${aiRes.status})` });
    }

    const data = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(raw); } catch {
      return json(502, { error: 'AI returned invalid JSON' });
    }

    // ---- normalizers -------------------------------------------------------
    const conf = (v: unknown): Conf =>
      v === 'high' || v === 'medium' || v === 'low' ? v : 'low';

    const str = (f: any) => {
      const v = f?.value;
      if (v === null || v === undefined) return { value: null, confidence: 'low' as Conf };
      const s = String(v).trim();
      return { value: s.length ? s : null, confidence: s.length ? conf(f?.confidence) : ('low' as Conf) };
    };
    const num = (f: any) => {
      const v = f?.value;
      if (v === null || v === undefined || v === '') return { value: null, confidence: 'low' as Conf };
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n)
        ? { value: n, confidence: conf(f?.confidence) }
        : { value: null, confidence: 'low' as Conf };
    };
    /** Money is never guessed: anything below high confidence is dropped. */
    const money = (f: any) => {
      const n = num(f);
      return n.confidence === 'high' ? n : { value: null, confidence: 'low' as Conf };
    };
    const bool = (f: any) => {
      const v = f?.value;
      if (typeof v === 'boolean') return { value: v, confidence: conf(f?.confidence) };
      if (v === 'true' || v === 'false') return { value: v === 'true', confidence: conf(f?.confidence) };
      return { value: null as boolean | null, confidence: 'low' as Conf };
    };
    const enumField = (f: any, allowed: string[]) => {
      const s = str(f);
      return s.value && allowed.includes(s.value) ? s : { value: null, confidence: 'low' as Conf };
    };
    /** Local datetime, no timezone shifting. Times are never guessed. */
    const dateTime = (f: any) => {
      const s = str(f);
      if (!s.value) return { value: null, confidence: 'low' as Conf };
      const m = s.value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (!m) return { value: null, confidence: 'low' as Conf };
      const [, y, mo, d, h, mi] = m;
      if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) {
        return { value: null, confidence: 'low' as Conf };
      }
      return { value: `${y}-${mo}-${d}T${h}:${mi}`, confidence: s.confidence };
    };
    const plainBool = (v: unknown) => v === true || v === 'true';

    const rawStops = Array.isArray(parsed.stops) ? parsed.stops : [];
    const stops = rawStops.slice(0, 12).map((s: any, i: number) => {
      const refsRaw = Array.isArray(s?.reference_numbers) ? s.reference_numbers : [];
      const references = refsRaw
        .map((r: any) => ({
          label: String(r?.label ?? '').trim(),
          value: String(r?.value ?? '').trim(),
          confidence: conf(r?.confidence),
        }))
        .filter((r: any) =>
          r.value.length > 0 &&
          r.value.length <= 60 &&
          KEEP_REF.test(r.label) &&
          !DROP_REF.test(r.label))
        .slice(0, 6);

      const type = String(s?.stop_type ?? '').trim();
      return {
        sequence: Number.isFinite(Number(s?.sequence)) ? Number(s.sequence) : i + 1,
        stop_type: ['pickup', 'delivery', 'drop_and_hook'].includes(type)
          ? type
          : (i === 0 ? 'pickup' : 'delivery'),
        facility_name: str(s?.facility_name),
        address_line1: str(s?.address_line1),
        address_line2: str(s?.address_line2),
        city: str(s?.city),
        state: (() => {
          const v = str(s?.state);
          return v.value ? { value: v.value.toUpperCase().slice(0, 2), confidence: v.confidence } : v;
        })(),
        zip: str(s?.zip),
        contact_name: str(s?.contact_name),
        contact_phone: str(s?.contact_phone),
        appointment_start: dateTime(s?.appointment_start),
        appointment_end: dateTime(s?.appointment_end),
        notes: str(s?.notes),
        references,
      };
    });

    const rawItems = Array.isArray(parsed.rate?.line_items) ? parsed.rate.line_items : [];
    const lineItems = rawItems
      .map((it: any) => {
        const amt = money({ value: it?.amount, confidence: it?.confidence ?? 'high' });
        const cat = String(it?.category ?? 'other');
        return {
          description: String(it?.description ?? '').trim().slice(0, 160) || 'Rate line',
          amount: amt.value,
          category: ['linehaul', 'fsc', 'stopoff', 'detention', 'layover', 'lumper', 'tonu', 'other'].includes(cat)
            ? cat : 'other',
          stop_hint: it?.stop_hint ? String(it.stop_hint).trim().slice(0, 120) : null,
          confidence: conf(it?.confidence),
        };
      })
      .filter((it: any) => it.amount !== null)
      .slice(0, 20);

    const ls = parsed.loadout_signals ?? {};

    return json(200, {
      broker: {
        company_name: str(parsed.broker?.company_name),
        mc_number: (() => {
          const v = str(parsed.broker?.mc_number);
          if (!v.value) return v;
          const digits = v.value.replace(/[^0-9]/g, '');
          return digits ? { value: digits, confidence: v.confidence } : { value: null, confidence: 'low' as Conf };
        })(),
        contact_name: str(parsed.broker?.contact_name),
        contact_phone: str(parsed.broker?.contact_phone),
        contact_email: str(parsed.broker?.contact_email),
      },
      load: {
        broker_load_number: str(parsed.load?.broker_load_number),
        bol_number: str(parsed.load?.bol_number),
        po_number: str(parsed.load?.po_number),
        equipment_type: enumField(parsed.load?.equipment_type, ['dry_van', 'reefer', 'flatbed', 'hopper_bottom']),
        handling_type: enumField(parsed.load?.handling_type, ['live_load_unload', 'drop_and_hook']),
        commodity: str(parsed.load?.commodity),
        weight_lbs: num(parsed.load?.weight_lbs),
        loaded_miles: num(parsed.load?.loaded_miles),
        is_hazmat: bool(parsed.load?.is_hazmat),
        is_team_load: bool(parsed.load?.is_team_load),
      },
      reefer: {
        temp_f: num(parsed.reefer?.temp_f),
        temp_min_f: num(parsed.reefer?.temp_min_f),
        temp_max_f: num(parsed.reefer?.temp_max_f),
        precool_required: bool(parsed.reefer?.precool_required),
        continuous_run: bool(parsed.reefer?.continuous_run),
        notes: str(parsed.reefer?.notes),
      },
      rate: {
        linehaul: money(parsed.rate?.linehaul),
        fsc_amount: money(parsed.rate?.fsc_amount),
        total: money(parsed.rate?.total),
        line_items: lineItems,
      },
      stops,
      special_instructions: str(parsed.special_instructions),
      loadout_signals: {
        no_bol_mentioned: plainBool(ls.no_bol_mentioned),
        photo_pod_required: plainBool(ls.photo_pod_required),
        multi_day_use_period: plainBool(ls.multi_day_use_period),
        trailer_relocation_language: plainBool(ls.trailer_relocation_language),
        no_commodity: plainBool(ls.no_commodity),
        trailer_number: str(ls.trailer_number),
        trailer_owner_company: str(ls.trailer_owner_company),
        relocation_fee: money(ls.relocation_fee),
        use_period_days: num(ls.use_period_days),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('parse-rate-confirmation error', msg);
    return json(500, { error: msg });
  }
});
