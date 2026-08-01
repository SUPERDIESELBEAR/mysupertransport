import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const s = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!);
await sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
const { data, error } = await sb.functions.invoke("purge-rods-day", {
  body: { dayIds: ["9f0c1a22-0000-4000-8000-0000000000f1"], reason: "Scratch log used to observe the P0032 placeholder-name rejection over the wire." },
});
console.log("error:", JSON.stringify(error));
console.log("data:", JSON.stringify(data, null, 2));
