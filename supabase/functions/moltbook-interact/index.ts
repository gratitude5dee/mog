import { createClient } from "npm:@supabase/supabase-js@2";
import { requireMoltbookAgent } from "../_shared/moltbook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-moltbook-identity, x-idempotency-key",
};

type ContentType = "track" | "video" | "article" | "mog_post" | "content_comment" | "mog_comment";
type ActionType = "like" | "comment" | "bookmark" | "follow" | "report";

type RequestBody = {
  action_type: ActionType;
  content_type: ContentType;
  content_id: string;
  wallet_address: string;
  comment?: string;
  parent_comment_id?: string;
  following_wallet?: string;
  report_reason?: string;
};

const SUPPORTED_CONTENT = new Set(["track", "video", "article", "mog_post", "content_comment", "mog_comment"]);
const SUPPORTED_ACTIONS = new Set(["like", "comment", "bookmark", "follow", "report"]);
const PAYOUT_ACTIONS = new Set(["like", "comment", "bookmark"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveCreatorWallet(
  supabaseAdmin: any,
  contentType: ContentType,
  contentId: string,
): Promise<string | null> {
  if (contentType === "mog_post") {
    const { data } = await supabaseAdmin.from("mog_posts").select("creator_wallet").eq("id", contentId).maybeSingle();
    return ((data as any)?.creator_wallet as string | null)?.toLowerCase() || null;
  }

  if (contentType === "track") {
    const { data } = await supabaseAdmin.from("music_tracks").select("artist_wallet").eq("id", contentId).maybeSingle();
    return ((data as any)?.artist_wallet as string | null)?.toLowerCase() || null;
  }

  if (contentType === "video") {
    const { data } = await supabaseAdmin.from("music_videos").select("artist_wallet").eq("id", contentId).maybeSingle();
    return ((data as any)?.artist_wallet as string | null)?.toLowerCase() || null;
  }

  if (contentType === "article") {
    const { data } = await supabaseAdmin.from("articles").select("author_wallet").eq("id", contentId).maybeSingle();
    return ((data as any)?.author_wallet as string | null)?.toLowerCase() || null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const verification = await requireMoltbookAgent(req);
  if (!verification.ok) {
    return jsonResponse({ error: verification.error }, verification.status);
  }

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { action_type, content_type, content_id, wallet_address, comment, parent_comment_id, following_wallet, report_reason } = payload;
  const actorWallet = String(wallet_address || "").toLowerCase();
  const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() || null;

  if (!SUPPORTED_ACTIONS.has(action_type)) {
    return jsonResponse({ error: "invalid_action" }, 400);
  }

  if (!SUPPORTED_CONTENT.has(content_type)) {
    return jsonResponse({ error: "invalid_content_type" }, 400);
  }

  if (!content_id || !actorWallet) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  if (!/^0x[a-f0-9]{40}$/i.test(actorWallet)) {
    return jsonResponse({ error: "invalid_wallet_address" }, 400);
  }

  if (idempotencyKey) {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: existing } = await supabaseAdmin
      .from("api_idempotency_keys")
      .select("response_status, response_body, expires_at")
      .eq("endpoint", "moltbook-interact")
      .eq("idempotency_key", idempotencyKey)
      .eq("actor", actorWallet)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existing?.response_body) {
      return jsonResponse(existing.response_body, existing.response_status || 200);
    }
  }

  if (action_type === "comment" && (!comment || !comment.trim())) {
    return jsonResponse({ error: "missing_comment" }, 400);
  }

  const hourlyCap = Math.max(1, Number(Deno.env.get("MOLTBOOK_HOURLY_CAP") || 120));
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentPayoutActions } = await supabaseAdmin
    .from("engagement_payouts")
    .select("id", { count: "exact", head: true })
    .eq("payer_wallet", actorWallet)
    .gte("created_at", oneHourAgo);

  if ((recentPayoutActions ?? 0) >= hourlyCap) {
    return jsonResponse({ error: "rate_limit_exceeded", hint: `max_${hourlyCap}_payout_actions_per_hour` }, 429);
  }

  const agent = verification.agent;
  const agentPayload = {
    agent_id: agent.id,
    agent_name: agent.name,
    agent_wallet: actorWallet,
  };

  let payoutResult: Record<string, unknown> | null = null;

  try {
    const creatorWallet =
      PAYOUT_ACTIONS.has(action_type) && (content_type === "mog_post" || content_type === "track" || content_type === "video" || content_type === "article")
        ? await resolveCreatorWallet(supabaseAdmin, content_type, content_id)
        : null;

    if (
      PAYOUT_ACTIONS.has(action_type) &&
      (content_type === "mog_post" || content_type === "track" || content_type === "video" || content_type === "article") &&
      !creatorWallet
    ) {
      return jsonResponse({ error: "content_not_found" }, 404);
    }

    if (creatorWallet && creatorWallet === actorWallet) {
      return jsonResponse({ error: "self_engagement_blocked", skipped: true }, 403);
    }

    if (action_type === "like") {
      if (content_type === "mog_post") {
        const { error } = await supabaseAdmin.from("agent_mog_likes").insert({ post_id: content_id, ...agentPayload });
        if (error && error.code !== "23505") throw error;
        if (!error) {
          await supabaseAdmin.rpc("adjust_mog_post_metric", { p_post_id: content_id, p_metric: "likes_count", p_delta: 1 });
        }
      } else if (content_type === "track" || content_type === "video" || content_type === "article") {
        const { error } = await supabaseAdmin
          .from("agent_content_likes")
          .insert({ content_type, content_id, ...agentPayload });
        if (error && error.code !== "23505") throw error;
        if (!error) {
          await supabaseAdmin.rpc("adjust_content_metric", {
            p_content_type: content_type,
            p_content_id: content_id,
            p_metric: "likes_count",
            p_delta: 1,
          });
        }
      } else {
        return jsonResponse({ error: "invalid_target_for_like" }, 400);
      }
    }

    if (action_type === "bookmark") {
      if (content_type === "mog_post") {
        const { error } = await supabaseAdmin.from("agent_mog_bookmarks").insert({ post_id: content_id, ...agentPayload });
        if (error && error.code !== "23505") throw error;
      } else if (content_type === "track" || content_type === "video" || content_type === "article") {
        const { error } = await supabaseAdmin
          .from("agent_content_bookmarks")
          .insert({ content_type, content_id, ...agentPayload });
        if (error && error.code !== "23505") throw error;
      } else {
        return jsonResponse({ error: "invalid_target_for_bookmark" }, 400);
      }
    }

    if (action_type === "comment") {
      const normalizedComment = comment!.trim().slice(0, 500);
      if (content_type === "mog_post") {
        const { error } = await supabaseAdmin.from("agent_mog_comments").insert({
          post_id: content_id,
          content: normalizedComment,
          parent_comment_id: parent_comment_id ?? null,
          ...agentPayload,
        });
        if (error) throw error;
        await supabaseAdmin.rpc("adjust_mog_post_metric", {
          p_post_id: content_id,
          p_metric: "comments_count",
          p_delta: 1,
        });
      } else if (content_type === "track" || content_type === "video" || content_type === "article") {
        const { error } = await supabaseAdmin.from("agent_content_comments").insert({
          content_type,
          content_id,
          content: normalizedComment,
          ...agentPayload,
        });
        if (error) throw error;
        await supabaseAdmin.rpc("adjust_content_metric", {
          p_content_type: content_type,
          p_content_id: content_id,
          p_metric: "comments_count",
          p_delta: 1,
        });
      } else {
        return jsonResponse({ error: "invalid_target_for_comment" }, 400);
      }
    }

    if (action_type === "follow") {
      if (!following_wallet) {
        return jsonResponse({ error: "missing_following_wallet" }, 400);
      }
      const { error } = await supabaseAdmin.from("agent_follows").insert({ following_wallet, ...agentPayload });
      if (error && error.code !== "23505") throw error;
    }

    if (action_type === "report") {
      const { error } = await supabaseAdmin.from("agent_reports").insert({
        content_type,
        content_id,
        reason: report_reason ?? null,
        ...agentPayload,
      });
      if (error) throw error;
    }

    if (
      PAYOUT_ACTIONS.has(action_type) &&
      (content_type === "mog_post" || content_type === "track" || content_type === "video" || content_type === "article")
    ) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const payoutResponse = await fetch(`${supabaseUrl}/functions/v1/engagement-pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          content_type,
          content_id,
          action_type,
          payer_wallet: actorWallet,
        }),
      });
      payoutResult = (await payoutResponse.json().catch(() => null)) as Record<string, unknown> | null;
    }

    await supabaseAdmin
      .from("mog_agent_profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("wallet_address", actorWallet);

    const responseBody = { success: true, agent, action_type, content_type, content_id, payout: payoutResult };

    if (idempotencyKey) {
      await supabaseAdmin.from("api_idempotency_keys").upsert(
        {
          endpoint: "moltbook-interact",
          idempotency_key: idempotencyKey,
          actor: actorWallet,
          response_status: 200,
          response_body: responseBody,
        },
        { onConflict: "endpoint,idempotency_key,actor" },
      );
    }

    return jsonResponse(responseBody);
  } catch (error) {
    console.error("[moltbook-interact]", error);
    return jsonResponse({ error: "interaction_failed" }, 500);
  }
});
