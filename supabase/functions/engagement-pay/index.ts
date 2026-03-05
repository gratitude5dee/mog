import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getSupabaseAdminClient,
  verifyAndConsumeWalletProof,
  walletProofCorsHeaders,
  WalletProofPayload,
} from "../_shared/wallet-proof.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();

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
      return jsonResponse({ error: "missing_required_fields" }, 400);
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return jsonResponse({ error: "invalid_content_type" }, 400);
    }

    if (!ALLOWED_ACTIONS.has(actionType)) {
      return jsonResponse({ error: "invalid_action_type" }, 400);
    }

    if (!isInternalServiceCall) {
      const proofResult = await verifyAndConsumeWalletProof(supabaseAdmin, walletProof);
      if (!proofResult.ok) {
        return jsonResponse({ error: proofResult.error }, proofResult.status);
      }

      if (proofResult.address !== payerWallet) {
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
      return jsonResponse({ error: "content_not_found" }, 404);
    }

    const creatorWallet = String((contentRow as unknown as Record<string, unknown>)[sourceWalletField] || "").toLowerCase();

    if (!creatorWallet) {
      return jsonResponse({ error: "creator_wallet_missing" }, 404);
    }

    if (creatorWallet === payerWallet) {
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
      return jsonResponse({ error: "payout_insert_failed" }, 500);
    }

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
