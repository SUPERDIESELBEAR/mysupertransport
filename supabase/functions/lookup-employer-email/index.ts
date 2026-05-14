import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const ROLE_PRIORITY: Record<string, number> = {
  safety: 100,
  compliance: 95,
  dot: 90,
  hr: 85,
  humanresources: 85,
  recruiting: 80,
  recruitment: 80,
  driver: 75,
  drivers: 75,
  employment: 75,
  verifications: 75,
  verification: 75,
  operations: 60,
  ops: 60,
  dispatch: 55,
  office: 50,
  admin: 50,
  contact: 45,
  info: 40,
  hello: 30,
  sales: 10,
  marketing: 5,
  noreply: -100,
  donotreply: -100,
  'no-reply': -100,
};

const BLOCK_DOMAINS = new Set([
  'indeed.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'instagram.com',
  'yelp.com', 'bbb.org', 'mapquest.com', 'glassdoor.com', 'youtube.com',
  'wikipedia.org', 'crunchbase.com', 'zoominfo.com', 'rocketreach.co',
  'manta.com', 'dnb.com', 'bizapedia.com', 'apollo.io', 'hunter.io',
  'safer.fmcsa.dot.gov', 'fmcsa.dot.gov', 'truckingdatabase.com',
  'carrier411.com', 'mycarriersearch.com', 'truckingauthority.com',
  'duckduckgo.com', 'google.com', 'bing.com',
]);

function isBlockedDomain(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (BLOCK_DOMAINS.has(h)) return true;
  for (const b of BLOCK_DOMAINS) if (h.endsWith('.' + b)) return true;
  return false;
}

async function proposeDomains(
  apiKey: string,
  employer: string,
  city: string | null,
  state: string | null,
): Promise<string[]> {
  const prompt = `You are looking up the official website for a US trucking / transportation company so we can email them for a previous-employment verification.

Company name: ${employer}
Location: ${[city, state].filter(Boolean).join(', ') || 'unknown (US)'}

Return up to 5 likely candidate website domains (host only, no protocol, no path) for this company's own corporate site. Order from most to least likely. Skip directories, aggregators, job boards, social media, and FMCSA databases. If you genuinely don't know, return an empty list.

Examples of good answers: pinchtransport.com, schneider.com, knightswift.com.`;

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          type: 'function',
          function: {
            name: 'propose_domains',
            description: 'Return likely company website domains',
            parameters: {
              type: 'object',
              properties: {
                domains: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Host-only domains, ordered most-to-least likely.',
                },
              },
              required: ['domains'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'propose_domains' } },
      }),
    });
    if (!res.ok) {
      console.error('[lookup-employer-email] AI propose failed:', res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return [];
    const parsed = JSON.parse(args);
    const list: string[] = Array.isArray(parsed?.domains) ? parsed.domains : [];
    const cleaned: string[] = [];
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const d = raw.toLowerCase().trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
      if (!d || !d.includes('.') || d.length > 100) continue;
      if (isBlockedDomain(d)) continue;
      if (!cleaned.includes(d)) cleaned.push(d);
    }
    return cleaned.slice(0, 5);
  } catch (e) {
    console.error('[lookup-employer-email] AI propose exception:', e);
    return [];
  }
}

async function domainResolves(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SuperdriveBot/1.0)' },
      redirect: 'follow',
    });
    return res.status >= 200 && res.status < 500; // accept 4xx as "exists"
  } catch {
    return false;
  }
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SuperdriveBot/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractEmailsFromHtml(html: string, sourceDomain: string): Set<string> {
  const found = new Set<string>();
  const decoded = html
    .replace(/&#64;/gi, '@')
    .replace(/&#x40;/gi, '@')
    .replace(/&amp;/g, '&')
    .replace(/\s*\[at\]\s*/gi, '@')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s*\[dot\]\s*/gi, '.')
    .replace(/\s*\(dot\)\s*/gi, '.');

  const matches = decoded.match(EMAIL_RE) ?? [];
  for (const raw of matches) {
    const email = raw.toLowerCase().trim().replace(/[.,;:)]+$/, '');
    if (!email.includes('@')) continue;
    const [local, host] = email.split('@');
    if (!local || !host) continue;
    if (host.endsWith('.png') || host.endsWith('.jpg') || host.endsWith('.gif') || host.endsWith('.webp') || host.endsWith('.svg')) continue;
    if (local.length > 64 || host.length > 254) continue;
    if (/sentry|wixpress|godaddy|domainsbyproxy|registrar|whois|example\.com/.test(host)) continue;
    // Prefer same-domain matches; allow subdomains too.
    const cleanHost = host.replace(/^www\./, '');
    if (cleanHost === sourceDomain || cleanHost.endsWith('.' + sourceDomain) || sourceDomain.endsWith('.' + cleanHost)) {
      found.add(email);
    }
  }
  return found;
}

function rankEmails(emails: Set<string>): Array<{ email: string; score: number; label: string }> {
  const out: Array<{ email: string; score: number; label: string }> = [];
  for (const e of emails) {
    const local = e.split('@')[0].toLowerCase();
    let score = 20; // base for any same-domain email
    let label = 'general';
    for (const [k, v] of Object.entries(ROLE_PRIORITY)) {
      if (local === k || local.startsWith(k) || local.includes(k)) {
        if (v > score) { score = v; label = k; }
      }
    }
    // Heavily penalize obvious personal-looking addresses (firstname.lastname)
    if (/^[a-z]+\.[a-z]+$/.test(local)) score -= 5;
    out.push({ email: e, score, label });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Auth: any staff role may use this.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAdmin.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['owner', 'management', 'onboarding_staff', 'dispatcher'])
      .limit(1);
    if (!roleCheck?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const employer_name = String(body?.employer_name ?? '').trim();
    const city = body?.city ? String(body.city).trim() : null;
    const state = body?.state ? String(body.state).trim() : null;
    if (!employer_name || employer_name.length > 200) {
      return new Response(JSON.stringify({ error: 'employer_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI is not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Ask AI for likely candidate domains, then validate they resolve.
    const proposed = await proposeDomains(apiKey, employer_name, city, state);
    if (proposed.length === 0) {
      return new Response(JSON.stringify({
        candidates: [],
        reason: "Couldn't identify a likely website for this employer.",
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let domain: string | null = null;
    for (const d of proposed) {
      if (await domainResolves(d)) { domain = d; break; }
    }
    if (!domain) {
      return new Response(JSON.stringify({
        candidates: [],
        reason: 'Suggested websites did not resolve.',
        suggested_domains: proposed,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Scrape contact pages.
    const paths = ['/', '/contact', '/contact-us', '/contacts', '/about', '/about-us', '/team', '/staff'];
    const allEmails = new Set<string>();
    const seenSources: Record<string, string> = {};
    for (const p of paths) {
      const pageUrl = `https://${domain}${p}`;
      const html = await fetchPage(pageUrl);
      if (!html) continue;
      const emails = extractEmailsFromHtml(html, domain);
      for (const e of emails) {
        if (!allEmails.has(e)) seenSources[e] = pageUrl;
        allEmails.add(e);
      }
      if (allEmails.size >= 12) break;
    }

    const ranked = rankEmails(allEmails);
    const top = ranked.slice(0, 5).map(r => ({
      email: r.email,
      label: r.label,
      source_url: seenSources[r.email] ?? `https://${domain}`,
      confidence: r.score >= 75 ? 'high' : r.score >= 40 ? 'medium' : 'low',
    }));

    return new Response(JSON.stringify({
      website: `https://${domain}`,
      domain,
      candidates: top,
      suggested_domains: proposed,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[lookup-employer-email] error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});