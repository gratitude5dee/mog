import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logOpsEvent } from "../_shared/ops-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type X402Mode = "legacy" | "gateway" | "auto";

type GatewayFailure = {
  status: number;
  error: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateAccessToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateTxHash(): string {
  const chars = "0123456789abcdef";
  let result = "0x";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function normalizeMode(value: string | null | undefined): X402Mode {
  const normalized = String(value || "legacy").toLowerCase();
  if (normalized === "gateway" || normalized === "auto") return normalized;
  return "legacy";
}

function getGatewayUrl(): string {
  return Deno.env.get("X402_GATEWAY_URL") || Deno.env.get("VITE_X402_GATEWAY_URL") || "http://localhost:4020";
}

function parseCanaryWallets(rawValue: string | null): Set<string> {
  return new Set(
    String(rawValue || "")
      .split(",")
      .map((wallet) => wallet.trim().toLowerCase())
      .filter((wallet) => /^0x[a-f0-9]{40}$/i.test(wallet)),
      .slice(0, 5),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const startedAt = Date.now();
    const body = await req.json();
    const trackId = String(body?.track_id || "");
    const payerWallet = String(body?.payer_wallet || "").toLowerCase();
    const requestedAmount = Number(body?.amount || 0);
    const modePreference = body?.mode_preference ? normalizeMode(body.mode_preference) : null;
    const envMode = normalizeMode(Deno.env.get("X402_MODE"));
    const effectiveMode = modePreference ?? envMode;

    if (!trackId || !payerWallet) {
      return jsonResponse({ error: "missing_track_id_or_payer_wallet" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const canaryWallets = parseCanaryWallets(Deno.env.get("X402_CANARY_WALLETS"));
    const walletInCanary = canaryWallets.size === 0 || canaryWallets.has(payerWallet);
    const emit = async (
      level: "info" | "warn" | "error",
      eventName: string,
      modeUsed: string | null,
      outcome: string,
      metadata: Record<string, unknown> = {},
      restoreSource: string | null = null,
    ) =>
      await logOpsEvent(supabaseAdmin, {
        component: "pay-stream",
        event_name: eventName,
        level,
        mode_used: modeUsed,
        restore_source: restoreSource,
        outcome,
        metadata: {
          track_id: trackId,
          wallet: payerWallet,
          latency_ms: Date.now() - startedAt,
          ...metadata,
        },
      });

    const { data: track, error: trackError } = await supabaseAdmin
      .from("music_tracks")
      .select("id, title, artist, price, artist_wallet")
      .eq("id", trackId)
      .single();

    if (trackError || !track) {
      await emit("warn", "pay_stream_track_not_found", effectiveMode, "error", {
        track_error: trackError?.message || null,
      });
      return jsonResponse({ error: "track_not_found" }, 404);
    }

    if (!track.artist_wallet) {
      await emit("warn", "pay_stream_artist_wallet_missing", effectiveMode, "error");
      return jsonResponse({ error: "artist_wallet_missing" }, 422);
    }

    const paymentAmount = requestedAmount > 0 ? requestedAmount : Number(track.price || 0);

    const createLegacySession = async (fallbackFrom: GatewayFailure | null) => {
      const txHash = generateTxHash();
      const accessToken = generateAccessToken();
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { data: sessionId, error: sessionError } = await supabaseAdmin.rpc("create_stream_session", {
        p_stream_id: streamId,
        p_track_id: track.id,
        p_payer_wallet: payerWallet,
        p_artist_wallet: track.artist_wallet,
        p_access_token: accessToken,
        p_expires_at: expiresAt,
        p_tx_hash: txHash,
      });

      if (sessionError || !sessionId) {
        console.error("[pay-stream] failed creating canonical stream session", sessionError);
        await emit("error", "pay_stream_legacy_session_create_failed", "legacy", "error", {
          fallback_from_gateway: Boolean(fallbackFrom),
          fallback_reason: fallbackFrom?.error || null,
          session_error: sessionError?.message || null,
        });
        return jsonResponse({ error: "failed_to_create_stream_session" }, 500);
      }

      await supabaseAdmin.from("music_streams").upsert(
        {
          stream_id: streamId,
          track_id: track.id,
          user_wallet: payerWallet,
          access_token: accessToken,
          expires_at: expiresAt,
        },
        { onConflict: "stream_id" },
      );

      await supabaseAdmin.from("music_transactions").insert({
        track_id: track.id,
        user_wallet: payerWallet,
        artist_wallet: track.artist_wallet,
        amount: paymentAmount,
        tx_hash: txHash,
        status: "confirmed",
      });

      console.log(
        JSON.stringify({
          event: "pay_stream_success",
          mode_used: "legacy",
          fallback_from_gateway: Boolean(fallbackFrom),
          track_id: track.id,
          wallet: payerWallet,
          session_id: sessionId,
        }),
      );
      await emit("info", "pay_stream_success", "legacy", "success", {
        fallback_from_gateway: Boolean(fallbackFrom),
        fallback_reason: fallbackFrom?.error || null,
        session_id: sessionId,
        tx_hash: txHash,
      });

      return jsonResponse({
        success: true,
        mode_used: "legacy",
        fallback_used: Boolean(fallbackFrom),
        fallback_reason: fallbackFrom?.error || null,
        stream: {
          id: sessionId,
          stream_id: streamId,
          track_id: track.id,
          access_token: accessToken,
          expires_at: expiresAt,
          tx_hash: txHash,
        },
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
        },
      });
    };

    const tryGateway = async (): Promise<Response | GatewayFailure> => {
      const gatewayUrl = getGatewayUrl();
      const response = await fetch(`${gatewayUrl}/api/pay/${track.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          walletAddress: payerWallet,
          recipient: String(track.artist_wallet || "").toLowerCase(),
          amount: paymentAmount,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.stream) {
        const failure = {
          status: response.status,
          error: payload?.error || "gateway_payment_failed",
        };
        console.warn(
          JSON.stringify({
            event: "pay_stream_gateway_failed",
            track_id: track.id,
            wallet: payerWallet,
            ...failure,
          }),
        );
        await emit("warn", "pay_stream_gateway_failed", "gateway", "error", {
          gateway_status: failure.status,
          gateway_error: failure.error,
        });
        return failure;
      }

      const stream = payload.stream as {
        id: string;
        stream_id: string;
        track_id: string;
        access_token: string;
        expires_at: string;
      };
      const txHash = String(payload.txHash || generateTxHash());

      await supabaseAdmin.from("music_streams").upsert(
        {
          stream_id: stream.stream_id,
          track_id: stream.track_id,
          user_wallet: payerWallet,
          access_token: stream.access_token,
          expires_at: stream.expires_at,
        },
        { onConflict: "stream_id" },
      );

      await supabaseAdmin.from("music_transactions").insert({
        track_id: track.id,
        user_wallet: payerWallet,
        artist_wallet: track.artist_wallet,
        amount: paymentAmount,
        tx_hash: txHash,
        status: "confirmed",
      });

      console.log(
        JSON.stringify({
          event: "pay_stream_success",
          mode_used: "gateway",
          fallback_from_gateway: false,
          track_id: track.id,
          wallet: payerWallet,
          session_id: stream.id,
        }),
      );
      await emit("info", "pay_stream_success", "gateway", "success", {
        fallback_from_gateway: false,
        session_id: stream.id,
        tx_hash: txHash,
      });

      return jsonResponse({
        success: true,
        mode_used: "gateway",
        fallback_used: false,
        stream: {
          id: stream.id,
          stream_id: stream.stream_id,
          track_id: stream.track_id,
          access_token: stream.access_token,
          expires_at: stream.expires_at,
          tx_hash: txHash,
        },
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
        },
      });
    };

    if (effectiveMode === "auto" && !walletInCanary) {
      await emit("info", "pay_stream_canary_bypass", "legacy", "success", {
        reason: "wallet_not_in_canary",
      });
      return await createLegacySession({
        status: 412,
        error: "wallet_not_in_canary",
      });
    }

    if (effectiveMode === "legacy") {
      return await createLegacySession(null);
    }

    if (effectiveMode === "gateway") {
      const gatewayResult = await tryGateway();
      if (gatewayResult instanceof Response) {
        return gatewayResult;
      }
      await emit("error", "pay_stream_gateway_mode_failed", "gateway", "error", {
        gateway_status: gatewayResult.status,
        gateway_error: gatewayResult.error,
      });
      return jsonResponse(
        {
          error: "gateway_mode_payment_failed",
          mode_used: "gateway",
          fallback_used: false,
          gateway_status: gatewayResult.status,
          gateway_error: gatewayResult.error,
        },
        gatewayResult.status >= 400 ? gatewayResult.status : 502,
      );
    }

    const gatewayResult = await tryGateway();
    if (gatewayResult instanceof Response) {
      return gatewayResult;
    }

    return await createLegacySession(gatewayResult);
  } catch (error) {
    console.error("[pay-stream] unexpected_error", error);
    return jsonResponse({ error: "internal_server_error" }, 500);
  }
});
