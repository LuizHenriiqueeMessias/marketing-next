import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escJson(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function buildPayloadTemplate(payload: Record<string, unknown>) {
  const parts: string[] = ['"resource": {{resource}}'];

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;

    if (value === null) {
      parts.push(`"${key}": null`);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`"${key}": ${value}`);
      continue;
    }

    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    parts.push(`"${key}": "${escJson(serialized)}"`);
  }

  return `{${parts.join(", ")}}`;
}

function normalizeBaseUrl(value: string | null | undefined) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

function isPrivateHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") return true;
  if (lower.endsWith(".local")) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;
  return false;
}

function isPublicBaseUrl(value: string | null | undefined) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("APIFY_TOKEN");
    const defaultActorId = Deno.env.get("APIFY_ACTOR_ID");
    const webhookStaticos = Deno.env.get("N8N_WEBHOOK_ESTATICOS");
    const webhookVideos = Deno.env.get("N8N_WEBHOOK_VIDEOS");
    const webhookCarrossel = Deno.env.get("N8N_WEBHOOK_CARROSSEL");
    const envBackendBase = normalizeBaseUrl(Deno.env.get("BACKEND_URL"));

    if (!token) {
      return new Response(
        JSON.stringify({ error: "APIFY_TOKEN nao configurado no servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestBody = await req.json();
    const {
      actorId: requestedActorId,
      webhookPayload,
      backendUrl: requestedBackendUrl,
      ...rest
    } = requestBody;

    const webhookMeta =
      webhookPayload && typeof webhookPayload === "object"
        ? webhookPayload as Record<string, unknown>
        : {};
    const requestedBackendBase =
      typeof requestedBackendUrl === "string" ? normalizeBaseUrl(requestedBackendUrl) : "";
    const backendBase = isPublicBaseUrl(requestedBackendBase)
      ? requestedBackendBase
      : envBackendBase;

    let actorId = requestedActorId as string | undefined;
    let actorInput: Record<string, unknown>;
    const webhooks: { eventTypes: string[]; requestUrl: string; payloadTemplate: string }[] = [];

    actorId ??= defaultActorId ?? undefined;

    if (!actorId) {
      return new Response(
        JSON.stringify({ error: "APIFY_ACTOR_ID nao configurado no servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      input,
      directUrls,
      resultsType,
      resultsLimit,
      maxPostsPerUrl,
      profile_id,
      onlyPostsNewerThan,
    } = rest;

    console.log("[apify-proxy] webhookPayload recebido:", JSON.stringify(webhookMeta));
    console.log(
      "[apify-proxy] custom_prompt presente:",
      !!webhookMeta.custom_prompt,
      "valor:",
      String(webhookMeta.custom_prompt || "").substring(0, 100),
    );

    if (Object.keys(webhookMeta).length > 0) {
      const payloadTemplate = buildPayloadTemplate(webhookMeta);
      const instagramWebhookStaticos = backendBase ? `${backendBase}/webhook/estaticos` : webhookStaticos;
      const instagramWebhookVideos = backendBase ? `${backendBase}/webhook/videos` : webhookVideos;
      const instagramWebhookCarrossel = backendBase ? `${backendBase}/webhook/carrossel` : webhookCarrossel;

      if (instagramWebhookStaticos) {
        webhooks.push({
          eventTypes: ["ACTOR.RUN.SUCCEEDED"],
          requestUrl: instagramWebhookStaticos,
          payloadTemplate,
        });
      }
      if (instagramWebhookVideos) {
        webhooks.push({
          eventTypes: ["ACTOR.RUN.SUCCEEDED"],
          requestUrl: instagramWebhookVideos,
          payloadTemplate,
        });
      }
      if (instagramWebhookCarrossel) {
        webhooks.push({
          eventTypes: ["ACTOR.RUN.SUCCEEDED"],
          requestUrl: instagramWebhookCarrossel,
          payloadTemplate,
        });
      }

      if (webhooks.length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhum webhook de retorno configurado para o scraper de Instagram" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    actorInput = input && typeof input === "object" && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {
          directUrls,
          resultsType,
          resultsLimit,
          profile_id,
        };

    if (onlyPostsNewerThan !== undefined) {
      actorInput.onlyPostsNewerThan = onlyPostsNewerThan;
    }

    if (maxPostsPerUrl !== undefined) {
      actorInput.maxPostsPerUrl = maxPostsPerUrl;
    }

    const encodedActorId = encodeURIComponent(actorId).replace(/%7E/g, "~");
    let apiUrl = `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${token}`;
    if (webhooks.length > 0) {
      apiUrl += `&webhooks=${encodeURIComponent(btoa(JSON.stringify(webhooks)))}`;
    }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[apify-proxy]", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
