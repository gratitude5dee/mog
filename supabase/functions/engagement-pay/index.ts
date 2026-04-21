import {
  getSupabaseAdminClient,
  verifyAndConsumeWalletProof,
  walletProofCorsHeaders,
  WalletProofPayload,
} from "../_shared/wallet-proof.ts";
import { logOpsEvent } from "../_shared/ops-log.ts";

const corsHeaders = {
  ...walletProofCorsHeaders,
};

const PAYOUT_RATES: Record<string, number> = {
  view: 1,
  like: 5,
  comment: 10,
  share: 3,
  bookmark: 2,
};

const ALLOWED_CONTENT_TYPES = new Set(["track", "video", "article", "mog_post"]);
const ALLOWED_ACTIONS = new Set(Object.keys(PAYOUT_RATES));

function generateMockTxHash(): string {
  const chars = "0123456789abcdef";
  let hash = "0x";
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
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

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const startedAt = Date.now();
    const supabaseAdmin = getSupabaseAdminClient();
    const emit = async (
      level: "info" | "warn" | "error",
      eventName: string,
      outcome: string,
      modeUsed: string | null = null,
      metadata: Record<string, unknown> = {},
    ) =>
      await logOpsEvent(supabaseAdmin, {
        component: "engagement-pay",
        event_name: eventName,
        level,
        mode_used: modeUsed,
        outcome,
        metadata: {
          latency_ms: Date.now() - startedAt,
          ...metadata,
        },
      });

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const isInternalServiceCall = authHeader === `Bearer ${serviceRoleKey}`;

    const payload = await req.json();
    const contentType = String(payload?.content_type || "");
    const contentId = String(payload?.content_id || "");
    const actionType = String(payload?.action_type || "");
    const payerWallet = String(payload?.payer_wallet || "").toLowerCase();
    const walletProof = (payload?.wallet_proof || null) as WalletProofPayload | null;

    if (!contentType || !contentId || !actionType || !payerWallet) {
      await emit("warn", "engagement_pay_validation_failed", "error", null, {
        error: "missing_required_fields",
      });
      return jsonResponse({ error: "missing_required_fields" }, 400);
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      await emit("warn", "engagement_pay_validation_failed", "error", null, {
        error: "invalid_content_type",
        content_type: contentType,
      });
      return jsonResponse({ error: "invalid_content_type" }, 400);
    }

    if (!ALLOWED_ACTIONS.has(actionType)) {
      await emit("warn", "engagement_pay_validation_failed", "error", null, {
        error: "invalid_action_type",
        action_type: actionType,
      });
      return jsonResponse({ error: "invalid_action_type" }, 400);
    }

    if (!isInternalServiceCall) {
      const proofResult = await verifyAndConsumeWalletProof(supabaseAdmin, walletProof);
      if (!proofResult.ok) {
        await emit("warn", "engagement_pay_wallet_proof_failed", "error", null, {
          error: proofResult.error,
          content_type: contentType,
          action_type: actionType,
          payer_wallet: payerWallet,
        });
        return jsonResponse({ error: proofResult.error }, proofResult.status);
      }

      if (proofResult.address !== payerWallet) {
        await emit("warn", "engagement_pay_wallet_proof_failed", "error", null, {
          error: "wallet_proof_mismatch",
          content_type: contentType,
          action_type: actionType,
          payer_wallet: payerWallet,
        });
        return jsonResponse({ error: "wallet_proof_mismatch" }, 403);
      }
    }

    // Payout configuration
    const { data: configData } = await supabaseAdmin
      .from("token_config")
      .select("payout_amount, is_enabled, daily_cap_per_user")
      .eq("action_type", actionType)
      .maybeSingle();

    const payoutAmount = configData?.payout_amount ?? PAYOUT_RATES[actionType];
    const isEnabled = configData?.is_enabled ?? true;
    const dailyCap = configData?.daily_cap_per_user ?? 100;

    if (!isEnabled) {
      await emit("info", "engagement_pay_skipped", "skipped", null, {
        error: "payout_disabled",
        content_type: contentType,
        action_type: actionType,
        payer_wallet: payerWallet,
      });
      return jsonResponse({ error: "payout_disabled", skipped: true });
    }

    // Resolve creator wallet by content type
    let sourceTable = "";
    let sourceWalletField = "";

    if (contentType === "track") {
      sourceTable = "music_tracks";
      sourceWalletField = "artist_wallet";
    } else if (contentType === "video") {
      sourceTable = "music_videos";
      sourceWalletField = "artist_wallet";
    } else if (contentType === "mog_post") {
      sourceTable = "mog_posts";
      sourceWalletField = "creator_wallet";
    } else {
      sourceTable = "articles";
      sourceWalletField = "author_wallet";
    }

    const { data: contentRow, error: contentError } = await supabaseAdmin
      .from(sourceTable)
      .select(`id, ${sourceWalletField}`)
      .eq("id", contentId)
      .single();

    if (contentError || !contentRow) {
      await emit("warn", "engagement_pay_skipped", "error", null, {
        error: "content_not_found",
        content_type: contentType,
        content_id: contentId,
      });
      return jsonResponse({ error: "content_not_found" }, 404);
    }

    const creatorWallet = String((contentRow as Record<string, unknown>)[sourceWalletField] || "").toLowerCase();

    if (!creatorWallet) {
      await emit("warn", "engagement_pay_skipped", "error", null, {
        error: "creator_wallet_missing",
        content_type: contentType,
        content_id: contentId,
      });
      return jsonResponse({ error: "creator_wallet_missing" }, 404);
    }

    if (creatorWallet === payerWallet) {
      await emit("info", "engagement_pay_skipped", "skipped", null, {
        error: "self_engagement_blocked",
        content_type: contentType,
        content_id: contentId,
        action_type: actionType,
        payer_wallet: payerWallet,
      });
      return jsonResponse({ error: "self_engagement_blocked", skipped: true });
    }

    // Duplicate check
    const { data: existingPayout } = await supabaseAdmin
      .from("engagement_payouts")
      .select("id")
      .eq("content_type", contentType)
      .eq("content_id", contentId)
      .eq("action_type", actionType)
      .eq("payer_wallet", payerWallet)
      .maybeSingle();

    if (existingPayout) {
      await emit("info", "engagement_pay_skipped", "skipped", null, {
        error: "already_rewarded",
        content_type: contentType,
        content_id: contentId,
        action_type: actionType,
        payer_wallet: payerWallet,
      });
      return jsonResponse({ error: "already_rewarded", skipped: true });
    }

    // Daily cap per payer
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const { count: payoutCountToday } = await supabaseAdmin
      .from("engagement_payouts")
      .select("id", { count: "exact", head: true })
      .eq("payer_wallet", payerWallet)
      .gte("created_at", dayStart.toISOString());

    if ((payoutCountToday ?? 0) >= dailyCap) {
      await emit("info", "engagement_pay_skipped", "skipped", null, {
        error: "daily_cap_reached",
        content_type: contentType,
        action_type: actionType,
        payer_wallet: payerWallet,
      });
      return jsonResponse({ error: "daily_cap_reached", skipped: true });
    }

    const txHash = generateMockTxHash();

    const { data: payoutRow, error: payoutError } = await supabaseAdmin
      .from("engagement_payouts")
      .insert({
        content_type: contentType,
        content_id: contentId,
        action_type: actionType,
        payer_wallet: payerWallet,
        creator_wallet: creatorWallet,
        amount: payoutAmount,
        tx_hash: txHash,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (payoutError) {
      await emit("error", "engagement_pay_failed", "error", null, {
        error: "payout_insert_failed",
        content_type: contentType,
        content_id: contentId,
        action_type: actionType,
        payer_wallet: payerWallet,
      });
      return jsonResponse({ error: "payout_insert_failed" }, 500);
    }

    await emit("info", "engagement_pay_success", "success", null, {
      payout_id: payoutRow.id,
      content_type: contentType,
      content_id: contentId,
      action_type: actionType,
      payer_wallet: payerWallet,
      creator_wallet: creatorWallet,
      amount: payoutAmount,
      tx_hash: txHash,
    });

    return jsonResponse({
      success: true,
      simulation: true,
      payout_id: payoutRow.id,
      amount: payoutAmount,
      creator_wallet: creatorWallet,
      tx_hash: txHash,
    });
  } catch (error) {
    console.error("[engagement-pay]", error);
    return jsonResponse({ error: "internal_server_error" }, 500);
  }
});
