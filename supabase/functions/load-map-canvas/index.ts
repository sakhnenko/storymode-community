import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mapId } = await req.json().catch(() => ({}));
    if (!mapId || typeof mapId !== "string") return json({ error: "mapId is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
    let userId: string | null = null;

    if (token && token !== anonKey) {
      const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
      const { data } = await authClient.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: map, error: mapError } = await admin
      .from("map_canvas")
      .select("id,user_id,project_id,bg_color,zoom,offset_x,offset_y,cells,placed_notebooks,title")
      .eq("id", mapId)
      .maybeSingle();

    if (mapError) throw mapError;
    if (!map) return json({ error: "Map not found" }, 404);

    let allowed = userId === map.user_id;

    // Project sharing is disabled; only owner and public projects are allowed.
    if (!allowed && map.project_id) {
      const { data: project } = await admin
        .from("projects")
        .select("is_public")
        .eq("id", map.project_id)
        .maybeSingle();
      allowed = project?.is_public === true;
    }

    if (!allowed) return json({ error: "Forbidden" }, userId ? 403 : 401);

    return json({ map });
  } catch (error) {
    console.error("load-map-canvas failed", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
