// Parse a maintenance / repair invoice (PDF or image) using Lovable AI
// and return structured fields to prefill the Add Maintenance Record form.
// Staff-authenticated.

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
  'You extract structured data from truck repair / maintenance invoices and receipts. ' +
  'Only use values visible on the document. If a field is not clearly present, return null for it. ' +
  'Never invent values. Return strictly a JSON object matching the requested schema.';

const USER_PROMPT =
  'Extract the following fields from this maintenance / repair invoice.\n\n' +
  'Return a JSON object with exactly these keys:\n' +
  '{\n' +
  '  "service_date": "YYYY-MM-DD or null",\n' +
  '  "odometer": "integer miles or null",\n' +
  '  "shop_name": "vendor / shop name or null (e.g. Love\'s Travel Stop #614, TA Petro, Joe\'s Diesel Repair)",\n' +
  '  "amount": "invoice total as a number (no currency symbol) or null",\n' +
  '  "invoice_number": "invoice / receipt / RO number as a string or null",\n' +
  '  "categories": ["array containing zero or more of: pm_service, general_repair, tires"],\n' +
  '  "description": "one short sentence summarizing the line items or work performed, or null"\n' +
  '}\n\n' +
  'Category rules:\n' +
  '- pm_service: preventive maintenance, PM service, oil change, filters, DOT/annual inspection, greasing.\n' +
  '- tires: any tire purchase, tire repair, mount/balance, alignment, tire road service.\n' +
  '- general_repair: any other mechanical repair (engine, brakes, electrical, DEF, aftertreatment, cooling, drivetrain, tow, diagnostic).\n' +
  'Multiple categories are allowed if the invoice covers multiple types.\n' +
  'If nothing on the invoice fits, return an empty array.';

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
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner'])
      .limit(1);
    if (!roles || roles.length === 0) return json(403, { error: 'Staff role required' });

    const body = (await req.json()) as RequestBody;
    if (!body?.file_base64 || !body?.mime_type) {
      return json(400, { error: 'file_base64 and mime_type are required' });
    }

    const isPdf = body.mime_type === 'application/pdf';
    const isImage = body.mime_type.startsWith('image/');
    if (!isPdf && !isImage) {
      return json(400, { error: 'Unsupported file type. Upload a PDF or image.' });
    }

    const contentBlocks: any[] = [{ type: 'text', text: USER_PROMPT }];
    if (isPdf) {
      contentBlocks.push({
        type: 'file',
        file: {
          filename: body.file_name || 'invoice.pdf',
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
      if (aiRes.status === 429) {
        return json(429, { error: 'AI is busy. Please try again in a moment.' });
      }
      if (aiRes.status === 402) {
        return json(402, { error: 'AI credits exhausted. Ask an admin to top up.' });
      }
      console.error('AI gateway failed', aiRes.status, t.slice(0, 400));
      return json(502, { error: `AI request failed (${aiRes.status})` });
    }

    const data = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch {
      return json(502, { error: 'AI returned invalid JSON' });
    }

    const allowedCats = new Set(['pm_service', 'general_repair', 'tires']);
    const rawCats = Array.isArray(parsed.categories) ? parsed.categories : [];
    const categories = rawCats.filter((c: unknown) => typeof c === 'string' && allowedCats.has(c));

    const toNumber = (v: unknown) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const toInt = (v: unknown) => {
      const n = toNumber(v);
      return n === null ? null : Math.round(n);
    };
    const toStr = (v: unknown) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    };
    const toDate = (v: unknown) => {
      const s = toStr(v);
      if (!s) return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };

    return json(200, {
      service_date: toDate(parsed.service_date),
      odometer: toInt(parsed.odometer),
      shop_name: toStr(parsed.shop_name),
      amount: toNumber(parsed.amount),
      invoice_number: toStr(parsed.invoice_number),
      categories,
      description: toStr(parsed.description),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('parse-maintenance-invoice error', msg);
    return json(500, { error: msg });
  }
});