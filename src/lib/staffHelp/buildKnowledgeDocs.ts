import { supabase } from '@/integrations/supabase/client';
import { STAFF_HELP_INDEX } from './help-index';

export interface KnowledgeDoc {
  source: string;
  source_id: string;
  title: string;
  route?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
}

const PRODUCT_OVERVIEW = `SUPERDRIVE is the operations platform for SUPERTRANSPORT.

Surfaces:
- Management dashboard (staff): sidebar-driven app for owner, management, onboarding_staff, dispatcher.
  Sections include Overview, Applications, Onboarding Pipeline (Stages 1–9), Fleet Roster / Driver Hub,
  Fleet Compliance, Driver Status, Operations (Onboard Systems, MO Plate Registry), FAQ Manager,
  Staff Help (this assistant), Messaging, PEI, Documents Hub, Release Notes, Pipeline Config.
- SUPERDRIVE driver PWA (owner-operators): tab-based portal — Home, Status, Documents, Messages,
  Notifications, Equipment.

Onboarding stages:
1 Background Check, 2 Application Review, 3 ICA, 4 Truck Owner, 5 Equipment,
6 Pre-Employment Screening (PEI), 7 Insurance, 8 Pay Setup, 9 Payroll and Procedures.
Stage 6 PEI runs previous-employer verification with 5-day auto-follow-ups for 30 days,
then auto-creates a Good-Faith-Effort record.

Time zone is US Central. Uploads use a blob-based flow with 60s timeouts and DB-failure cleanup.
RLS is enforced on every table. LOVABLE_API_KEY is auto-provisioned for backend AI calls.

Onboard Systems (OSAS): assignment sheets track ELDs, dash cams, BestPass, fuel cards,
license plates, and truck registration. Items sync with the MO Plate Registry.

Compliance monitoring watches CDL, Med Cert, IRP registration, insurance, and annual inspections
with color-coded severity thresholds.`;

export async function buildKnowledgeDocs(): Promise<{ docs: KnowledgeDoc[]; purgeSources: string[] }> {
  const docs: KnowledgeDoc[] = [];

  // 1. Product overview
  docs.push({
    source: 'overview',
    source_id: 'product',
    title: 'SUPERDRIVE product overview',
    content: PRODUCT_OVERVIEW,
  });

  // 2. Help index entries
  for (const e of STAFF_HELP_INDEX) {
    const parts: string[] = [
      `${e.title} (${e.breadcrumb})`,
      `Surface: ${e.surface}. Route: ${e.route}.`,
    ];
    if (e.keywords?.length) parts.push(`Keywords: ${e.keywords.join(', ')}.`);
    if (e.steps?.length) parts.push('Steps:\n' + e.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
    docs.push({
      source: 'help_index',
      source_id: e.id,
      title: e.title,
      route: e.route,
      content: parts.join('\n\n'),
      metadata: { surface: e.surface, breadcrumb: e.breadcrumb },
    });
  }

  // 3. Staff-audience FAQs
  const { data: faqs } = await supabase
    .from('faq')
    .select('id, question, answer, category, audience, tags')
    .in('audience', ['staff', 'owner_operator'])
    .eq('is_published', true)
    .limit(1000);
  for (const f of (faqs ?? []) as any[]) {
    const answer = String(f.answer ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!answer) continue;
    docs.push({
      source: 'faq',
      source_id: f.id,
      title: f.question,
      content: `${f.question}\n\n${answer}`,
      metadata: { category: f.category, audience: f.audience, tags: f.tags ?? [] },
    });
  }

  // 4. Release notes
  const { data: notes } = await supabase
    .from('release_notes')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  for (const n of (notes ?? []) as any[]) {
    const body = String(n.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!body) continue;
    docs.push({
      source: 'release_notes',
      source_id: n.id,
      title: `Release note: ${n.title}`,
      content: `${n.title}\n\n${body}`,
      metadata: { created_at: n.created_at },
    });
  }

  // 5. Service resources (staff-visible how-to docs)
  const { data: resources } = await supabase
    .from('service_resources')
    .select('id, title, description, body, resource_type, is_visible')
    .eq('is_visible', true)
    .limit(500);
  for (const r of (resources ?? []) as any[]) {
    const body = String(r.body ?? r.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!body) continue;
    docs.push({
      source: 'service_resource',
      source_id: r.id,
      title: r.title,
      content: `${r.title}\n\n${body}`,
      metadata: { resource_type: r.resource_type },
    });
  }

  return {
    docs,
    purgeSources: ['overview', 'help_index', 'faq', 'release_notes', 'service_resource'],
  };
}