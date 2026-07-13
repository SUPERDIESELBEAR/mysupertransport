// SUPERDRIVE Staff Help — AI assistant for staff on how to use the dashboard
// and driver app. Grounded in staff-audience FAQs (via search_staff_faqs) and
// supplemented with general product knowledge.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-3-flash-preview';

interface Msg { role: 'user' | 'assistant'; content: string }
interface Body { messages: Msg[] }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const PRODUCT_OVERVIEW = `
SUPERDRIVE is the operations platform for SUPERTRANSPORT. It has two surfaces:

1. Management dashboard (staff): sidebar-driven app for staff (owner, management,
   onboarding_staff, dispatcher). Top sections:
   - Overview: KPIs and Compliance Summary (filtered to active insured Go-Live drivers).
   - Onboarding Pipeline: applicant pipeline with stages 1-9 (1 Background Check,
     2 Application Review, 3 ICA, 4 Truck Owner, 5 Equipment, 6 Pre-Employment
     Screening (PEI), 7 Insurance, 8 Pay Setup, 9 Payroll and Procedures).
     Stage 6 PEI runs previous-employer verification with 5-day auto-follow-ups
     for 30 days, then auto-creates a Good-Faith-Effort record.
   - Application Review: staff can Propose Changes, Revert (with courtesy email
     defaults per role), and see the Submitted Application Snapshot with signature.
   - Fleet Roster / Driver Hub: driver profiles, documents, cert reminders.
   - Fleet Compliance: expiring CDL, Med Cert, IRP, inspections.
   - Dispatch Board: Binder button on each driver card opens the Inspection Binder.
   - Operations sidebar group: Onboard Systems (equipment inventory including
     ELDs, BestPass, fuel cards with Available/Assigned/Deactivated) and
     MO Plate Registry (two-way sync with driver IRP docs).
   - FAQ Manager: staff-authored knowledge base (owner_operator + staff audiences).
   - Staff Help: this AI assistant.
   - Messaging, PEI, Documents Hub, Release Notes, and Pipeline Config.

2. SUPERDRIVE driver PWA (owner-operators): tab-based portal — Home, Status,
   Documents, Messages, Notifications, Equipment. Drivers upload docs, sign
   ICA, complete truck photos (Front / Driver Side / Passenger Side / Rear +
   tire angles), acknowledge Handbook / BOL-POD / Load-Out procedures, and
   complete Pay Setup.

Time zone is US Central. Uploads use blob-based flow with 60s timeouts and
cleanup on DB failure. RLS is enforced on every table.
`.trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Sign in required.' });

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json(500, { error: 'AI is not configured.' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: 'Session expired.' });
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner'])
      .limit(1);
    if (!roles || roles.length === 0) return json(403, { error: 'Staff role required.' });

    const body = (await req.json()) as Body;
    const messages = Array.isArray(body?.messages) ? body.messages.filter(m => m?.content?.trim()) : [];
    if (messages.length === 0) return json(400, { error: 'No message provided.' });

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUser?.content ?? '';

    // Retrieve top staff FAQs for the latest user question.
    let sources: { id: string; question: string; answer: string; category: string }[] = [];
    if (query.trim()) {
      const { data: hits } = await admin.rpc('search_staff_faqs', { q: query.trim() });
      sources = ((hits as any[]) ?? [])
        .slice(0, 8)
        .map(h => ({ id: h.id, question: h.question, answer: h.answer, category: h.category }));
    }

    const faqContext = sources.length
      ? sources.map((s, i) =>
          `[FAQ ${i + 1}] (id: ${s.id}) ${s.question}\n${s.answer}`,
        ).join('\n\n---\n\n')
      : '(no FAQ articles matched this query)';

    const system = `You are the SUPERDRIVE Staff Help assistant. You answer staff questions about how to use the SUPERDRIVE management dashboard and driver-facing app.

Priorities:
1. When any of the FAQ articles below are relevant, ground your answer in them and list which FAQ ids you used.
2. Otherwise answer from the SUPERDRIVE product overview below.
3. If neither covers the question, say plainly: "I don't have documentation for this yet. You can add it in FAQ Manager so staff can find it next time."

Rules:
- Be concise. Use short numbered steps for procedures.
- Never invent features, table names, keyboard shortcuts, or menu paths that aren't in the context.
- Do not answer about specific driver, applicant, or operational data — you only explain how to USE the platform.
- Format answers in markdown.

### SUPERDRIVE product overview
${PRODUCT_OVERVIEW}

### Relevant staff FAQ articles
${faqContext}`;

    const gwRes = await fetch(AI_GATEWAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    if (gwRes.status === 429) return json(429, { error: 'The assistant is rate-limited. Please retry in a moment.' });
    if (gwRes.status === 402) return json(402, { error: 'AI credits are exhausted. Add credits in workspace billing.' });
    if (!gwRes.ok) {
      const text = await gwRes.text();
      console.error('AI gateway error', gwRes.status, text);
      return json(502, { error: 'Assistant unavailable. Please try again.' });
    }

    const data = await gwRes.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() ?? '';

    // Only surface sources the model likely used (best-effort: keep top 4).
    const surfaced = sources.slice(0, 4).map(s => ({ id: s.id, question: s.question, category: s.category }));

    return json(200, { answer, sources: surfaced });
  } catch (err) {
    console.error('staff-help-chat error', err);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
});