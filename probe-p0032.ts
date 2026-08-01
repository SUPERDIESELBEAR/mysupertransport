import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!);
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

const DAY = "9f0c1a22-0000-4000-8000-0000000000f1";
async function attempt(label: string, name: string, token: string) {
  const { data, error } = await sb.rpc("certify_rods_day", {
    _day_id: DAY,
    _legal_name: name,
    _signature_path: `eld-signatures/scratch/${DAY}.png`,
    _pdf_path: `eld-logs/scratch/${DAY}.pdf`,
    _device_info: "probe; supabase-js",
    p_certification_token: token,
    p_changes: [],
    p_signature_validation: { probe: true },
  });
  console.log("=== " + label + " -> legal_name=" + JSON.stringify(name));
  console.log("error:", JSON.stringify(error, null, 2));
  console.log("data:", data ? JSON.stringify({ status: (data as any).status, certification_legal_name: (data as any).certification_legal_name }) : null);
}
await attempt("A. 'Driver'", "Driver", "aaaa1111-0000-4000-8000-00000000aaaa");
await attempt("B. 'Unknown'", "Unknown", "bbbb2222-0000-4000-8000-00000000bbbb");
await attempt("C. whitespace", "   ", "cccc3333-0000-4000-8000-00000000cccc");
await attempt("D. control real name", "Marcus Mueller", "dddd4444-0000-4000-8000-00000000dddd");
