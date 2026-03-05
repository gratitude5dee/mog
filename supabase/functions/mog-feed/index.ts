import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FeedType = "foryou" | "following";

type CursorPayload = {
  created_at: string;
  id: string;
};

function encodeCursor(payload: CursorPayload): string {
  return btoa(JSON.stringify(payload));
}

function decodeCursor(cursor: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor)) as CursorPayload;
    if (parsed?.created_at && parsed?.id) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ success: false, error: "missing_supabase_env" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const requestUrl = new URL(req.url);
    const requestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const feedType = (requestBody.feed_type || requestUrl.searchParams.get("feed_type") || "foryou") as FeedType;
    const wallet = String(requestBody.wallet || requestUrl.searchParams.get("wallet") || "").toLowerCase();
    const limit = Math.min(Number(requestBody.limit || requestUrl.searchParams.get("limit") || 20), 50);
    const sort = String(requestBody.sort || requestUrl.searchParams.get("sort") || "new");

    const rawCursor = String(requestBody.cursor || requestUrl.searchParams.get("cursor") || "") || null;
    const cursor = decodeCursor(rawCursor);

    let query = supabase
      .from("mog_posts")
      .select(
        `
          id,
          content_type,
          media_url,
          thumbnail_url,
          title,
          description,
          article_body,
          hashtags,
          creator_wallet,
          creator_type,
          creator_name,
          creator_avatar,
          likes_count,
          comments_count,
          shares_count,
          views_count,
          is_published,
          created_at
        `,
      )
      .eq("is_published", true);

    if (feedType === "following") {
      if (!wallet) {
        return jsonResponse({ success: true, items: [], next_cursor: null, has_more: false });
      }

      const { data: followingRows } = await supabase
        .from("mog_follows")
        .select("following_wallet")
        .eq("follower_wallet", wallet);

      const followingWallets = (followingRows || []).map((row) => row.following_wallet);
      if (followingWallets.length === 0) {
        return jsonResponse({ success: true, items: [], next_cursor: null, has_more: false });
      }

      query = query.in("creator_wallet", followingWallets);
    }

    if (sort === "top" || sort === "hot") {
      query = query.order("likes_count", { ascending: false }).order("created_at", { ascending: false });
    } else if (sort === "trending") {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", last24Hours).order("views_count", { ascending: false }).order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

      if (cursor?.created_at && cursor?.id) {
        query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      }
    }

    const { data: rows, error } = await query.limit(limit + 1);

    if (error) {
      console.error("[mog-feed]", error);
      return jsonResponse({ success: false, error: "feed_query_failed" }, 500);
    }

    const items = (rows || []).slice(0, limit);
    const hasMore = (rows || []).length > limit;

    const last = items.length > 0 ? items[items.length - 1] : null;
    const nextCursor = hasMore && last ? encodeCursor({ created_at: last.created_at, id: last.id }) : null;

    return jsonResponse({
      success: true,
      items,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  } catch (error) {
    console.error("[mog-feed]", error);
    return jsonResponse({ success: false, error: "internal_server_error" }, 500);
  }
});
