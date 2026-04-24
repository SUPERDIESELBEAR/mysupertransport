import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { operator_id } = await req.json();
    if (!operator_id) {
      return new Response(JSON.stringify({ error: "operator_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const prefix = `${operator_id}/truck_photos`;
    const { data: files, error: listErr } = await supabase.storage
      .from("operator-documents")
      .list(prefix, { limit: 1000 });

    if (listErr) throw listErr;

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ deleted: [], message: "no files found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paths = files.map((f) => `${prefix}/${f.name}`);
    const { data: del, error: delErr } = await supabase.storage
      .from("operator-documents")
      .remove(paths);

    if (delErr) throw delErr;

    return new Response(
      JSON.stringify({ deleted: del?.map((d: any) => d.name) ?? [], count: paths.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});