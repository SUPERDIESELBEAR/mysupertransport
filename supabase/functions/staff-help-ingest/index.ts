// Staff Help ingest — embeds knowledge documents into staff_help_knowledge.
// Owner/management only. Accepts an array of docs and upserts embeddings.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const EMBED_URL = 'https://ai.gateway.lovable.dev/v1/embeddings';
const EMBED_MODEL = 'openai/text-embedding-3-small';
const BATCH = 32;
const MAX_CHARS = 4000;

interface Doc {
  source: string;
  source_id: string;
  title: string;
  route?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
}
interface Body {
  docs: Doc[];
  purgeSources?: string[];
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Simple paragraph chunker with overlap on very long text.
function chunk(text: string): string[] {
  const clean = text.replace(/\r/g, '').trim();
  if (!clean) return [];
  if (clean.length <= MAX_CHARS) return [clean];
  const paras = clean.split(/\n{2,}/);
  const out: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > MAX_CHARS) {
      if (buf) out.push(buf);
      if (p.length > MAX_CHARS) {
        for (let i = 0; i < p.length; i += MAX_CHARS - 200) {
          out.push(p.slice(i, i + MAX_CHARS));
        }
        buf = '';
      } else {
        buf = p;
      }
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][]> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`embed ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const items = (data?.data ?? []) as { index: number; embedding: number[] }[];
  items.sort((a, b) => a.index - b.index);
  return items.map(i => i.embedding);
}

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
      .in('role', ['owner', 'management'])
      .limit(1);
    if (!roles || roles.length === 0) return json(403, { error: 'Owner or management role required.' });

    const body = (await req.json()) as Body;
    const docs = Array.isArray(body?.docs) ? body.docs : [];
    if (docs.length === 0) return json(400, { error: 'No docs supplied.' });

    // Optionally purge specific sources so re-ingest doesn't leave stale rows.
    if (Array.isArray(body?.purgeSources) && body.purgeSources.length > 0) {
      const { error: delErr } = await admin
        .from('staff_help_knowledge')
        .delete()
        .in('source', body.purgeSources);
      if (delErr) console.warn('purge failed', delErr);
    }

    // Flatten to chunks preserving source metadata.
    type Row = {
      source: string;
      source_id: string;
      title: string;
      route: string | null;
      section: string;
      content: string;
      metadata: Record<string, unknown>;
    };
    const rows: Row[] = [];
    for (const d of docs) {
      const parts = chunk(d.content ?? '');
      parts.forEach((c, i) => {
        rows.push({
          source: d.source,
          source_id: d.source_id,
          title: d.title,
          route: d.route ?? null,
          section: parts.length > 1 ? `chunk-${i + 1}` : 'main',
          content: c,
          metadata: d.metadata ?? {},
        });
      });
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const inputs = slice.map(r => `${r.title}\n\n${r.content}`);
      let vectors: number[][];
      try {
        vectors = await embedBatch(apiKey, inputs);
      } catch (e) {
        console.error('embed batch failed', e);
        return json(502, { error: `Embedding failed after ${inserted} rows.`, detail: String(e).slice(0, 300) });
      }
      const payload = slice.map((r, j) => ({
        source: r.source,
        source_id: r.source_id,
        title: r.title,
        route: r.route,
        section: r.section,
        content: r.content,
        token_count: Math.ceil(r.content.length / 4),
        embedding: vectors[j] as unknown as string,
        metadata: r.metadata,
        updated_at: new Date().toISOString(),
      }));
      const { error: upErr } = await admin
        .from('staff_help_knowledge')
        .upsert(payload, { onConflict: 'source,source_id,section' });
      if (upErr) {
        console.error('upsert failed', upErr);
        return json(500, { error: `Insert failed after ${inserted} rows.`, detail: upErr.message });
      }
      inserted += slice.length;
    }

    return json(200, { inserted, purged: body?.purgeSources ?? [] });
  } catch (err) {
    console.error('staff-help-ingest error', err);
    return json(500, { error: 'Ingest failed.', detail: String(err).slice(0, 300) });
  }
});