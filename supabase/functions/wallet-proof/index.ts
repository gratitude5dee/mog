import {
  createWalletChallenge,
  getSupabaseAdminClient,
  walletProofCorsHeaders,
} from "../_shared/wallet-proof.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...walletProofCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: walletProofCorsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = await req.json();
    const address = String(body?.address || "").toLowerCase();
    const action = String(body?.action || "").trim();

    if (!address || !action) {
      return jsonResponse({ error: "missing_address_or_action" }, 400);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return jsonResponse({ error: "invalid_wallet_address" }, 400);
    }

    if (!/^[a-z0-9_:\-]{3,64}$/i.test(action)) {
      return jsonResponse({ error: "invalid_action" }, 400);
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const challenge = await createWalletChallenge(supabaseAdmin, address, action);

    return jsonResponse({ success: true, challenge });
  } catch (error) {
    console.error("[wallet-proof]", error);
    return jsonResponse({ error: "challenge_failed" }, 500);
  }
});
