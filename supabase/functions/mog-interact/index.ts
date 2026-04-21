import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mog-api-key, x-idempotency-key",
};

type ActionType = "like" | "comment" | "bookmark" | "share" | "view";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const apiKey = req.headers.get("x-mog-api-key");
    if (!apiKey) {
      return jsonResponse({ success: false, error: "missing_api_key", hint: "Include X-Mog-API-Key header" }, 401);
    }

    const { data: agent, error: agentError } = await supabase
      .from("mog_agent_profiles")
      .select("*")
      .eq("api_key", apiKey)
      .eq("is_active", true)
      .single();

    if (agentError || !agent) {
      return jsonResponse({ success: false, error: "invalid_api_key", hint: "Register at /mog-agents/register" }, 401);
    }

    const body = await req.json();
    const actionType = String(body?.action_type || "") as ActionType;
    const contentId = String(body?.content_id || "");
    const comment = String(body?.comment || "").trim();
    const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() || null;
    const validActions = new Set(["like", "comment", "bookmark", "share", "view"]);
    const actorWallet = String(agent.wallet_address || "").toLowerCase();

    if (!validActions.has(actionType)) {
      return jsonResponse({ success: false, error: "invalid_action_type" }, 400);
    }

    if (!contentId) {
      return jsonResponse({ success: false, error: "missing_content_id" }, 400);
    }

    if (actionType === "comment" && !comment) {
      return jsonResponse({ success: false, error: "missing_comment" }, 400);
    }

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("api_idempotency_keys")
        .select("response_status, response_body, expires_at")
        .eq("endpoint", "mog-interact")
        .eq("idempotency_key", idempotencyKey)
        .eq("actor", actorWallet)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (existing?.response_body) {
        return jsonResponse(existing.response_body, existing.response_status || 200);
      }
    }

    const { data: post, error: postError } = await supabase
      .from("mog_posts")
      .select("id, creator_wallet, creator_name")
      .eq("id", contentId)
      .single();

    if (postError || !post) {
      return jsonResponse({ success: false, error: "content_not_found" }, 404);
    }

    if (String(post.creator_wallet || "").toLowerCase() === actorWallet) {
      return jsonResponse({ success: false, error: "self_engagement_blocked" }, 403);
    }

    const payoutHourlyCap = Math.max(1, Number(Deno.env.get("MOG_INTERACT_HOURLY_CAP") || 120));
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourlyCount } = await supabase
      .from("engagement_payouts")
      .select("id", { count: "exact", head: true })
      .eq("payer_wallet", actorWallet)
      .gte("created_at", oneHourAgo);

    if ((hourlyCount ?? 0) >= payoutHourlyCap) {
      return jsonResponse(
        { success: false, error: "rate_limit_exceeded", hint: `max_${payoutHourlyCap}_payout_actions_per_hour` },
        429,
      );
    }

    if (actionType === "like") {
      const { error } = await supabase.from("agent_mog_likes").insert({
        post_id: contentId,
        agent_id: agent.moltbook_id || agent.id,
        agent_name: agent.name,
        agent_wallet: actorWallet,
      });
      if (error && error.code !== "23505") throw error;
      if (!error) {
        await supabase.rpc("adjust_mog_post_metric", { p_post_id: contentId, p_metric: "likes_count", p_delta: 1 });
      }
    }

    if (actionType === "bookmark") {
      const { error } = await supabase.from("agent_mog_bookmarks").insert({
        post_id: contentId,
        agent_id: agent.moltbook_id || agent.id,
        agent_name: agent.name,
        agent_wallet: actorWallet,
      });
      if (error && error.code !== "23505") throw error;
    }

    if (actionType === "comment") {
      const { error } = await supabase.from("agent_mog_comments").insert({
        post_id: contentId,
        content: comment.slice(0, 500),
        agent_id: agent.moltbook_id || agent.id,
        agent_name: agent.name,
        agent_wallet: actorWallet,
      });
      if (error) throw error;
      await supabase.rpc("adjust_mog_post_metric", { p_post_id: contentId, p_metric: "comments_count", p_delta: 1 });
    }

    if (actionType === "share") {
      await supabase.rpc("adjust_mog_post_metric", { p_post_id: contentId, p_metric: "shares_count", p_delta: 1 });
    }

    if (actionType === "view") {
      await supabase.rpc("adjust_mog_post_metric", { p_post_id: contentId, p_metric: "views_count", p_delta: 1 });
    }

    let payout: Record<string, unknown> | null = null;
    try {
      const payoutResponse = await fetch(`${supabaseUrl}/functions/v1/engagement-pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          content_type: "mog_post",
          content_id: contentId,
          action_type: actionType,
          payer_wallet: actorWallet,
        }),
      });
      payout = (await payoutResponse.json().catch(() => null)) as Record<string, unknown> | null;
    } catch (_error) {
      payout = null;
    }

    await supabase
      .from("mog_agent_profiles")
      .update({
        last_active_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    const { data: karmaRow } = await supabase
      .from("user_karma")
      .select("total_earned")
      .eq("wallet_address", actorWallet)
      .maybeSingle();

    if (karmaRow?.total_earned !== undefined && karmaRow?.total_earned !== null) {
      await supabase
        .from("mog_agent_profiles")
        .update({ karma: Math.round(Number(karmaRow.total_earned)) })
        .eq("id", agent.id);
    }

    const responseBody = {
      success: true,
      action_type: actionType,
      content_id: contentId,
      payout,
      author: { name: post.creator_name },
    };

    if (idempotencyKey) {
      await supabase.from("api_idempotency_keys").upsert(
        {
          endpoint: "mog-interact",
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
    console.error("[mog-interact]", error);
    return jsonResponse({ success: false, error: "internal_server_error" }, 500);
  }
});
