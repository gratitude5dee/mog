import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wallet-address",
};

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: "missing_supabase_env" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const walletAddress = req.headers.get("x-wallet-address")?.toLowerCase();
    if (!walletAddress) {
      return jsonResponse({ success: false, error: "missing_wallet_address" }, 401);
    }

    const body = await req.json();
    const actionType = String(body?.action_type || "");
    const contentType = String(body?.content_type || "");
    const contentId = String(body?.content_id || "");
    const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
    const userName = typeof body?.user_name === "string" ? body.user_name : `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

    if (!actionType || !contentType || !contentId) {
      return jsonResponse({ success: false, error: "missing_required_fields" }, 400);
    }

    const validActions = new Set(["like", "unlike", "bookmark", "unbookmark", "comment", "share", "view", "follow", "unfollow"]);
    if (!validActions.has(actionType)) {
      return jsonResponse({ success: false, error: "invalid_action_type" }, 400);
    }

    const validContentTypes = new Set(["track", "video", "article", "mog_post", "mog_follow"]);
    if (!validContentTypes.has(contentType)) {
      return jsonResponse({ success: false, error: "invalid_content_type" }, 400);
    }

    if (actionType === "comment" && !comment) {
      return jsonResponse({ success: false, error: "comment_required" }, 400);
    }

    const isMogPost = contentType === "mog_post";

    if (actionType === "like") {
      if (isMogPost) {
        const { error } = await supabase
          .from("mog_likes")
          .insert({ post_id: contentId, user_wallet: walletAddress });

        if (error) {
          // unique_violation means already liked; do not re-increment
          if (error.code === "23505") {
            return jsonResponse({ success: true, message: "already_liked" });
          }
          throw error;
        }

        await supabase.rpc("adjust_mog_post_metric", {
          p_post_id: contentId,
          p_metric: "likes_count",
          p_delta: 1,
        });

        return jsonResponse({ success: true, message: "liked" });
      }

      const { error } = await supabase
        .from("content_likes")
        .insert({ content_id: contentId, content_type: contentType, user_wallet: walletAddress });

      if (error) {
        if (error.code === "23505") {
          return jsonResponse({ success: true, message: "already_liked" });
        }
        throw error;
      }

      await supabase.rpc("adjust_content_metric", {
        p_content_type: contentType,
        p_content_id: contentId,
        p_metric: "likes_count",
        p_delta: 1,
      });

      return jsonResponse({ success: true, message: "liked" });
    }

    if (actionType === "unlike") {
      if (isMogPost) {
        const { data, error } = await supabase
          .from("mog_likes")
          .delete()
          .eq("post_id", contentId)
          .eq("user_wallet", walletAddress)
          .select("id");

        if (error) throw error;

        if (data && data.length > 0) {
          await supabase.rpc("adjust_mog_post_metric", {
            p_post_id: contentId,
            p_metric: "likes_count",
            p_delta: -1,
          });
        }

        return jsonResponse({ success: true, message: "unliked" });
      }

      const { data, error } = await supabase
        .from("content_likes")
        .delete()
        .eq("content_id", contentId)
        .eq("content_type", contentType)
        .eq("user_wallet", walletAddress)
        .select("id");

      if (error) throw error;

      if (data && data.length > 0) {
        await supabase.rpc("adjust_content_metric", {
          p_content_type: contentType,
          p_content_id: contentId,
          p_metric: "likes_count",
          p_delta: -1,
        });
      }

      return jsonResponse({ success: true, message: "unliked" });
    }

    if (actionType === "bookmark") {
      if (isMogPost) {
        const { error } = await supabase
          .from("mog_bookmarks")
          .insert({ post_id: contentId, user_wallet: walletAddress });

        if (error && error.code !== "23505") throw error;
        return jsonResponse({ success: true, message: "bookmarked" });
      }

      const { error } = await supabase
        .from("content_bookmarks")
        .insert({ content_id: contentId, content_type: contentType, user_wallet: walletAddress });

      if (error && error.code !== "23505") throw error;
      return jsonResponse({ success: true, message: "bookmarked" });
    }

    if (actionType === "unbookmark") {
      if (isMogPost) {
        const { error } = await supabase
          .from("mog_bookmarks")
          .delete()
          .eq("post_id", contentId)
          .eq("user_wallet", walletAddress);

        if (error) throw error;
        return jsonResponse({ success: true, message: "unbookmarked" });
      }

      const { error } = await supabase
        .from("content_bookmarks")
        .delete()
        .eq("content_id", contentId)
        .eq("content_type", contentType)
        .eq("user_wallet", walletAddress);

      if (error) throw error;
      return jsonResponse({ success: true, message: "unbookmarked" });
    }

    if (actionType === "comment") {
      if (isMogPost) {
        const { error } = await supabase.from("mog_comments").insert({
          post_id: contentId,
          user_wallet: walletAddress,
          user_name: userName,
          content: comment,
          user_type: "human",
        });

        if (error) throw error;

        await supabase.rpc("adjust_mog_post_metric", {
          p_post_id: contentId,
          p_metric: "comments_count",
          p_delta: 1,
        });

        return jsonResponse({ success: true, message: "comment_added" });
      }

      const { error } = await supabase.from("content_comments").insert({
        content_id: contentId,
        content_type: contentType,
        user_wallet: walletAddress,
        user_name: userName,
        content: comment,
      });

      if (error) throw error;

      await supabase.rpc("adjust_content_metric", {
        p_content_type: contentType,
        p_content_id: contentId,
        p_metric: "comments_count",
        p_delta: 1,
      });

      return jsonResponse({ success: true, message: "comment_added" });
    }

    if (actionType === "share") {
      if (isMogPost) {
        await supabase.rpc("adjust_mog_post_metric", {
          p_post_id: contentId,
          p_metric: "shares_count",
          p_delta: 1,
        });
      } else {
        await supabase.rpc("adjust_content_metric", {
          p_content_type: contentType,
          p_content_id: contentId,
          p_metric: "shares_count",
          p_delta: 1,
        });
      }

      return jsonResponse({ success: true, message: "shared" });
    }

    if (actionType === "view") {
      if (isMogPost) {
        await supabase.rpc("adjust_mog_post_metric", {
          p_post_id: contentId,
          p_metric: "views_count",
          p_delta: 1,
        });
      } else {
        await supabase.rpc("adjust_content_metric", {
          p_content_type: contentType,
          p_content_id: contentId,
          p_metric: "views_count",
          p_delta: 1,
        });
      }

      return jsonResponse({ success: true, message: "view_recorded" });
    }

    if (actionType === "follow") {
      const { error } = await supabase.from("mog_follows").insert({
        follower_wallet: walletAddress,
        following_wallet: contentId.toLowerCase(),
      });

      if (error && error.code !== "23505") throw error;
      return jsonResponse({ success: true, message: "following" });
    }

    if (actionType === "unfollow") {
      const { error } = await supabase
        .from("mog_follows")
        .delete()
        .eq("follower_wallet", walletAddress)
        .eq("following_wallet", contentId.toLowerCase());

      if (error) throw error;
      return jsonResponse({ success: true, message: "unfollowed" });
    }

    return jsonResponse({ success: false, error: "unhandled_action" }, 400);
  } catch (error) {
    console.error("[content-interact]", error);
    return jsonResponse({ success: false, error: "internal_server_error" }, 500);
  }
});
