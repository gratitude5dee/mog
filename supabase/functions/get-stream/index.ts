import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const { track_id: trackId, access_token: accessToken } = await req.json();
    if (!trackId || !accessToken) {
      return jsonResponse({ error: "missing_track_id_or_access_token" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const nowIso = new Date().toISOString();

    const { data: canonicalSession } = await supabaseAdmin
      .from("stream_sessions")
      .select("id, track_id, expires_at, payer_wallet, access_token, stream_id")
      .eq("track_id", trackId)
      .eq("access_token", accessToken)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: legacySession } = canonicalSession
      ? { data: null }
      : await supabaseAdmin
          .from("music_streams")
          .select("id, track_id, expires_at, user_wallet, access_token, stream_id")
          .eq("track_id", trackId)
          .eq("access_token", accessToken)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (!canonicalSession && !legacySession) {
      return jsonResponse({ error: "invalid_or_expired_session", code: "SESSION_EXPIRED" }, 403);
    }

    const { data: track, error: trackError } = await supabaseAdmin
      .from("music_tracks")
      .select("audio_path, title, artist")
      .eq("id", trackId)
      .single();

    if (trackError || !track) {
      return jsonResponse({ error: "track_not_found" }, 404);
    }

    if (!track.audio_path) {
      return jsonResponse({ error: "audio_file_not_available", code: "AUDIO_NOT_FOUND" }, 404);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from("audio")
      .createSignedUrl(track.audio_path, 600);

    if (signedUrlError || !signedUrlData) {
      return jsonResponse({ error: "failed_to_generate_stream_url" }, 500);
    }

    const session = canonicalSession || legacySession;

    return jsonResponse({
      url: signedUrlData.signedUrl,
      expires_at: session?.expires_at,
      mode_used: canonicalSession ? "canonical" : "legacy_bridge",
      track: {
        title: track.title,
        artist: track.artist,
      },
    });
  } catch (error) {
    console.error("[get-stream] unexpected_error", error);
    return jsonResponse({ error: "internal_server_error" }, 500);
  }
});
