import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMessage } from "npm:ethers@6";

export type WalletProofPayload = {
  address: string;
  action: string;
  nonce: string;
  message: string;
  signature: string;
};

type VerifyWalletProofResult =
  | { ok: true; address: string; action: string }
  | { ok: false; status: number; error: string };

export const walletProofCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function getSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function createWalletChallenge(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  address: string,
  action: string,
) {
  const normalizedAddress = address.toLowerCase();
  const nonce = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const message = [
    "Mog Wallet Proof",
    `Action: ${action}`,
    `Address: ${normalizedAddress}`,
    `Nonce: ${nonce}`,
    `IssuedAt: ${issuedAt}`,
  ].join("\n");

  const { error } = await supabaseAdmin.from("wallet_nonces").insert({
    nonce,
    wallet_address: normalizedAddress,
    action,
    message,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create wallet challenge: ${error.message}`);
  }

  return {
    nonce,
    message,
    expires_at: expiresAt,
  };
}

export async function verifyAndConsumeWalletProof(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  payload: WalletProofPayload | null | undefined,
): Promise<VerifyWalletProofResult> {
  if (!payload) {
    return { ok: false, status: 401, error: "missing_wallet_proof" };
  }

  const { address, action, nonce, message, signature } = payload;
  if (!address || !action || !nonce || !message || !signature) {
    return { ok: false, status: 401, error: "invalid_wallet_proof" };
  }

  const normalizedAddress = address.toLowerCase();

  try {
    const recovered = verifyMessage(message, signature).toLowerCase();
    if (recovered !== normalizedAddress) {
      return { ok: false, status: 401, error: "wallet_signature_mismatch" };
    }
  } catch (_error) {
    return { ok: false, status: 401, error: "wallet_signature_invalid" };
  }

  const { data: nonceRow, error: nonceError } = await supabaseAdmin
    .from("wallet_nonces")
    .select("id, expires_at, consumed_at")
    .eq("nonce", nonce)
    .eq("wallet_address", normalizedAddress)
    .eq("action", action)
    .eq("message", message)
    .maybeSingle();

  if (nonceError) {
    return { ok: false, status: 500, error: "wallet_nonce_lookup_failed" };
  }

  if (!nonceRow) {
    return { ok: false, status: 401, error: "wallet_nonce_not_found" };
  }

  if (nonceRow.consumed_at) {
    return { ok: false, status: 401, error: "wallet_nonce_already_used" };
  }

  if (new Date(nonceRow.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 401, error: "wallet_nonce_expired" };
  }

  const { error: consumeError } = await supabaseAdmin
    .from("wallet_nonces")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", nonceRow.id)
    .is("consumed_at", null);

  if (consumeError) {
    return { ok: false, status: 500, error: "wallet_nonce_consume_failed" };
  }

  return { ok: true, address: normalizedAddress, action };
}
