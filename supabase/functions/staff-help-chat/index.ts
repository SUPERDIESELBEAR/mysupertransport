// SUPERDRIVE Staff Help — AI assistant for staff on how to use the dashboard
// and driver app. Grounded in staff-audience FAQs, the live help index, and
// general product knowledge.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const EMBED_URL = 'https://ai.gateway.lovable.dev/v1/embeddings';
const EMBED_MODEL = 'openai/text-embedding-3-small';
const MODEL = 'google/gemini-3.6-flash';

interface Msg { role: 'user' | 'assistant'; content: string }
interface HelpContextEntry {
  id: string;
  title: string;
  page: string;
  route: string;
  breadcrumb: string;
  steps?: string[];
  keywords: string[];
  surface: 'management' | 'driver-pwa';
}
interface Body {
  messages: Msg[];
  contextEntries?: HelpContextEntry[];
  threadId?: string | null;
}

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
    const contextEntries = (body?.contextEntries ?? []).slice(0, 12);

    // Retrieve top staff FAQs for the latest user question.
    let sources: { id: string; question: string; answer: string; category: string }[] = [];
    if (query.trim()) {
      const { data: hits } = await admin.rpc('search_staff_faqs', { q: query.trim() });
      sources = ((hits as any[]) ?? [])
        .slice(0, 8)
        .map(h => ({ id: h.id, question: h.question, answer: h.answer, category: h.category }));
    }

    // Vector retrieval from staff_help_knowledge (pgvector).
    type KBHit = { id: string; source: string; source_id: string; title: string; route: string | null; section: string; content: string; similarity: number };
    let kbHits: KBHit[] = [];
    if (query.trim()) {
      try {
        const embRes = await fetch(EMBED_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: EMBED_MODEL, input: query.trim() }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          const vec = embData?.data?.[0]?.embedding as number[] | undefined;
          if (vec) {
            const { data: matches, error: matchErr } = await admin.rpc('match_staff_help_knowledge', {
              query_embedding: vec as unknown as string,
              match_count: 8,
              min_similarity: 0.3,
            });
            if (matchErr) console.warn('match_staff_help_knowledge', matchErr);
            kbHits = ((matches as any[]) ?? []) as KBHit[];
          }
        } else {
          console.warn('embed query failed', embRes.status, await embRes.text());
        }
      } catch (e) {
        console.warn('embed error', e);
      }
    }

    const faqContext = sources.length
      ? sources.map((s, i) =>
          `[FAQ ${i + 1}] (id: ${s.id}) ${s.question}\n${s.answer}`,
        ).join('\n\n---\n\n')
      : '(no FAQ articles matched this query)';

    const indexContext = contextEntries.length
      ? contextEntries.map((e, i) =>
          `[INDEX ${i + 1}] (id: ${e.id}) ${e.title} — ${e.breadcrumb}\nRoute: ${e.route}\nPage: ${e.page}\nSurface: ${e.surface}\n${e.steps ? 'Steps:\n' + e.steps.map((s, j) => `${j + 1}. ${s}`).join('\n') : 'No steps provided.'}`,
        ).join('\n\n---\n\n')
      : '(no help index entries matched this query)';

    const kbContext = kbHits.length
      ? kbHits.map((h, i) =>
          `[KB ${i + 1}] (source: ${h.source}/${h.source_id}${h.route ? `, route: ${h.route}` : ''}, sim: ${h.similarity.toFixed(2)}) ${h.title}\n${h.content}`,
        ).join('\n\n---\n\n')
      : '(no knowledge base chunks matched this query)';

    const system = `You are the SUPERDRIVE Staff Help assistant. You answer staff questions about how to use the SUPERDRIVE management dashboard and driver-facing app.

Priorities:
1. If any help index entry below matches the question, use its title, route, and steps to answer. Always use the markdown format [go:ENTRY_ID] to create clickable links that jump to the relevant page. Only use ENTRY_ID values that are explicitly listed in the index.
2. If any FAQ article below is relevant, ground your answer in it and list the FAQ id.
3. Otherwise answer from the SUPERDRIVE product overview below.
4. If none of the above cover the question, say plainly: "I don't have documentation for this yet. You can add it in FAQ Manager so staff can find it next time."

Rules:
- Be concise. Use short numbered steps for procedures.
- Never invent features, table names, keyboard shortcuts, or menu paths that aren't in the context.
- Do not answer about specific driver, applicant, or operational data — you only explain how to USE the platform.
- Format answers in markdown. Use [go:ENTRY_ID] markers inline where you mention a page/section so the user can click and jump there.
- After your answer, on a new line, add exactly this block:
  <FOLLOWUPS>
  question 1
  question 2
  question 3
  </FOLLOWUPS>
  Each follow-up must be a short, natural next question a staff user might ask given the conversation so far. Provide 2–3 items. If you truly cannot think of any, output an empty <FOLLOWUPS></FOLLOWUPS> block.

### SUPERDRIVE product overview
${PRODUCT_OVERVIEW}

### Relevant help index entries
${indexContext}

### Relevant staff FAQ articles
${faqContext}`;

    const augmentedSystem = system + `\n\n### Relevant knowledge base chunks (semantic search)\n${kbContext}`;

    const gwRes = await fetch(AI_GATEWAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: augmentedSystem }, ...messages],
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
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';

    // Extract follow-ups block, strip it from displayed answer.
    let answer = raw;
    let followUps: string[] = [];
    const fuMatch = raw.match(/<FOLLOWUPS>([\s\S]*?)<\/FOLLOWUPS>/i);
    if (fuMatch) {
      answer = raw.replace(fuMatch[0], '').trim();
      followUps = fuMatch[1]
        .split('\n')
        .map(s => s.replace(/^\s*[-*\d.)\s]+/, '').trim())
        .filter(s => s.length > 3 && s.length < 200)
        .slice(0, 3);
    }

    // Surface both FAQ and index sources so users can click through to the relevant page.
    const faqSources = sources.slice(0, 4).map(s => ({ id: s.id, question: s.question, category: s.category }));
    const indexSources = contextEntries.slice(0, 6).map(e => ({
      id: e.id,
      question: e.title,
      category: e.breadcrumb,
      route: e.route,
    }));
    const surfaced = [...indexSources, ...faqSources];

    // Log the query for analytics (best-effort, do not fail the request).
    try {
      const answeredFrom = sources.length > 0
        ? 'faq'
        : contextEntries.length > 0
          ? 'index'
          : kbHits.length > 0
            ? 'kb'
            : /don't have documentation/i.test(answer)
              ? 'none'
              : 'overview';
      await admin.from('staff_help_query_log').insert({
        user_id: userId,
        thread_id: body?.threadId ?? null,
        query: query.slice(0, 500),
        matched_faq_ids: sources.map(s => s.id),
        matched_help_entry_ids: contextEntries.map(e => e.id),
        answered_from: answeredFrom,
      });
    } catch (logErr) {
      console.warn('query log insert failed', logErr);
    }

    return json(200, { answer, sources: surfaced, followUps });
  } catch (err) {
    console.error('staff-help-chat error', err);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
});
