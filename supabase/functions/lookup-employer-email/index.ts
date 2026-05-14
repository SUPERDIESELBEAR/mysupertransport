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

async function ddgSearch(query: string): Promise<string[]> {
  // DuckDuckGo HTML endpoint — no API key required.
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SuperdriveBot/1.0)' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Result links are wrapped via /l/?uddg=<encoded url>&...
    const out: string[] = [];
    const re = /\/l\/\?(?:[^"']*&)?uddg=([^&"']+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 25) {
      try {
        const decoded = decodeURIComponent(m[1]);
        if (/^https?:\/\//i.test(decoded)) out.push(decoded);
      } catch { /* ignore */ }
    }
    return out;
  } catch (e) {
    console.error('[lookup-employer-email] ddg search failed:', e);
    return [];
  }
}

function distinctDomains(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
      if (isBlockedDomain(host)) continue;
      if (seen.has(host)) continue;
      seen.add(host);
      out.push(host);
    } catch { /* ignore */ }
  }
  return out;
}

async function pickBestDomain(
  apiKey: string,
  employer: string,
  city: string | null,
  state: string | null,
  domains: string[],
): Promise<string | null> {
  if (domains.length === 0) return null;
  if (domains.length === 1) return domains[0];

  const prompt = `You are matching a trucking company name to its official website domain.

Company: ${employer}
Location: ${[city, state].filter(Boolean).join(', ') || 'unknown'}

Candidate domains (from a web search):
${domains.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Pick the single domain that is most likely the company's own official website. Reject directories, aggregators, job boards, news, and unrelated companies. If none of the domains plausibly belong to this exact company, return null.`;

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
            name: 'pick_domain',
            description: 'Return the chosen domain or null',
            parameters: {
              type: 'object',
              properties: {
                domain: { type: ['string', 'null'], description: 'Chosen domain (host only) or null' },
                reason: { type: 'string' },
              },
              required: ['domain'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'pick_domain' } },
      }),
    });
    if (!res.ok) {
      console.error('[lookup-employer-email] AI pick_domain failed:', res.status, await res.text().catch(() => ''));
      return domains[0]; // fallback
    }
    const data = await res.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return domains[0];
    const parsed = JSON.parse(args);
    const picked = (parsed?.domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (picked && domains.includes(picked)) return picked;
    if (picked) return picked; // trust AI even if not in list
    return null;
  } catch (e) {
    console.error('[lookup-employer-email] AI pick_domain exception:', e);
    return domains[0];
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

    // 1. Web search for the company website.
    const searchQuery = `"${employer_name}" trucking ${[city, state].filter(Boolean).join(' ')} contact`;
    const urls = await ddgSearch(searchQuery);
    const domains = distinctDomains(urls).slice(0, 8);
    if (domains.length === 0) {
      return new Response(JSON.stringify({ candidates: [], reason: 'No web results found.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Ask AI to pick the most likely official domain.
    const domain = await pickBestDomain(apiKey, employer_name, city, state, domains);
    if (!domain) {
      return new Response(JSON.stringify({
        candidates: [],
        reason: 'Could not identify the company website.',
        searched_domains: domains,
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