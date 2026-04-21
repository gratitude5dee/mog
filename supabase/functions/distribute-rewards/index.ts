import { Contract, JsonRpcProvider, Wallet } from "npm:ethers@6";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APECHAIN_RPC_URL = "https://rpc.apechain.com";
const ERC20_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toTokenUnits(amount: string, decimals = 18) {
  const [whole, fraction = ""] = amount.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const { creatorWallet, amount, actionType, contentType, contentId, payerWallet } = await req.json();

    if (!creatorWallet || !amount) {
      return jsonResponse({ error: "missing_fields" }, 400);
    }

    const adminPrivateKey = Deno.env.get("ADMIN_PRIVATE_KEY");
    const tokenAddress = Deno.env.get("FIVE_DEE_TOKEN_ADDRESS");

    if (!adminPrivateKey || !tokenAddress) {
      return jsonResponse({ error: "missing_env" }, 500);
    }

    const provider = new JsonRpcProvider(APECHAIN_RPC_URL);
    const signer = new Wallet(adminPrivateKey, provider);
    const contract = new Contract(tokenAddress, ERC20_ABI, signer);
    const tx = await contract.transfer(creatorWallet, toTokenUnits(String(amount)));
    const receipt = await tx.wait();

    if (!receipt?.hash) {
      throw new Error("transaction_receipt_missing");
    }

    if (contentType && contentId && payerWallet) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

        await supabase
          .from("engagement_payouts")
          .upsert({
            content_type: contentType,
            content_id: contentId,
            action_type: actionType ?? "like",
            payer_wallet: String(payerWallet).toLowerCase(),
            creator_wallet: String(creatorWallet).toLowerCase(),
            amount: Number(amount),
            tx_hash: receipt.hash,
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          }, {
            onConflict: "content_type,content_id,action_type,payer_wallet",
          });
      }
    }

    return jsonResponse({
      success: true,
      transactionHash: receipt.hash,
      actionType,
    });
  } catch (error) {
    console.error("[distribute-rewards]", error);
    return jsonResponse({ error: "transaction_failed" }, 500);
  }
});
