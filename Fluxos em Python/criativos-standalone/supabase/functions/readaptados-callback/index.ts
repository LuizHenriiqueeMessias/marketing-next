import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

// NOTE: CORS wildcard intentional — this endpoint receives callbacks from N8N (external service)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
    console.log("=== PAYLOAD RAW ===", JSON.stringify(body, null, 2));
    console.log("[readaptados-callback] profile_id:", body.profile_id, "| perfil_id:", body.perfil_id, "| own_instagram:", body.own_instagram, "| client_name:", body.client_name, "| post_id:", body.post_id);
    console.log("[readaptados-callback] transcricao:", body.transcricao, "| transcription:", body.transcription, "| audio_text:", body.audio_text);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const bodyPerfilId = body.perfil_id ?? body.profile_id ?? null;
  const post_id = body.post_id;

  if (!post_id) {
    return new Response(
      JSON.stringify({ success: false, error: "post_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const sb = getSupabase();

  // Resolve profile_id: trust the trigger payload first, fall back to DB
  let resolvedProfileId = bodyPerfilId;
  if (!resolvedProfileId && post_id) {
    const { data: inspPost } = await sb
      .from("inspiration_posts")
      .select("profile_id")
      .eq("id", post_id)
      .single();
    if (inspPost?.profile_id) {
      resolvedProfileId = inspPost.profile_id;
      console.log("[readaptados-callback] Resolved profile_id via inspiration_posts fallback:", resolvedProfileId);
    }
  }

  // Fallback: resolve profile_id by matching own_instagram from body
  if (!resolvedProfileId && body.own_instagram) {
    const cleanHandle = (body.own_instagram as string).replace(/^@/, "").trim().toLowerCase();
    if (cleanHandle) {
      const { data: profileByHandle } = await sb
        .from("inspiration_profiles")
        .select("id")
        .ilike("own_instagram", cleanHandle)
        .limit(1)
        .single();
      if (profileByHandle?.id) {
        resolvedProfileId = profileByHandle.id;
        console.log("[readaptados-callback] Resolved profile_id via own_instagram fallback:", resolvedProfileId);
      }
    }
  }

  // Second fallback: resolve by client_name if own_instagram didn't match
  if (!resolvedProfileId && body.client_name) {
    const { data: profileByName } = await sb
      .from("inspiration_profiles")
      .select("id")
      .ilike("client_name", (body.client_name as string).trim())
      .limit(1)
      .single();
    if (profileByName?.id) {
      resolvedProfileId = profileByName.id;
      console.log("[readaptados-callback] Resolved profile_id via client_name fallback:", resolvedProfileId);
    }
  }

  // Discard unresolved template literals like {{input.client_name}}
  const isTemplate = (v: unknown): boolean =>
    typeof v === "string" && (v.startsWith("{{") || v.startsWith("$json") || v.startsWith("$('"));
  const cleanStr = (v: unknown): string =>
    typeof v === "string" && !isTemplate(v) ? v : "";

  // Always look up profile for client_name and own_instagram
  let clientName = cleanStr(body.client_name);
  let ownInstagram = cleanStr(body.own_instagram);

  if (resolvedProfileId) {
    const { data: profile } = await sb
      .from("inspiration_profiles")
      .select("client_name, own_instagram")
      .eq("id", resolvedProfileId)
      .single();
    if (profile) {
      clientName = clientName || profile.client_name || "";
      ownInstagram = ownInstagram || profile.own_instagram || "";
    }
  }

  // Extract analysis fields sent by n8n agent
  let analysis = body.analysis ?? null;
  if (typeof analysis === "string") {
    try { analysis = JSON.parse(analysis); } catch { analysis = null; }
  }

  // If analysis fields are missing, try fetching from inspiration_posts
  let tema = body.tema ?? analysis?.tema ?? null;
  let gancho = body.gancho ?? analysis?.gancho ?? null;
  let sugestaoReadaptacao = body.copy_readaptado ?? analysis?.sugestao_readaptacao ?? null;
  let scoreRelevancia = body.score ?? analysis?.score_relevancia ?? null;

  // Hoist inspAnalysis so it can be reused for transcricao fallback
  let inspAnalysis: any = null;

  if (!tema || !gancho || !sugestaoReadaptacao || scoreRelevancia == null) {
    const { data: inspPost2 } = await sb
      .from("inspiration_posts")
      .select("analysis")
      .eq("id", post_id)
      .single();
    if (inspPost2) {
      inspAnalysis = inspPost2.analysis;
      if (typeof inspAnalysis === "string") {
        try { inspAnalysis = JSON.parse(inspAnalysis); } catch { inspAnalysis = null; }
      }
      if (inspAnalysis) {
        tema = tema || inspAnalysis.tema || null;
        gancho = gancho || inspAnalysis.gancho || null;
        sugestaoReadaptacao = sugestaoReadaptacao || inspAnalysis.sugestao_readaptacao || null;
        scoreRelevancia = scoreRelevancia ?? inspAnalysis.score_relevancia ?? null;
      }
    }
  }

  // Extract transcricao field for video/reel posts — check all possible field paths
  let transcricao = body.transcricao
    ?? body.transcription
    ?? body.audio_text
    ?? body.transcribed_text
    ?? body.texto_transcrito
    ?? analysis?.transcricao
    ?? analysis?.transcription
    ?? analysis?.audio_text
    ?? analysis?.transcribed_text
    ?? null;

  // Fallback: check inspAnalysis from inspiration_posts (already fetched above if available)
  if (!transcricao) {
    if (inspAnalysis) {
      transcricao = inspAnalysis.transcricao ?? inspAnalysis.transcription ?? null;
    } else {
      // inspAnalysis wasn't fetched yet (all fields were present), fetch now for transcricao
      const { data: inspPostTrans } = await sb
        .from("inspiration_posts")
        .select("analysis")
        .eq("id", post_id)
        .single();
      if (inspPostTrans?.analysis) {
        let inspA = inspPostTrans.analysis;
        if (typeof inspA === "string") {
          try { inspA = JSON.parse(inspA); } catch { inspA = null; }
        }
        if (inspA) {
          transcricao = inspA.transcricao ?? inspA.transcription ?? null;
        }
      }
    }
  }

  if (transcricao) {
    console.log("[readaptados-callback] Transcricao found, length:", String(transcricao).length);
  } else {
    console.log("[readaptados-callback] No transcricao found in any source");
  }

  const record = {
    profile_id: resolvedProfileId,
    inspiration_post_id: post_id,
    media_type: body.tipo ?? body.media_type ?? null,
    tema,
    gancho,
    sugestao_readaptacao: sugestaoReadaptacao,
    score_relevancia: scoreRelevancia,
    curtidas: body.curtidas ?? 0,
    envios: body.envios ?? 0,
    visualizacoes: body.visualizacoes ?? body.views ?? 0,
    original_post_url: body.midia_url ?? body.post_url ?? null,
    original_thumbnail_url: body.thumbnail_url ?? null,
    client_name: clientName,
    original_caption: body.caption_original ?? body.caption ?? null,
    transcricao,
    status: "pendente",
  };

  try {
    const { error } = await sb
      .from("readapted_posts")
      .upsert(record, { onConflict: "inspiration_post_id" });

    if (error) throw error;

    // Update inspiration_posts so the toggle view is in sync
    const inspirationUpdate: Record<string, unknown> = { readapted: true };
    if (analysis) {
      inspirationUpdate.analysis = analysis;
    }

    await sb
      .from("inspiration_posts")
      .update(inspirationUpdate)
      .eq("id", post_id);

    // Also fix inspiration_posts.profile_id if it was null and we resolved it
    if (resolvedProfileId) {
      await sb
        .from("inspiration_posts")
        .update({ profile_id: resolvedProfileId })
        .eq("id", post_id)
        .is("profile_id", null);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error upserting readapted post:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
