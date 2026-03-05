import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type X402Mode = "legacy" | "gateway" | "auto";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeMode(value: unknown): X402Mode {
  const normalized = String(value || "legacy").toLowerCase();
  if (normalized === "gateway" || normalized === "auto") return normalized;
  return "legacy";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const { track_id: trackId, payer_wallet: payerWallet, mode_preference: modePreferenceRaw } = await req.json();
    const wallet = String(payerWallet || "").toLowerCase();
    const modePreference = normalizeMode(modePreferenceRaw);

    if (!trackId || !wallet) {
      return jsonResponse({ error: "missing_track_id_or_payer_wallet" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const nowIso = new Date().toISOString();

    const { data: canonicalSession } = await supabaseAdmin
      .from("stream_sessions")
      .select("id, stream_id, track_id, access_token, expires_at, created_at")
      .eq("track_id", trackId)
      .eq("payer_wallet", wallet)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (canonicalSession) {
      return jsonResponse({
        success: true,
        mode_used: "canonical",
        restore_source: "stream_sessions",
        stream: canonicalSession,
      });
    }

    if (modePreference === "gateway") {
      return jsonResponse({ success: false, mode_used: "gateway", error: "not_found" }, 404);
    }

    const { data: legacySession } = await supabaseAdmin
      .from("music_streams")
      .select("id, stream_id, track_id, access_token, expires_at, created_at")
      .eq("track_id", trackId)
      .eq("user_wallet", wallet)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!legacySession) {
      return jsonResponse({ success: false, mode_used: "legacy", error: "not_found" }, 404);
    }

    return jsonResponse({
      success: true,
      mode_used: "legacy",
      restore_source: "music_streams",
      stream: legacySession,
    });
  } catch (error) {
    console.error("[stream-session-active] unexpected_error", error);
    return jsonResponse({ error: "internal_server_error" }, 500);
  }
});
