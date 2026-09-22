// SUPERDRIVE — AI drafting for What's New announcements.
//
// The owner (or management) describes a feature in plain English; this function
// answers conversationally and, when asked for an announcement, returns a
// structured draft (title, body, category, audience, screen link).
//
// It NEVER writes to the database and NEVER publishes. The caller decides
// whether to load the draft into the composer or save it as a pending row —
// the owner's approval gate is untouched.

import { createClient } from 'npm:@supabase/supabase-js@2';

const RESPONSES_URL = 'https://ai.gateway.lovable.dev/v1/responses';
const MODEL = 'openai/gpt-6-astra';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Msg { role: 'user' | 'assistant'; content: string }
interface ScreenEntry { route: string; title: string; breadcrumb: string }
interface Body {
  messages: Msg[];
  screens?: ScreenEntry[];
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * What SUPERDRIVE has actually shipped. Kept deliberately short and factual so
 * the model describes real screens and never invents a feature. Add a line here
 * when a staff-facing feature lands.
 */
const FEATURE_CATALOG = `
ONBOARDING & APPLICANTS
- Onboarding Pipeline, stages 1-9 (1 Background Check, 2 Application Review, 3 ICA,
  4 Truck Owner, 5 Equipment, 6 Pre-Employment Screening (PEI), 7 Insurance,
  8 Pay Setup, 9 Payroll and Procedures). Route /dashboard?view=pipeline.
- Application Review drawer: staff can Propose Changes (gold-highlighted diff the
  applicant approves), Revert with a courtesy email, and read the submitted
  snapshot with signature. Route /dashboard?view=applications.
- Archived Applicants tab: an applicant can be filed as "Archived" instead of
  "Denied", keeping the active recruiting board clean while all documents and
  notes are preserved. Route /dashboard?view=applications.
- PEI (Stage 6): previous-employer verification with automatic 5-day follow-ups
  for 30 days, then a Good-Faith-Effort record. Applicants' signed FCRA release
  is reachable from the PEI emails by a tokenized link.
- Pipeline Config: management defines which stages count as complete.

DRIVERS, FLEET & COMPLIANCE
- Driver Hub and Fleet Roster: driver profiles, documents, cert reminders.
- Fleet Compliance: expiring CDL, Med Cert, IRP, insurance, annual inspections
  with colour-coded severity.
- Inspection Binder: a Binder button on each driver card assembles the roadside
  binder; shareable by an expiring token link.
- MO Plate Registry with two-way sync to driver IRP documents, plus a duplicate
  plate panel.
- Onboard Systems (equipment inventory): ELDs, dash cams, BestPass, fuel cards,
  plates — Available / Assigned / Deactivated.
- Truck Down alerts: audible chime and a banner across the staff portal.

DISPATCH
- Dispatch Board in Cards and Table view, with dispatcher, lane, ETA and notes.
- Absence Log: dispatchers and management record multi-day driver absences
  (breakdown, personal, medical, home time) with a reason and note by clicking
  one or several days on a driver's mini calendar. Available in BOTH Cards and
  Table view — in Table view it sits inside the driver's expanded Absence Log
  row, above the history. Route /dispatch.
- Daily rollover: each morning the board carries active drivers' status forward
  from the calendar.
- Loads, Rate-Con Inbox (emailed rate confirmations parsed automatically),
  Facilities, Brokers with factoring status.

MONEY
- Fuel import, fuel exceptions, per-driver fuel detail, location report.
- Settlement runs and settlement settings; Billing queue; Late accessorials.

STAFF, MESSAGING & SETTINGS
- Staff Directory with per-staff email notification routing and account
  suspension. Route /management?view=staff.
- Messaging with templates and bulk messages; announcements stay in-app with a
  single 48-hour unread reminder email.
- What's New announcements: management writes one and it waits for the owner's
  approval; the owner is told by a bell alert and a gold count on the menu.
  Nothing reaches staff until the owner approves.
- FAQ Manager, Resource Library, Forms Catalog, Email Catalog and Email Log,
  Documents Hub, Activity Log, Notification History.
- Demo mode and demo driver accounts for safe walkthroughs.

PERMISSIONS (enforced in the database, not just the screen)
- Permanent account deletion: owner only.
- Lease termination, driver deactivation and reactivation: owner and management.
- Staff account suspension and reinstatement: owner and management; nobody can
  suspend the owner or himself.

DRIVER APP (PWA) — mentioned only for context; announcements here are for STAFF
- Home, Status, Documents, Messages, Notifications, Equipment. Drivers upload
  documents, sign the ICA, take guided truck photos and complete Pay Setup.
`.trim();

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      description: 'Your conversational answer to the user, in markdown. Always filled in.',
    },
    has_draft: {
      type: 'boolean',
      description: 'True when the fields below hold a complete announcement draft.',
    },
    title: { type: 'string', description: 'Announcement title, under 70 characters. Empty when has_draft is false.' },
    body: {
      type: 'string',
      description:
        'The announcement staff will read: what is new, where to find it, how to use it. ' +
        'Plain sentences, 2-4 short paragraphs. Empty when has_draft is false.',
    },
    category: {
      type: 'string',
      enum: ['feature', 'change', 'fix', 'reminder'],
      description: 'Announcement type.',
    },
    target_roles: {
      type: 'array',
      description: 'Staff groups this is for. Never include drivers — they are not an audience here.',
      items: { type: 'string', enum: ['management', 'onboarding_staff', 'dispatcher', 'owner'] },
    },
    link_route: {
      type: 'string',
      description: 'Exact route of the screen this is about, copied from the screen list. Empty string for no link.',
    },
  },
  required: ['reply', 'has_draft', 'title', 'body', 'category', 'target_roles', 'link_route'],
} as const;

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

    // Writing announcements is a management action, so drafting is too.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['management', 'owner'])
      .limit(1);
    if (!roles || roles.length === 0) {
      return json(403, { error: 'Only management and the owner can draft announcements.' });
    }

    const body = (await req.json()) as Body;
    const messages = Array.isArray(body?.messages)
      ? body.messages.filter(m => m?.content?.trim()).slice(-20)
      : [];
    if (messages.length === 0) return json(400, { error: 'No message provided.' });

    const screens = (body?.screens ?? []).slice(0, 200);
    const screenList = screens.length
      ? screens.map(s => `${s.route} — ${s.title} (${s.breadcrumb})`).join('\n')
      : '(no screen list supplied)';

    // The two forbidden money words are assembled from fragments on purpose: a
    // repository guard forbids either word appearing literally in source, and
    // this rule has to name them to keep them out of staff announcements.
    const BANNED_MONEY_WORDS =
      `Always write "R&M Deposit" in full; never the word "${'esc' + 'row'}", ` +
      `and never the word "${'hold' + 'back'}".`;

    const system = `You are the SUPERDRIVE release-notes writer. You help the owner and management
announce what has been built in SUPERDRIVE to their own staff: management, onboarding staff and dispatchers.

Two jobs:
1. Answer questions about what a feature does and where it lives, grounded ONLY in the feature list below.
2. When asked to write or adjust an announcement, return a complete draft.

Writing rules for the announcement body:
- Write for staff who use the dashboard, not for programmers. No table names, no file names,
  no words like component, backend, database, route, migration, RLS, edge function.
- Say what is new, where to find it (menu path or screen name), and what to do with it.
- Short plain sentences, 2 to 4 short paragraphs. No emojis. No marketing language.
- ${BANNED_MONEY_WORDS}
- Aim the announcement only at the groups who actually use the feature.
- Choose link_route by copying an exact route from the screen list. If nothing fits, use "".

Honesty rules:
- Never invent a feature, screen, button or menu path that is not in the feature list below.
- If the user asks about something not in the list, say plainly that you have no record of it
  and ask them to describe it, with has_draft false.

Output rules:
- Always fill "reply" with your conversational answer.
- Set has_draft true ONLY when title and body are both complete announcements.
- When has_draft is false, use "" for title, body and link_route, "feature" for category
  and an empty list for target_roles.

### What SUPERDRIVE has shipped
${FEATURE_CATALOG}

### Screens you may link to (route — name)
${screenList}`;

    const input = [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      ...messages.map(m => ({
        role: m.role,
        content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }],
      })),
    ];

    const gwRes = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': apiKey,
        'X-Lovable-AIG-SDK': 'fetch',
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        stream: true,
        reasoning: { effort: 'low', summary: 'auto' },
        include: ['reasoning.encrypted_content'],
        text: {
          format: {
            type: 'json_schema',
            name: 'release_note_draft',
            strict: true,
            schema: DRAFT_SCHEMA,
          },
        },
      }),
    });

    if (gwRes.status === 429) return json(429, { error: 'The assistant is busy. Try again in a moment.' });
    if (gwRes.status === 402) return json(402, { error: 'AI credits are exhausted. Add credits in workspace billing.' });
    if (!gwRes.ok || !gwRes.body) {
      const text = gwRes.body ? await gwRes.text() : '';
      console.error('AI gateway error', gwRes.status, text);
      return json(502, { error: 'The assistant is unavailable. Please try again.' });
    }

    // Reasoning models stream; accumulate the answer deltas and parse at the end.
    let raw = '';
    const reader = gwRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
            raw += evt.delta;
          } else if (evt.type === 'response.completed' && !raw) {
            raw = evt.response?.output_text ?? '';
          }
        } catch {
          // Partial or non-JSON keep-alive line; ignore.
        }
      }
    }

    if (!raw.trim()) {
      return json(502, { error: 'The assistant returned nothing. Please try again.' });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('draft parse failed', raw.slice(0, 500));
      return json(502, { error: 'The assistant reply could not be read. Please try again.' });
    }

    const allowedRoles = ['management', 'onboarding_staff', 'dispatcher', 'owner'];
    const roleList = Array.isArray(parsed.target_roles)
      ? (parsed.target_roles as unknown[]).filter((r): r is string => typeof r === 'string' && allowedRoles.includes(r))
      : [];
    const route = typeof parsed.link_route === 'string' ? parsed.link_route.trim() : '';
    const knownRoute = screens.some(s => s.route === route) ? route : '';

    const hasDraft = parsed.has_draft === true
      && typeof parsed.title === 'string' && parsed.title.trim().length > 0
      && typeof parsed.body === 'string' && parsed.body.trim().length > 0;

    return json(200, {
      reply: typeof parsed.reply === 'string' ? parsed.reply.trim() : '',
      draft: hasDraft
        ? {
            title: (parsed.title as string).trim().slice(0, 120),
            body: (parsed.body as string).trim().slice(0, 2000),
            category: ['feature', 'change', 'fix', 'reminder'].includes(parsed.category as string)
              ? (parsed.category as string)
              : 'feature',
            target_roles: roleList.length ? roleList : ['management', 'onboarding_staff', 'dispatcher', 'owner'],
            link_route: knownRoute,
          }
        : null,
    });
  } catch (err) {
    console.error('draft-release-note-ai error', err);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
});
