import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const s = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!);
await sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
const { data, error } = await sb.rpc("purge_rods_day", {
  _day_id: "9f0c1a22-0000-4000-8000-0000000000f1",
  _reason: "Scratch log used to observe the P0032 placeholder-name rejection over the wire.",
});
console.log("purge error:", JSON.stringify(error));
console.log("purge data:", JSON.stringify(data));
