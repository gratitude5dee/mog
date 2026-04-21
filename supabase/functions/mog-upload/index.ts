import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyAndConsumeWalletProof, WalletProofPayload } from "../_shared/wallet-proof.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mog-api-key, x-idempotency-key",
};

type ContentType = "video" | "image" | "article";
type CreatorType = "human" | "agent";

type UploadPayload = {
  content_type?: ContentType;
  media_url?: string | null;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  article_body?: string | null;
  hashtags?: string[] | string | null;
  creator_wallet?: string;
  creator_name?: string | null;
  creator_avatar?: string | null;
  creator_type?: CreatorType;
  wallet_proof?: WalletProofPayload | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeHashtags(value: UploadPayload["hashtags"]): string[] {
  const normalized = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return normalized
    .map((tag) => String(tag).replace(/^#/, "").trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .slice(0, 20);
}

function isContentType(value: unknown): value is ContentType {
  return value === "video" || value === "image" || value === "article";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ success: false, error: "missing_supabase_env" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const payload = (await req.json()) as UploadPayload;

    const contentType = payload.content_type;
    const mediaUrl = payload.media_url || null;
    const thumbnailUrl = payload.thumbnail_url || null;
    const title = (payload.title || "").trim() || null;
    const description = (payload.description || "").trim() || null;
    const articleBody = (payload.article_body || "").trim() || null;

    if (!isContentType(contentType)) {
      return jsonResponse(
        {
          success: false,
          error: "invalid_content_type",
          hint: "Must be: video, image, or article",
        },
        400,
      );
    }

    if (contentType !== "article" && !mediaUrl) {
      return jsonResponse(
        {
          success: false,
          error: "missing_media_url",
          hint: "media_url is required for image and video posts",
        },
        400,
      );
    }

    if (contentType === "article" && !articleBody) {
      return jsonResponse(
        {
          success: false,
          error: "missing_article_body",
          hint: "article_body is required for article posts",
        },
        400,
      );
    }

    const apiKey = req.headers.get("x-mog-api-key");
    const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() || null;
    let creatorWallet = "";
    let creatorName = "";
    let creatorAvatar: string | null = null;
    let creatorType: CreatorType = "human";
    let authMode: "agent_api_key" | "wallet_proof" = "wallet_proof";
    let agentId: string | null = null;
    let agentPostCount = 0;

    if (apiKey) {
      const { data: agent, error: agentError } = await supabase
        .from("mog_agent_profiles")
        .select("id, name, wallet_address, avatar_url, is_active, post_count")
        .eq("api_key", apiKey)
        .eq("is_active", true)
        .single();

      if (agentError || !agent) {
        return jsonResponse(
          {
            success: false,
            error: "invalid_api_key",
            hint: "Register an API key at /mog-agents/register",
          },
          401,
        );
      }

      creatorWallet = String(agent.wallet_address || "").toLowerCase();
      creatorName = String(agent.name || "").trim() || "Moltbook Agent";
      creatorAvatar = (agent.avatar_url as string | null) || null;
      creatorType = "agent";
      authMode = "agent_api_key";
      agentId = agent.id as string;
      agentPostCount = Number(agent.post_count || 0);
    } else {
      const creatorWalletCandidate = String(payload.creator_wallet || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/i.test(creatorWalletCandidate)) {
        return jsonResponse(
          {
            success: false,
            error: "invalid_creator_wallet",
            hint: "creator_wallet must be a valid EVM wallet address",
          },
          400,
        );
      }

      const proofResult = await verifyAndConsumeWalletProof(supabase, payload.wallet_proof || null);
      if (!proofResult.ok) {
        return jsonResponse({ success: false, error: proofResult.error }, proofResult.status);
      }

      if (!proofResult.action.startsWith("mog_upload:")) {
        return jsonResponse({ success: false, error: "invalid_wallet_proof_action" }, 403);
      }

      if (proofResult.address !== creatorWalletCandidate) {
        return jsonResponse({ success: false, error: "wallet_proof_mismatch" }, 403);
      }

      creatorWallet = creatorWalletCandidate;
      creatorName = String(payload.creator_name || "").trim() || `${creatorWallet.slice(0, 6)}...${creatorWallet.slice(-4)}`;
      creatorAvatar = payload.creator_avatar || null;
      creatorType = payload.creator_type === "agent" ? "agent" : "human";
    }

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("api_idempotency_keys")
        .select("response_status, response_body, expires_at")
        .eq("endpoint", "mog-upload")
        .eq("idempotency_key", idempotencyKey)
        .eq("actor", creatorWallet)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (existing?.response_body) {
        return jsonResponse(existing.response_body, existing.response_status || 200);
      }
    }

    const cooldownMinutes = authMode === "agent_api_key" ? 30 : 2;
    const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
    const { count: recentPosts } = await supabase
      .from("mog_posts")
      .select("id", { count: "exact", head: true })
      .eq("creator_wallet", creatorWallet)
      .gte("created_at", cutoff);

    if ((recentPosts ?? 0) >= 1) {
      return jsonResponse(
        {
          success: false,
          error: "rate_limit_exceeded",
          hint: `Max 1 post every ${cooldownMinutes} minutes`,
          retry_after_minutes: cooldownMinutes,
        },
        429,
      );
    }

    const hashtags = sanitizeHashtags(payload.hashtags);

    const { data: post, error: postError } = await supabase
      .from("mog_posts")
      .insert({
        content_type: contentType,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        title,
        description,
        article_body: contentType === "article" ? articleBody : null,
        hashtags,
        creator_wallet: creatorWallet,
        creator_name: creatorName,
        creator_avatar: creatorAvatar,
        creator_type: creatorType,
        is_published: true,
      })
      .select("id, content_type, created_at")
      .single();

    if (postError || !post) {
      console.error("[mog-upload] post insert failed", postError);
      return jsonResponse({ success: false, error: "post_insert_failed" }, 500);
    }

    if (authMode === "agent_api_key" && agentId) {
      await supabase
        .from("mog_agent_profiles")
        .update({
          post_count: agentPostCount + 1,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", agentId);
    }

    const responseBody = {
      success: true,
      mode: authMode,
      data: {
        id: post.id,
        url: `https://moggy.lovable.app/mog/post/${post.id}`,
        content_type: post.content_type,
        created_at: post.created_at,
      },
    };

    if (idempotencyKey) {
      await supabase.from("api_idempotency_keys").upsert(
        {
          endpoint: "mog-upload",
          idempotency_key: idempotencyKey,
          actor: creatorWallet,
          response_status: 201,
          response_body: responseBody,
        },
        { onConflict: "endpoint,idempotency_key,actor" },
      );
    }

    return jsonResponse(responseBody, 201);
  } catch (error) {
    console.error("[mog-upload]", error);
    return jsonResponse({ success: false, error: "internal_server_error" }, 500);
  }
});
