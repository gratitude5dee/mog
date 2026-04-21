import { createThirdwebClient, getContract, defineChain, type ThirdwebClient } from "thirdweb";
import { inAppWallet, createWallet } from "thirdweb/wallets";
import { supabase } from "@/integrations/supabase/client";

// ApeChain (Mainnet)
export const apeChain = defineChain({
  id: 33139,
  name: "ApeChain",
  rpc: "https://rpc.apechain.com",
  nativeCurrency: { name: "ApeCoin", symbol: "APE", decimals: 18 },
});

// $5DEE token contract (replace with actual address)
export const FIVE_DEE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

// ----- Async client loader (fetches client ID from Supabase edge function) -----
let cachedClient: ThirdwebClient | null = null;
let inflight: Promise<ThirdwebClient> | null = null;
let configured = false;

async function fetchClientId(): Promise<string> {
  // 1. Try VITE env var first (works in dev without an edge call).
  const envId = import.meta.env.VITE_THIRDWEB_CLIENT_ID as string | undefined;
  if (envId && envId.trim().length > 0) return envId.trim();

  // 2. Fall back to Supabase edge function (uses THIRDWEB_CLIENT_ID secret).
  const { data, error } = await supabase.functions.invoke("get-thirdweb-config");
  if (error) throw new Error(error.message || "Failed to fetch Thirdweb config");
  const clientId = (data as { clientId?: string } | null)?.clientId;
  if (!clientId) throw new Error("Thirdweb client ID missing in response");
  return clientId;
}

export async function getThirdwebClient(): Promise<ThirdwebClient> {
  if (cachedClient) return cachedClient;
  if (inflight) return inflight;

  inflight = (async () => {
    const clientId = await fetchClientId();
    cachedClient = createThirdwebClient({ clientId });
    configured = true;
    return cachedClient;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getThirdwebClientSync(): ThirdwebClient | null {
  return cachedClient;
}

export function isThirdwebReady(): boolean {
  return configured && cachedClient !== null;
}

// Wallets list (constructors are pure, safe to create eagerly).
export const wallets = [
  inAppWallet({
    auth: { options: ["google", "apple", "email", "passkey"] },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("walletConnect"),
];

// Token contract (lazy — built once client is ready).
export async function getTokenContract() {
  const client = await getThirdwebClient();
  return getContract({ client, chain: apeChain, address: FIVE_DEE_TOKEN_ADDRESS });
}

// ----- Compatibility shim -----
// Some existing modules import `thirdwebClient` directly. Provide a Proxy that
// throws a clear error if used before initialization, so misuse is loud (not silent).
export const thirdwebClient: ThirdwebClient = new Proxy({} as ThirdwebClient, {
  get(_target, prop) {
    if (!cachedClient) {
      // Kick off load in background so subsequent reads succeed.
      void getThirdwebClient();
      throw new Error(
        "thirdwebClient used before initialization. Use `await getThirdwebClient()` instead."
      );
    }
    return (cachedClient as unknown as Record<string | symbol, unknown>)[prop as string];
  },
});

// Back-compat: deprecated, prefer `isThirdwebReady()`.
export const isThirdwebConfigured = true;

export const walletConfig = { chain: apeChain };
