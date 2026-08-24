// Parse a broker rate confirmation (PDF or image) with Lovable AI and return
// structured, confidence-tagged load data for the Create Load review screen.
// Staff-authenticated. The model never guesses money or times.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1';
const CHAT_MODEL = 'google/gemini-3-flash-preview';

/**
 * Contract identity of this build. Bump `contract` whenever the response SHAPE
 * changes. The client compares it against the shape it was written for and
 * warns on divergence: a stale deploy silently returning an older contract
 * presented once as three unrelated-looking bugs, and catching that from a
 * stray log string was luck, not a control.
 */
const PARSER_BUILD = {
  contract: 4,
  built_at: '2026-08-24T00:00:00Z',
  notes: 'contract 3 + anti text-layer-artifact transcription rule',
};


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
    "contact_email": FIELD(string),
    "address_line1": FIELD(string - street of the broker's own address; see the broker address rule),
    "address_line2": FIELD(string - suite/unit only),
    "city": FIELD(string),
    "state": FIELD(2-letter state code),
    "zip": FIELD(string),
    "address_source": "remit_to" | "bill_to" | "letterhead" | null (NOT a FIELD object - a bare string naming which block the address above came from)
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
      "notes_verbatim": FIELD(string - the stop's printed comment/notes line copied EXACTLY as printed, character for character; see the verbatim rule),
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
  "references": [
    {
      "label": "exact Reference Type label printed in the document-level References table (e.g. BOL, PRO, Pickup Number, PO Number, Mode)",
      "value": "the value printed next to it",
      "confidence": "high"|"medium"|"low"
    }
  ],
  "special_instructions": FIELD(string - a SHORT condensed summary for display only; the stored value is the verbatim capture below),
  "verbatim": {
    "broker_terms": FIELD(string - the broker's terms/conditions paragraph, copied EXACTLY as printed),
    "special_instructions": FIELD(string - the block printed under the "Special Instructions" heading, copied EXACTLY as printed)
  },
  "loadout_signals": {
    "no_bol_mentioned": boolean - true if the document never mentions a BOL or bill of lading,
    "photo_pod_required": boolean - true if photos are named as proof of delivery,
    "multi_day_use_period": boolean - true if the carrier may keep/use the trailer for a period of days,
    "trailer_relocation_language": boolean - true if the job is described as relocating/repositioning an empty trailer,
    "no_commodity": boolean - true if no freight/commodity is named,
    "trailer_number": FIELD(string),
    "trailer_owner_company": FIELD(string),
    "relocation_fee": FIELD(number),
    "use_period_days": FIELD(number),
    "use_start_date": FIELD(string - YYYY-MM-DD, first day of the agreed trailer use window as printed),
    "use_end_date": FIELD(string - YYYY-MM-DD, last day of the agreed trailer use window as printed)
  }
}

Rules:
- broker address: capture AT MOST ONE address for the broker, from a single addressed block, and say which block it came from in "address_source". Preference order:
  1. An explicit remit-to / payment address ("Remit To", "Send Invoices To", "Payment Address", "Billing Address") → address_source "remit_to", confidence "high".
  2. A bill-to / invoice-to address ("Bill To", "Invoice To") → address_source "bill_to", confidence "high".
  3. The broker's corporate or letterhead address, ONLY when neither of the above is printed → address_source "letterhead", confidence "medium".
  4. Otherwise every broker address field is null and address_source is null.
  - NEVER mix blocks: street, city, state and zip must all come from the one chosen block. A partial block is fine (street with no zip); do not complete it from another block.
  - NEVER take the broker address from a shipper, consignee, facility or stop block, from a page footer, from fine-print legal terms, or from a factoring / lockbox / third-party payment notice.
  - NEVER infer an address. A logo, a phone area code, a website, an email domain or a bare city name is NOT an address — return null. A blank address is the correct answer when no addressed broker block is printed.
- Dates: normalize every date to a 4-digit year. If the year is not printed, use the year that keeps the stop dates in ascending order relative to any printed date; if that is still unclear, return null.
- Times: use 24-hour local time exactly as printed. A single printed time goes in appointment_start with appointment_end null. A range fills both. "FCFS"/open windows with only business hours printed: fill both from those hours at "medium" confidence.
- reference_numbers: list EVERY labelled number printed in the stop block, including unfamiliar broker shorthand. Never silently omit one — judge it instead and set "useful":
  - useful = true when a driver at a guard shack or a billing clerk would need it: pickup/delivery numbers, load or shipment references, order numbers, BOL, PO, appointment/confirmation numbers, pro numbers, seal and release numbers — including under shorthand labels such as LO, SI, SO, PU, DL, REF.
  - useful = false for operational noise: GPS latitude/longitude, pallet or piece counts, temperatures, weights, distances, page numbers, fax/phone numbers, MC/DOT numbers, quote numbers, carrier pay ids, and the broker's internal routing codes.
  - Treat a BARE two-letter or unexplained code (e.g. "DJ", "XR") with suspicion: mark it useful = false unless the surrounding text clearly shows a driver would present it at the gate.
  - A value repeating on several stops is NOT by itself a reason to reject it: one shipment or PO number printed on every stop is normal. Judge each row on its label and value; report the repeat in "reason" and let the system record it.
  - Never invent a stop reference. If a stop prints no gate reference, return an empty reference_numbers array — a blank field is correct.
  - Judge the value, not just the label: a signed decimal such as -83.6779 is a coordinate however it is labelled; a long digit string labelled LO is a load reference.
  - Always give a short "reason" for the judgement.
- Do not put the broker's own load number in reference_numbers; it belongs in load.broker_load_number.
- line_items: one entry per printed money line. Do not invent a linehaul line by subtracting other lines from the total.
- special_instructions: sweep the ENTIRE document, every page. Terms live in the Agreement, Terms & Conditions, Carrier Requirements, fine print and footers as often as under a heading called "Instructions" — that block is one source among several, never the whole answer.
  - There are TWO independent reasons to INCLUDE a term. A term qualifies if EITHER one applies on its own — a penalty or price is NOT required.
    1. PRICED OR TIMED: the term carries a specific dollar amount or a specific time threshold. For example: detention rate and free time, layover pay, late-arrival penalties, missed check-call fines, tracking-compliance fines, paperwork deadlines and late-paperwork deductions, check/advance processing fees, OS&D reporting windows and fines, fuel advance terms.
    2. OPERATIONAL, WITH OR WITHOUT A PENALTY: the term tells the driver or dispatcher what to DO on THIS load, even when no fine, fee or deadline is printed anywhere near it. Capture all of these: whether the load is no-touch, driver-assist or driver-unload; requirements to call dispatch or the broker on arrival, at loading, when loaded or when empty; facility check-in procedures such as where to report, which gate, door or office to use; whether an appointment is required or the facility is first-come-first-served; PPE and equipment requirements such as load locks, straps, tarps, chains or a specific trailer type; seal handling instructions; required tracking apps; and any instruction about what to do when something goes wrong on this load. Never drop one of these just because it has no dollar amount attached to it.
  - EXCLUDE general legal boilerplate: double-brokering prohibitions, insurance and coverage requirements, liability allocation, indemnification, cargo damage responsibility, governing law and venue, signature blocks, and anything restating standard broker-carrier agreement language with no load-specific consequence.
  - The governing distinction: capture anything that tells the driver or dispatcher what to do on this load, whether or not a penalty is attached; skip anything that only allocates legal responsibility. "Detention $40/hr after 3 hours free" passes. "No touch freight; call dispatch on arrival" passes. "Carrier is responsible for any damage to product" does not.
  - Format as one short line per term, quoting printed amounts and thresholds verbatim. Omit anything not printed. Do not pad with prose.
- VERBATIM CAPTURE (verbatim.broker_terms, verbatim.special_instructions, stops[].notes_verbatim): these are transcriptions, not summaries. Copy the printed text EXACTLY: same wording, same order, same punctuation, same capitalisation, same asterisks and symbols. Do not reword, reorder, shorten, expand, de-duplicate, fix spelling or fix grammar. Do not drop phone numbers, email addresses, dollar amounts or order numbers. Do not add anything that is not printed.
  - Keep the blocks SEPARATE. The broker's terms paragraph and the block printed under a "Special Instructions" heading are two different sources: never concatenate them, and never move text between them. If a document has only one of the two, the other is null.
  - Preserve printed line breaks as "\\n". Preserve doubled asterisks (**) exactly where they appear.
  - READ THE PRINTED PAGE, NOT THE PDF'S EMBEDDED TEXT. Some documents carry a broken text layer where a printed span such as 53' 102" comes through as a paragraph mark, a control character, an escaped entity (&#182;) or a replacement character. Never reproduce those: they are not printed on the page. Transcribe the glyphs a reader sees. If a span is genuinely illegible, write what you can read and leave the illegible part out rather than inserting a symbol.
  - Never emit the characters \u00b6 (pilcrow), \ufffd (replacement character), or any control character inside a verbatim field.
  - special_instructions (the condensed field) is for display only. If you cannot produce a faithful verbatim copy of a block, return null for that verbatim field rather than a paraphrase.
- references: transcribe the document-level References table rows exactly as printed, one entry per printed row, label and value unchanged. Include EVERY row, including categorical rows such as "Mode: TL" — the system decides what is an identifier. Do not merge rows that share a value under different Reference Types: "BOL BG969676425" and "PRO BG969676425" are two rows. If the document has no such table, return an empty array.
- If the document is not a rate confirmation, return every field null with an empty stops array.`;


type Conf = 'high' | 'medium' | 'low';

/** Known-good labels: kept no matter what the model judged. */
const KEEP_REF = /(^|\b)(pu|pick\s*up|pickup|delivery|del|dl|drop|bol|bill\s*of\s*lading|po|purchase\s*order|appt|appointment|confirmation|conf|pro|order|release|seal|ref|lo|si|so)\b/i;
/**
 * Recognized shipment/order labels. A value under one of these survives the
 * cross-stop duplicate rule: the same shipment number printed on every stop is
 * exactly what a guard shack asks for, not an internal routing code.
 * Deliberately narrow — opaque shorthand (DJ, ZZ, F9) is NOT in here.
 */
const SHIPMENT_REF =
  /(^|\b)(so|si|pro|order|shipment|bol|bill\s*of\s*lading|po|purchase\s*order|pu|pick\s*up|pickup|delivery|del|dl|release|seal|appt|appointment|confirmation|conf)\b/i;
/** Labels that spell out what the number is, preferred when collapsing near-duplicates. */
const EXPLICIT_REF_LABEL = /(shipment|order|pick\s*up|pickup|delivery|release|seal|appointment|bill\s*of\s*lading|purchase\s*order|confirmation)/i;
/** Known noise: dropped no matter what the model judged. */
const DROP_REF = /(quote|carrier\s*pay|page|fax|mc\s*#|dot|invoice\s*to|tracking\s*id|w9|insurance|lat\b|latitude|lon\b|lng|longitude|coord|pallet|piece|case\s*count|cube|temp)/i;
/** A decimal-degree value is a coordinate whatever the broker labelled it. */
const COORDINATE_VALUE = /^-?\d{1,3}\.\d{3,}$/;

/** Models wrap the requested object in arrays or single-key envelopes; unwrap those. */
function unwrapPayload(input: unknown): Record<string, any> {
  let node: any = input;
  for (let depth = 0; depth < 3; depth++) {
    if (Array.isArray(node)) {
      node = node.find((item) => item && typeof item === 'object') ?? {};
      continue;
    }
    if (!node || typeof node !== 'object') return {};
    const looksLikeResult = 'broker' in node || 'stops' in node || 'load' in node || 'rate' in node;
    const keys = Object.keys(node);
    if (!looksLikeResult && keys.length === 1 && node[keys[0]] && typeof node[keys[0]] === 'object') {
      node = node[keys[0]];
      continue;
    }
    return node as Record<string, any>;
  }
  return node && typeof node === 'object' && !Array.isArray(node) ? node : {};
}

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

    const callGateway = () => fetch(`${AI_GATEWAY}/chat/completions`, {
      method: 'POST',
      headers: { 'Lovable-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contentBlocks },
        ],
        response_format: { type: 'json_object' },
        // Terms sweeps run long; leave room so a dense list is never clipped.
        max_tokens: 8000,
      }),
    });

    // 429/5xx from the gateway are transient — retry with bounded backoff.
    let aiRes = await callGateway();
    for (let attempt = 1; attempt <= 3 && (aiRes.status === 429 || aiRes.status >= 500); attempt++) {
      const retryAfter = Number(aiRes.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10_000)
        : Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 400);
      console.warn(`parse-rate-confirmation: gateway ${aiRes.status}, retry ${attempt} in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      aiRes = await callGateway();
    }

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) return json(429, { error: 'AI is busy. Try again in a moment.' });
      if (aiRes.status === 402) return json(402, { error: 'AI credits exhausted. Ask an admin to top up.' });
      if (aiRes.status === 403) return json(403, { error: 'AI access is blocked for this workspace.' });
      console.error('AI gateway failed', aiRes.status, t.slice(0, 400));
      if (aiRes.status >= 500) {
        return json(503, { error: 'The AI service is temporarily unavailable. Please try parsing again in a moment.' });
      }
      return json(502, { error: `AI request failed (${aiRes.status})` });
    }


    const data = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch {
      console.error('parse-rate-confirmation: AI returned invalid JSON', String(raw).slice(0, 400));
      return json(502, { error: 'AI returned invalid JSON' });
    }
    const parsed = unwrapPayload(payload);

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
    /** Every discarded reference is logged so a filtered-out broker code is visible. */
    const droppedRefs: string[] = [];
    const stops = rawStops.slice(0, 12).map((s: any, i: number) => {
      const refsRaw = Array.isArray(s?.reference_numbers) ? s.reference_numbers : [];
      const references = refsRaw
        .map((r: any) => ({
          label: String(r?.label ?? '').trim(),
          value: String(r?.value ?? '').trim(),
          useful: r?.useful,
          reason: r?.reason ? String(r.reason).trim().slice(0, 80) : '',
          confidence: conf(r?.confidence),
        }))
        .filter((r: any) => {
          const drop = (rule: string) => {
            droppedRefs.push(
              `stop ${i + 1}: "${r.label || '(no label)'}"=${r.value.slice(0, 24) || '(empty)'} [${rule}${r.reason ? `: ${r.reason}` : ''}]`,
            );
            return false;
          };
          if (!r.value.length) return drop('empty value');
          if (r.value.length > 60) return drop('oversize value');
          // Explicit denylist and coordinate-shaped values always lose.
          if (DROP_REF.test(r.label)) return drop('denylist label');
          if (COORDINATE_VALUE.test(r.value)) return drop('coordinate-shaped value');
          // Explicit allowlist always wins.
          if (KEEP_REF.test(r.label)) return true;
          // Anything unrecognized is governed by the model's judgement.
          if (r.useful === true) return true;
          if (r.useful === false) return drop('model judged not useful');
          return drop('unclassified label');
        })
        .map(({ label, value, confidence }: any) => ({ label, value, confidence }))
        .slice(0, 8);

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
        notes_verbatim: str(s?.notes_verbatim),
        references,
      };
    });

    // Cross-stop and load-level collapsing used to happen here, keyed on the
    // VALUE alone. That is what silently dropped a legitimate shipment number
    // printed on more than one stop, and what hid a `PRO` row whose value also
    // appears as the `BOL`. Both are now handled downstream by
    // `classifyReferences` in src/lib/referenceClasses.ts, keyed on
    // (class, value) with one citation per stop the value was printed against.
    // Only the per-row noise filters above run in here.
    const normRef = (v: string) => v.replace(/[^0-9a-z]/gi, '').toLowerCase();
    /** Rows kept that would previously have been discarded, logged for visibility. */
    const keptRefs: string[] = [];
    const seenValues = new Map<string, number>();
    stops.forEach((s: any) =>
      new Set(s.references.map((r: any) => normRef(r.value))).forEach((k) =>
        seenValues.set(k as string, (seenValues.get(k as string) ?? 0) + 1),
      ),
    );
    stops.forEach((s: any, i: number) => {
      s.references.forEach((r: any) => {
        if ((seenValues.get(normRef(r.value)) ?? 0) > 1) {
          keptRefs.push(`stop ${i + 1}: "${r.label}"=${r.value.slice(0, 24)} [printed on multiple stops: kept, cited per stop]`);
        }
      });
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

    if (droppedRefs.length) {
      console.log('parse-rate-confirmation: discarded reference numbers —', droppedRefs.join(' | '));
    }
    if (keptRefs.length) {
      console.log('parse-rate-confirmation: shared references kept —', keptRefs.join(' | '));
    }

    // Money and reference evidence, logged every run. Without this the only way
    // to tell "the model never returned the line" from "the diff dropped it" is
    // inference, and money rows are the last place to be inferring.
    const docRefsRaw = Array.isArray(parsed.references) ? parsed.references : [];
    console.log(
      `parse-rate-confirmation: build contract=${PARSER_BUILD.contract} built_at=${PARSER_BUILD.built_at}`,
    );
    console.log(
      'parse-rate-confirmation: line_items —',
      lineItems.length
        ? lineItems
            .map((it: any) => `"${it.description}" $${it.amount} [${it.category}] (${it.confidence})`)
            .join(' | ')
        : '(none)',
    );
    console.log(
      'parse-rate-confirmation: rate —',
      `linehaul=${parsed.rate?.linehaul?.value ?? null} fsc=${parsed.rate?.fsc_amount?.value ?? null} total=${parsed.rate?.total?.value ?? null}`,
    );
    console.log(
      'parse-rate-confirmation: document references —',
      docRefsRaw.length
        ? docRefsRaw
            .map((r: any) => `"${String(r?.label ?? '').trim()}"=${String(r?.value ?? '').trim()}`)
            .join(' | ')
        : '(none)',
    );
    console.log(
      'parse-rate-confirmation: verbatim —',
      `special_instructions=${(parsed.verbatim?.special_instructions?.value ?? '').length} chars, ` +
        `broker_terms=${(parsed.verbatim?.broker_terms?.value ?? '').length} chars`,
    );


    const result = {
      parser_build: PARSER_BUILD,

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
        address_line1: str(parsed.broker?.address_line1),
        address_line2: str(parsed.broker?.address_line2),
        city: str(parsed.broker?.city),
        state: (() => {
          const v = str(parsed.broker?.state);
          return v.value ? { value: v.value.toUpperCase().slice(0, 2), confidence: v.confidence } : v;
        })(),
        zip: (() => {
          const v = str(parsed.broker?.zip);
          if (!v.value) return v;
          const cleaned = v.value.replace(/[^0-9-]/g, '').slice(0, 10);
          return cleaned ? { value: cleaned, confidence: v.confidence } : { value: null, confidence: 'low' as Conf };
        })(),
        address_source: (() => {
          const s = String(parsed.broker?.address_source ?? '').trim().toLowerCase();
          return s === 'remit_to' || s === 'bill_to' || s === 'letterhead' ? s : null;
        })(),
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
      verbatim: {
        broker_terms: str(parsed.verbatim?.broker_terms),
        special_instructions: str(parsed.verbatim?.special_instructions),
      },
      references: (Array.isArray(parsed.references) ? parsed.references : [])
        .map((r: any) => ({
          label: String(r?.label ?? '').trim(),
          value: String(r?.value ?? '').trim(),
          confidence: conf(r?.confidence),
        }))
        .filter((r: any) => r.value.length > 0 && r.value.length <= 60)
        .slice(0, 24),
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
        // The use window is negotiated per load and stated on the document, so
        // it is read from the page rather than derived from a fixed duration.
        use_start_date: str(ls.use_start_date),
        use_end_date: str(ls.use_end_date),
      },
    };

    // A parse that yields nothing is a failure, never a silent success.
    const gotAnything =
      !!result.broker.company_name.value ||
      !!result.load.broker_load_number.value ||
      !!result.load.bol_number.value ||
      result.rate.total.value !== null ||
      result.rate.linehaul.value !== null ||
      result.rate.line_items.length > 0 ||
      result.stops.length > 0;

    if (!gotAnything) {
      console.error(
        'parse-rate-confirmation: empty extraction.',
        'payload type:', Array.isArray(payload) ? 'array' : typeof payload,
        'top-level keys:', JSON.stringify(Object.keys(parsed ?? {})),
        'raw prefix:', String(raw).slice(0, 600),
      );
      return json(422, {
        error: 'The document was read but no load data could be extracted from it. Check that this is a rate confirmation, or enter the load manually.',
      });
    }

    return json(200, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('parse-rate-confirmation error', msg);
    return json(500, { error: msg });
  }
});
