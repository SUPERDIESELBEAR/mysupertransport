// Generate draft FAQs from a policy PDF using Lovable AI.
// Staff-authenticated. Downloads a resource_documents PDF, chunks by
// heading, asks Gemini to write Q&A per section, dedupes against
// existing FAQs via embeddings, and inserts survivors as unpublished
// drafts in the `faq` table.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

type Audience = 'owner_operator' | 'staff';
type FaqCategory =
  | 'application_process'
  | 'background_screening'
  | 'documents_requirements'
  | 'ica_contracts'
  | 'missouri_registration'
  | 'equipment'
  | 'dispatch_operations'
  | 'general_owner_operator';

interface RequestBody {
  resource_document_id: string;
  audience: Audience;
  category_hint?: FaqCategory;
}

interface Candidate {
  question: string;
  answer: string;
  section: string;
  category: FaqCategory;
}

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1';
const CHAT_MODEL = 'google/gemini-3-flash-preview';
const EMBED_MODEL = 'google/gemini-embedding-001';
const DUP_THRESHOLD = 0.86;

const CATEGORIES: FaqCategory[] = [
  'application_process',
  'background_screening',
  'documents_requirements',
  'ica_contracts',
  'missouri_registration',
  'equipment',
  'dispatch_operations',
  'general_owner_operator',
];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Split extracted text into rough sections using ALL-CAPS or numbered headings.
function chunkByHeadings(text: string): { title: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  const sections: { title: string; body: string }[] = [];
  let current = { title: 'Introduction', body: '' };
  const headingRe = /^\s*(?:(?:\d+(?:\.\d+)*\.?\s+)|[A-Z][A-Z0-9 ,'&/\-]{6,})\s*$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { current.body += '\n'; continue; }
    if (headingRe.test(line) && line.length < 100) {
      if (current.body.trim().length > 200) sections.push(current);
      current = { title: line.replace(/\s+/g, ' ').slice(0, 120), body: '' };
    } else {
      current.body += line + ' ';
    }
  }
  if (current.body.trim().length > 200) sections.push(current);

  // If we found almost nothing, fall back to fixed-size chunks of ~3500 chars.
  if (sections.length < 2) {
    const clean = text.replace(/\s+/g, ' ');
    const chunks: { title: string; body: string }[] = [];
    const size = 3500;
    for (let i = 0; i < clean.length; i += size) {
      chunks.push({
        title: `Section ${chunks.length + 1}`,
        body: clean.slice(i, i + size),
      });
    }
    return chunks;
  }
  // Cap each section body to keep prompt size sane.
  return sections.map(s => ({ title: s.title, body: s.body.slice(0, 6000) }));
}

async function callChat(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${AI_GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: { 'Lovable-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You extract FAQ-style question/answer pairs from company policy documents. ' +
            'Only use facts present in the provided passage. Do not invent policy. ' +
            'Questions must sound like something a real driver or staff member would ask. ' +
            'Keep answers under 120 words each, plain sentences, no markdown. ' +
            'Return strictly a JSON object matching the schema.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`chat ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const res = await fetch(`${AI_GATEWAY}/embeddings`, {
    method: 'POST',
    headers: { 'Lovable-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`embed ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data ?? []).map((d: any) => d.embedding as number[]);
}

async function generateForSection(
  apiKey: string,
  section: { title: string; body: string },
  audience: Audience,
  categoryHint: FaqCategory | undefined,
): Promise<Candidate[]> {
  const audienceLabel =
    audience === 'owner_operator' ? 'owner-operator truck drivers' : 'internal staff';
  const catList = CATEGORIES.join(', ');
  const hintLine = categoryHint
    ? `Prefer the category "${categoryHint}" unless the passage clearly belongs to another.`
    : 'Pick the single best category from the list for each Q&A.';
  const prompt =
    `Audience: ${audienceLabel}.\n` +
    `Allowed categories: ${catList}.\n` +
    `${hintLine}\n\n` +
    `Section title: ${section.title}\n\n` +
    `Passage:\n"""\n${section.body}\n"""\n\n` +
    `Return a JSON object of the form: ` +
    `{"faqs":[{"question":"...","answer":"...","category":"one_of_allowed"}]}. ` +
    `Generate between 2 and 6 high-signal Q&A pairs grounded strictly in the passage. ` +
    `Skip the section entirely if it does not contain useful policy or procedure ` +
    `(return {"faqs":[]}).`;
  const raw = await callChat(apiKey, prompt);
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const faqs = Array.isArray(parsed?.faqs) ? parsed.faqs : [];
  return faqs
    .filter((f: any) => f && typeof f.question === 'string' && typeof f.answer === 'string')
    .map((f: any) => ({
      question: f.question.trim(),
      answer: f.answer.trim(),
      section: section.title,
      category: (CATEGORIES.includes(f.category) ? f.category : (categoryHint ?? 'general_owner_operator')) as FaqCategory,
    }))
    .filter((c: Candidate) => c.question.length > 5 && c.answer.length > 10);
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

    // Auth: verify staff role
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
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner']);
    if (!roles || roles.length === 0) return json(403, { error: 'Staff role required' });

    // Parse body
    const body = (await req.json()) as RequestBody;
    if (!body?.resource_document_id) return json(400, { error: 'resource_document_id required' });
    const audience: Audience = body.audience === 'staff' ? 'staff' : 'owner_operator';

    // Load resource
    const { data: resource, error: resErr } = await admin
      .from('resource_documents')
      .select('id, title, file_name, file_url')
      .eq('id', body.resource_document_id)
      .single();
    if (resErr || !resource) return json(404, { error: 'Resource not found' });
    if (!resource.file_url) return json(400, { error: 'Resource has no file URL' });

    // Download PDF
    const pdfRes = await fetch(resource.file_url);
    if (!pdfRes.ok) return json(502, { error: `Failed to fetch PDF (${pdfRes.status})` });
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

    // Extract text
    const pdfDoc = await getDocumentProxy(pdfBytes);
    const { text } = await extractText(pdfDoc, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join('\n') : String(text ?? '');
    if (fullText.trim().length < 200) {
      return json(400, { error: 'PDF text extraction returned too little content' });
    }

    const sections = chunkByHeadings(fullText).slice(0, 25); // safety cap

    // Generate candidates section-by-section (sequential to be gentle with rate limits)
    let allCandidates: Candidate[] = [];
    for (const section of sections) {
      try {
        const cands = await generateForSection(apiKey, section, audience, body.category_hint);
        allCandidates = allCandidates.concat(cands);
      } catch (e) {
        console.error('section generation failed', section.title, e);
      }
    }

    if (allCandidates.length === 0) {
      return json(200, { generated: 0, inserted: 0, skipped_duplicate: 0, skipped_similar: 0 });
    }

    // Dedupe candidates within this batch by question text
    const seen = new Set<string>();
    allCandidates = allCandidates.filter(c => {
      const key = c.question.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Load existing FAQ questions for same audience for dedup
    const { data: existing } = await admin
      .from('faq')
      .select('question')
      .eq('audience', audience);
    const existingQs = (existing ?? []).map((f: any) => f.question as string);

    // Embed existing + candidates in batches
    const candQs = allCandidates.map(c => c.question);
    const [candEmb, existingEmb] = await Promise.all([
      embedBatch(apiKey, candQs),
      existingQs.length > 0 ? embedBatch(apiKey, existingQs) : Promise.resolve([]),
    ]);

    const kept: Candidate[] = [];
    const keptEmb: number[][] = [];
    let skippedDup = 0;
    for (let i = 0; i < allCandidates.length; i++) {
      const emb = candEmb[i];
      if (!emb) { kept.push(allCandidates[i]); continue; }
      let isDup = false;
      for (const e of existingEmb) {
        if (cosine(emb, e) >= DUP_THRESHOLD) { isDup = true; break; }
      }
      if (!isDup) {
        for (const e of keptEmb) {
          if (cosine(emb, e) >= DUP_THRESHOLD) { isDup = true; break; }
        }
      }
      if (isDup) { skippedDup++; continue; }
      kept.push(allCandidates[i]);
      keptEmb.push(emb);
    }

    // Determine starting sort_order
    const { data: maxRow } = await admin
      .from('faq')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    let nextOrder = (maxRow?.[0]?.sort_order ?? -1) + 1;

    // Insert drafts
    const sourceName = resource.title || resource.file_name || 'Document';
    const rows = kept.map(c => ({
      question: c.question,
      answer: c.answer,
      category: c.category,
      audience,
      is_published: false,
      sort_order: nextOrder++,
      tags: [sourceName, c.section, 'ai-draft'],
      source_document: sourceName,
      source_section: c.section,
      created_by: userId,
    }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr, count } = await admin
        .from('faq')
        .insert(rows, { count: 'exact' });
      if (insErr) {
        console.error('insert failed', insErr);
        return json(500, { error: 'Failed to insert drafts', detail: insErr.message });
      }
      inserted = count ?? rows.length;
    }

    return json(200, {
      generated: allCandidates.length,
      inserted,
      skipped_duplicate: skippedDup,
      source_document: sourceName,
      sections_scanned: sections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('faq-generate-from-doc error', msg);
    return json(500, { error: msg });
  }
});